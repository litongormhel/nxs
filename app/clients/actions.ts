"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LogVisitInput = {
  clientId: string;
  serviceId: string;
  // TEMP: placeholder actor pending Staff Auth phase — selected manually
  // from the staff directory until sessions/auth.uid() exist.
  staffId: string;
  isRedemption: boolean;
  paymentMethod: "Cash" | "GCash" | "Card" | "Points";
  amount: number;
  paymentRef?: string;
};

export type LogVisitResult =
  | { ok: true; ledgerId: string; saleId: string | null }
  | { ok: false; error: string };

export async function logVisit(input: LogVisitInput): Promise<LogVisitResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("log_visit", {
    p_client_id: input.clientId,
    p_service_id: input.serviceId,
    p_staff_id: input.staffId,
    p_is_redemption: input.isRedemption,
    p_payment_method: input.paymentMethod,
    p_amount: input.amount,
    p_payment_ref: input.paymentRef,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data?.[0];
  if (!row) {
    return { ok: false, error: "log_visit returned no result." };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  return { ok: true, ledgerId: row.ledger_id, saleId: row.sale_id };
}
