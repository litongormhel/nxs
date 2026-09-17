"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

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

  const { data, error } = await supabase.rpc("void_sale_with_pin", {
    p_sale_id: saleId,
    p_pin: pin,
    p_reason: reason,
    p_staff_id: staffId,
  });

  if (error) {
    console.error("[voidSale RPC Error]:", error);
    return { ok: false, error: error.message || String(error) };
  }

  const res = data as { ok?: boolean; success?: boolean; error?: string | { message?: string } } | null;
  if (!res || (res.ok !== true && res.success !== true)) {
    const errMsg =
      typeof res?.error === "string"
        ? res.error
        : res?.error?.message || "Failed to void sale.";
    console.error("[voidSale Failed]:", res);
    return { ok: false, error: errMsg };
  }

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
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("restore_sale_with_pin", {
    p_sale_id: input.saleId,
    p_pin: input.pin,
    p_reason: input.reason,
    p_staff_id: input.staffId,
  });

  if (error) {
    console.error("[restoreSale RPC Error]:", error);
    return { ok: false, error: error.message || String(error) };
  }

  const res = data as { ok?: boolean; success?: boolean; error?: string | { message?: string } } | null;
  if (!res || (res.ok !== true && res.success !== true)) {
    const errMsg =
      typeof res?.error === "string"
        ? res.error
        : res?.error?.message || "Failed to restore sale.";
    console.error("[restoreSale Failed]:", res);
    return { ok: false, error: errMsg };
  }

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
