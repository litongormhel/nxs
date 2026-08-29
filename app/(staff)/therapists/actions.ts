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

export async function toggleDayOff(
  therapistId: string,
  weekday: number,
  turningOff: boolean,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = turningOff
    ? await supabase
        .from("therapist_day_off")
        .insert({ therapist_id: therapistId, weekday })
    : await supabase
        .from("therapist_day_off")
        .delete()
        .eq("therapist_id", therapistId)
        .eq("weekday", weekday);
  if (error) return fail(error);
  await logAction(
    supabase,
    staffId,
    "therapist_toggle_day_off",
    `therapist=${therapistId} weekday=${weekday} off=${turningOff}`
  );
  revalidatePath("/therapists");
  return { ok: true };
}
