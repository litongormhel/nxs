"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function setCommissionRate(
  serviceId: string,
  percent: number,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: closeError } = await supabase
    .from("commission_rates")
    .update({ effective_to: new Date().toISOString(), is_active: false })
    .eq("service_id", serviceId)
    .eq("is_active", true);
  if (closeError) return fail(closeError);

  const { error: insertError } = await supabase.from("commission_rates").insert({
    service_id: serviceId,
    percent,
    created_by: staffId,
  });
  if (insertError) return fail(insertError);

  revalidatePath("/analytics");
  return { ok: true };
}
