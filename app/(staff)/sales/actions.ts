"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { createStaffServiceClient } from "@/lib/staff/service-client";

type ActionResult = { ok: true } | { ok: false; error: string };

async function logAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffId: string,
  action: string,
  detail: string
) {
  await supabase.from("action_logs").insert({
    staff_id: staffId,
    action,
    detail,
  });
}

function fail(error: unknown): ActionResult {
  const message =
    typeof error === "string"
      ? error
      : (error as any)?.message || String(error);
  console.error("[Sales Action Error]:", error);
  return { ok: false, error: message };
}

function verifyVoidPin(pin: string, storedHash: string): boolean {
  if (!storedHash) return false;
  const trimmedPin = pin.trim();
  if (storedHash.startsWith("$2")) {
    try {
      return bcrypt.compareSync(trimmedPin, storedHash);
    } catch (e) {
      console.error("[PIN verify error]:", e);
      return false;
    }
  }
  return trimmedPin === storedHash;
}

const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function checkPinRateLimit(
  adminClient: ReturnType<typeof createStaffServiceClient>,
  staffId: string
): Promise<ActionResult | null> {
  const { data: attempt } = await adminClient
    .from("sale_void_attempts")
    .select("failed_count, locked_until")
    .eq("staff_id", staffId)
    .maybeSingle();

  if (attempt?.locked_until) {
    const lockUntilMs = new Date(attempt.locked_until).getTime();
    const remainingMs = lockUntilMs - Date.now();
    if (remainingMs > 0) {
      const remainingMins = Math.ceil(remainingMs / (60 * 1000));
      return {
        ok: false,
        error: `Too many failed PIN attempts. Account locked. Please try again in ${remainingMins} minute(s).`,
      };
    }
  }
  return null;
}

