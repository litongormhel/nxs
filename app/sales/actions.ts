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
