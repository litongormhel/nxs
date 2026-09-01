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
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
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

export async function voidSale(saleId: string, actorStaffId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("sales")
    .update({
      voided: true,
      voided_by: actorStaffId,
      voided_at: new Date().toISOString(),
    })
    .eq("id", saleId);

  if (error) return fail(error);

  await logAction(supabase, actorStaffId, "sale_void", `sale_id=${saleId}`);

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