async function recordPinFailure(
  adminClient: ReturnType<typeof createStaffServiceClient>,
  staffId: string
): Promise<ActionResult> {
  const { data: attempt } = await adminClient
    .from("sale_void_attempts")
    .select("failed_count")
    .eq("staff_id", staffId)
    .maybeSingle();

  const newFailedCount = (attempt?.failed_count ?? 0) + 1;

  if (newFailedCount >= MAX_PIN_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    await adminClient.from("sale_void_attempts").upsert({
      staff_id: staffId,
      failed_count: 0,
      locked_until: lockUntil,
      updated_at: new Date().toISOString(),
    });
    return {
      ok: false,
      error: "Too many failed PIN attempts. Account locked for 5 minutes.",
    };
  }

  await adminClient.from("sale_void_attempts").upsert({
    staff_id: staffId,
    failed_count: newFailedCount,
    locked_until: null,
    updated_at: new Date().toISOString(),
  });

  const remaining = MAX_PIN_ATTEMPTS - newFailedCount;
  return {
    ok: false,
    error: `Invalid Manager / Owner PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
  };
}

async function resetPinAttempts(
  adminClient: ReturnType<typeof createStaffServiceClient>,
  staffId: string
): Promise<void> {
  await adminClient.from("sale_void_attempts").upsert({
    staff_id: staffId,
    failed_count: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  });
}

async function getAuthenticatedStaff(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ id: string; position: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, position")
    .eq("user_id", user.id)
    .single();

  if (!staffRow) return null;
  return { id: staffRow.id, position: staffRow.position };
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Guard for the 3-day lapse rule.
 * Fetches the sale's created_at, and if it is older than 3 days (72 h)
 * verifies that the caller's authenticated session belongs to an Owner.
 * Returns an ActionResult error if access should be denied, or null to allow.
 */
async function guardLapsedSale(
  adminClient: ReturnType<typeof createStaffServiceClient>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleId: string
): Promise<ActionResult | null> {
  const { data: sale, error: saleErr } = await adminClient
    .from("sales")
    .select("created_at")
    .eq("id", saleId)
    .single();

  if (saleErr || !sale) return { ok: false, error: "Sale not found." };

  const ageMs = Date.now() - new Date(sale.created_at).getTime();
  if (ageMs <= THREE_DAYS_MS) return null; // within 3 days — no restriction

  // Sale is lapsed: caller must be Owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: staffRow, error: staffErr } = await supabase
    .from("staff")
    .select("position")
    .eq("user_id", user.id)
    .single();

  if (staffErr || !staffRow) {
    return { ok: false, error: "Could not verify staff role." };
  }

  if (staffRow.position !== "Owner") {
    return {
      ok: false,
      error: "Sales older than 3 days can only be modified or voided by the Owner.",
    };
  }

  return null; // caller is Owner — allowed
}

export async function editSale(
  saleId: string,
  updates: {
    amount: number;
    paymentMethod: string;
    paymentRef: string | null;
    therapistId: string | null;
  },
  actorStaffId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const adminClient = createStaffServiceClient();

    // 3-day lapse guard: non-Owner cannot edit sales older than 3 days
    const lapseErr = await guardLapsedSale(adminClient, supabase, saleId);
    if (lapseErr) return lapseErr;

    const { error } = await supabase
      .from("sales")
      .update({
        amount: updates.amount,
        payment_method: updates.paymentMethod,
        payment_ref: updates.paymentRef,
        therapist_id: updates.therapistId,
        edited_by: actorStaffId,
        edited_at: new Date().toISOString(),
      })
      .eq("id", saleId);

    if (error) return fail(error);

    await logAction(
      supabase,
      actorStaffId,
      "sale_edit",
      `sale_id=${saleId} amount=${updates.amount} payment=${updates.paymentMethod}`
    );

    revalidatePath("/sales");
    return { ok: true };
  } catch (err: any) {
    return fail(err);
  }
}

export type EditSplitLegInput = {
  saleId: string;
  amount: number;
  paymentMethod: string;
  paymentRef: string | null;
};

export async function editSplitSale(
  legs: EditSplitLegInput[],
  therapistId: string | null,
  actorStaffId: string
): Promise<ActionResult> {
  try {
    if (!legs || legs.length === 0) {
      return { ok: false, error: "No legs to update." };
    }
    for (const leg of legs) {
      if (isNaN(leg.amount) || leg.amount < 0) {
        return { ok: false, error: "Enter valid amounts for all payment portions." };
      }
    }

    const supabase = await createClient();
    const adminClient = createStaffServiceClient();

    // Check 3-day lapse guard for each leg
    for (const leg of legs) {
      const lapseErr = await guardLapsedSale(adminClient, supabase, leg.saleId);
      if (lapseErr) return lapseErr;
    }

    const now = new Date().toISOString();
    for (const leg of legs) {
      const { error } = await supabase
        .from("sales")
        .update({
          amount: leg.amount,
          payment_method: leg.paymentMethod,
          payment_ref: leg.paymentRef,
          therapist_id: therapistId,
          edited_by: actorStaffId,
          edited_at: now,
        })
        .eq("id", leg.saleId);

      if (error) return fail(error);
    }

    const details = legs.map((l) => `${l.saleId}:${l.amount}(${l.paymentMethod})`).join("; ");
    await logAction(
      supabase,
      actorStaffId,
      "sale_edit",
      `split_edit legs=[${details}] therapist=${therapistId ?? "none"}`
    );

    revalidatePath("/sales");
    return { ok: true };
  } catch (err: any) {
    return fail(err);
  }
}

export type VoidSaleInput = {
  saleId?: string;
  saleIds?: string[];
  pin: string;
  reason: string;
  staffId: string;
};

export async function voidSale(
  input: VoidSaleInput | string,
  legacyStaffId?: string
): Promise<ActionResult> {
  try {
    let targetIds: string[] = [];
    let pin: string;
    let reason: string;

    if (typeof input === "object" && input !== null) {
      if (input.saleIds && input.saleIds.length > 0) {
        targetIds = input.saleIds;
      } else if (input.saleId) {
        targetIds = [input.saleId];
      }
      pin = input.pin;
      reason = input.reason;
    } else {
      targetIds = [input];
      pin = "";
      reason = "Direct void";
    }

    if (targetIds.length === 0) {
      return { ok: false, error: "No sale ID specified." };
    }

    if (!pin || !pin.trim()) {
      return { ok: false, error: "Manager PIN is required." };
    }

    if (!reason || !reason.trim()) {
      return { ok: false, error: "Reason for void is required." };
    }

    const supabase = await createClient();
    const adminClient = createStaffServiceClient();

    // Resolve authenticated staff member via session, never trusting client-supplied staffId
    const callerStaff = await getAuthenticatedStaff(supabase);
    if (!callerStaff) {
      return { ok: false, error: "Not signed in or unrecognized staff profile." };
    }
    const authenticatedStaffId = callerStaff.id;

    // Rate-limiting / failure throttle check before verifying PIN
    const lockoutErr = await checkPinRateLimit(adminClient, authenticatedStaffId);
    if (lockoutErr) return lockoutErr;

    // Step 1: Fetch void_auth_code_hash directly from app_settings via privileged admin client
    const { data: settings, error: settingsError } = await adminClient
      .from("app_settings")
      .select("void_auth_code_hash")
      .limit(1)
      .single();

    if (settingsError || !settings?.void_auth_code_hash) {
      return {
        ok: false,
        error: "Manager PIN is not configured yet. Ask Owner to set it in Settings.",
      };
    }

    // Step 2: Verify the provided pin against void_auth_code_hash
    const isValid = verifyVoidPin(pin, settings.void_auth_code_hash);

    if (!isValid) {
      return await recordPinFailure(adminClient, authenticatedStaffId);
    }

    // Reset failed attempts on valid PIN entry
    await resetPinAttempts(adminClient, authenticatedStaffId);

    // Step 2b: 3-day lapse guard — non-Owner cannot void sales older than 3 days
    for (const id of targetIds) {
      const lapseErr = await guardLapsedSale(adminClient, supabase, id);
      if (lapseErr) return lapseErr;
    }

    // Step 3: Directly update public.sales with fallback if void_reason column is not in DB cache
    let { error: updateError } = await adminClient
      .from("sales")
      .update({
        voided: true,
        void_reason: reason.trim(),
        voided_at: new Date().toISOString(),
        voided_by: authenticatedStaffId,
      })
      .in("id", targetIds);

    if (updateError && updateError.message?.includes("void_reason")) {
      console.warn(
        "[voidSale] void_reason column not found in schema cache. Falling back to update without void_reason. Audit log preserves reason."
      );
      const fallback = await adminClient
        .from("sales")
        .update({
          voided: true,
          voided_at: new Date().toISOString(),
          voided_by: authenticatedStaffId,
        })
        .in("id", targetIds);
      updateError = fallback.error;
    }

    if (updateError) {
      console.error("[voidSale Direct Update Error]:", updateError);
      return { ok: false, error: updateError.message || "Failed to void sale." };
    }

    // Step 4: Insert audit record into action_logs directly (ensures reason is always persisted)
    await adminClient.from("action_logs").insert({
      staff_id: authenticatedStaffId,
      action: "sale_void",
      detail: `sale_ids=${targetIds.join(",")} voided_by=${authenticatedStaffId} reason=${reason.trim()}`,
    });

    // Step 5: Return { ok: true } and call revalidatePath("/sales")
    revalidatePath("/sales");
    return { ok: true };
  } catch (err: any) {
    return fail(err);
  }
}

export type RestoreSaleInput = {
  saleId?: string;
  saleIds?: string[];
  pin: string;
  reason: string;
  staffId: string;
};

export async function restoreSale(
  input: RestoreSaleInput
): Promise<ActionResult> {
  try {
    let targetIds: string[] = [];
    if (input.saleIds && input.saleIds.length > 0) {
      targetIds = input.saleIds;
    } else if (input.saleId) {
      targetIds = [input.saleId];
    }

    if (targetIds.length === 0) {
      return { ok: false, error: "No sale ID specified." };
    }

    const pin = input.pin;
    const reason = input.reason;

    if (!pin || !pin.trim()) {
      return { ok: false, error: "Manager PIN is required." };
    }

    if (!reason || !reason.trim()) {
      return { ok: false, error: "Reason for restore is required." };
    }

    const supabase = await createClient();
    const adminClient = createStaffServiceClient();

    // Resolve authenticated staff member via session, never trusting client-supplied staffId
    const callerStaff = await getAuthenticatedStaff(supabase);
    if (!callerStaff) {
      return { ok: false, error: "Not signed in or unrecognized staff profile." };
    }
    const authenticatedStaffId = callerStaff.id;

    // Rate-limiting / failure throttle check before verifying PIN
    const lockoutErr = await checkPinRateLimit(adminClient, authenticatedStaffId);
    if (lockoutErr) return lockoutErr;

    // Step 1: Fetch void_auth_code_hash directly from app_settings via privileged admin client
    const { data: settings, error: settingsError } = await adminClient
      .from("app_settings")
      .select("void_auth_code_hash")
      .limit(1)
      .single();

    if (settingsError || !settings?.void_auth_code_hash) {
      return {
        ok: false,
        error: "Manager PIN is not configured yet. Ask Owner to set it in Settings.",
      };
    }

    // Step 2: Verify the provided pin against void_auth_code_hash
    const isValid = verifyVoidPin(pin, settings.void_auth_code_hash);

    if (!isValid) {
      return await recordPinFailure(adminClient, authenticatedStaffId);
    }

    // Reset failed attempts on valid PIN entry
    await resetPinAttempts(adminClient, authenticatedStaffId);

    // Step 3: Directly update public.sales with fallback if void_reason column is not in DB cache
    let { error: updateError } = await adminClient
      .from("sales")
      .update({
        voided: false,
        void_reason: null,
        voided_at: null,
        voided_by: null,
      })
      .in("id", targetIds);

    if (updateError && updateError.message?.includes("void_reason")) {
      console.warn(
        "[restoreSale] void_reason column not found in schema cache. Falling back to update without void_reason."
      );
      const fallback = await adminClient
        .from("sales")
        .update({
          voided: false,
          voided_at: null,
          voided_by: null,
        })
        .in("id", targetIds);
      updateError = fallback.error;
    }

    if (updateError) {
      console.error("[restoreSale Direct Update Error]:", updateError);
      return { ok: false, error: updateError.message || "Failed to restore sale." };
    }

    // Step 4: Insert audit record into action_logs directly
    await adminClient.from("action_logs").insert({
      staff_id: authenticatedStaffId,
      action: "sale_restore",
      detail: `sale_ids=${targetIds.join(",")} restored_by=${authenticatedStaffId} reason=${reason.trim()}`,
    });

    // Step 5: Return { ok: true } and call revalidatePath("/sales")
    revalidatePath("/sales");
    return { ok: true };
  } catch (err: any) {
    return fail(err);
  }
}

export type VoidWithCodeResult =
  | { ok: true }
  | { ok: false; reason: "locked"; retryAfter: string }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "invalid_code"; attemptsRemaining: number }
  | { ok: false; reason: "invalid_authorizer" }
  | { ok: false; reason: "error"; error: string };

export async function voidSaleWithCode(
  saleId: string,
  code: string,
  authorizingStaffId: string
): Promise<VoidWithCodeResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("void_sale_with_code", {
      p_sale_id: saleId,
      p_code: code,
      p_authorizing_staff_id: authorizingStaffId,
    });

    if (error) return { ok: false, reason: "error", error: error.message };

    const result = data as
      | { ok: true }
      | { ok: false; reason: "locked"; retry_after: string }
      | { ok: false; reason: "not_configured" }
      | { ok: false; reason: "invalid_code"; attempts_remaining: number }
      | { ok: false; reason: "invalid_authorizer" };

    if (result.ok) {
      revalidatePath("/sales");
      return { ok: true };
    }

    switch (result.reason) {
      case "locked":
        return { ok: false, reason: "locked", retryAfter: result.retry_after };
      case "invalid_code":
        return { ok: false, reason: "invalid_code", attemptsRemaining: result.attempts_remaining };
      default:
        return { ok: false, reason: result.reason };
    }
  } catch (err: any) {
    return { ok: false, reason: "error", error: err?.message || "Unexpected error occurred." };
  }
}

