"use server";

import { revalidatePath } from "next/cache";
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
  const supabase = await createClient();

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
}

export type VoidSaleInput = {
  saleId: string;
  pin: string;
  reason: string;
  staffId: string;
};

export async function voidSale(
  input: VoidSaleInput | string,
  legacyStaffId?: string
): Promise<ActionResult> {
  let saleId: string;
  let pin: string;
  let reason: string;
  let staffId: string;

  if (typeof input === "object" && input !== null) {
    saleId = input.saleId;
    pin = input.pin;
    reason = input.reason;
    staffId = input.staffId;
  } else {
    saleId = input;
    pin = "";
    reason = "Direct void";
    staffId = legacyStaffId ?? "";
  }

  const formattedStaffId = staffId && staffId.trim() ? staffId.trim() : null;

  if (!pin || !pin.trim()) {
    return { ok: false, error: "Manager PIN is required." };
  }

  if (!reason || !reason.trim()) {
    return { ok: false, error: "Reason for void is required." };
  }

  const adminClient = createStaffServiceClient();

  // Step 1: Fetch void_auth_code_hash from app_settings
  const { data: settings, error: settingsError } = await adminClient
    .from("app_settings")
    .select("void_auth_code_hash")
    .single();

  if (settingsError || !settings?.void_auth_code_hash) {
    return {
      ok: false,
      error: "Manager PIN is not configured yet. Ask Owner to set it in Settings.",
    };
  }

  // Step 2: Verify the provided pin against void_auth_code_hash
  const { data: isValid, error: pinError } = await adminClient.rpc(
    "verify_void_pin",
    { p_pin: pin.trim() }
  );

  if (pinError || !isValid) {
    return { ok: false, error: "Invalid Manager / Owner PIN." };
  }

  // Step 3: Directly update public.sales
  const { error: updateError } = await adminClient
    .from("sales")
    .update({
      voided: true,
      void_reason: reason.trim(),
      voided_at: new Date().toISOString(),
      voided_by: formattedStaffId,
    })
    .eq("id", saleId);

  if (updateError) {
    console.error("[voidSale Direct Update Error]:", updateError);
    return { ok: false, error: updateError.message || "Failed to void sale." };
  }

  // Step 4: Insert audit record into action_logs directly
  if (formattedStaffId) {
    await adminClient.from("action_logs").insert({
      staff_id: formattedStaffId,
      action: "sale_void",
      detail: `sale_id=${saleId} voided_by=${formattedStaffId} reason=${reason.trim()}`,
    });
  }

  // Step 5: Return { ok: true } and call revalidatePath("/sales")
  revalidatePath("/sales");
  return { ok: true };
}

export type RestoreSaleInput = {
  saleId: string;
  pin: string;
  reason: string;
  staffId: string;
};

export async function restoreSale(
  input: RestoreSaleInput
): Promise<ActionResult> {
  const saleId = input.saleId;
  const pin = input.pin;
  const reason = input.reason;
  const staffId = input.staffId;

  const formattedStaffId = staffId && staffId.trim() ? staffId.trim() : null;

  if (!pin || !pin.trim()) {
    return { ok: false, error: "Manager PIN is required." };
  }

  if (!reason || !reason.trim()) {
    return { ok: false, error: "Reason for restore is required." };
  }

  const adminClient = createStaffServiceClient();

  // Step 1: Fetch void_auth_code_hash from app_settings
  const { data: settings, error: settingsError } = await adminClient
    .from("app_settings")
    .select("void_auth_code_hash")
    .single();

  if (settingsError || !settings?.void_auth_code_hash) {
    return {
      ok: false,
      error: "Manager PIN is not configured yet. Ask Owner to set it in Settings.",
    };
  }

  // Step 2: Verify the provided pin against void_auth_code_hash
  const { data: isValid, error: pinError } = await adminClient.rpc(
    "verify_void_pin",
    { p_pin: pin.trim() }
  );

  if (pinError || !isValid) {
    return { ok: false, error: "Invalid Manager / Owner PIN." };
  }

  // Step 3: Directly update public.sales
  const { error: updateError } = await adminClient
    .from("sales")
    .update({
      voided: false,
      void_reason: null,
      voided_at: null,
      voided_by: null,
    })
    .eq("id", saleId);

  if (updateError) {
    console.error("[restoreSale Direct Update Error]:", updateError);
    return { ok: false, error: updateError.message || "Failed to restore sale." };
  }

  // Step 4: Insert audit record into action_logs directly
  if (formattedStaffId) {
    await adminClient.from("action_logs").insert({
      staff_id: formattedStaffId,
      action: "sale_restore",
      detail: `sale_id=${saleId} restored_by=${formattedStaffId} reason=${reason.trim()}`,
    });
  }

  // Step 5: Return { ok: true } and call revalidatePath("/sales")
  revalidatePath("/sales");
  return { ok: true };
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
}
