"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };
type CreateTherapistResult = { ok: true; id: string } | { ok: false; error: string };

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

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function createTherapist(
  name: string,
  dayOffWeekdays: number[],
  staffId: string
): Promise<CreateTherapistResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapists")
    .insert({ name })
    .select("id")
    .single();
  if (error || !data) return fail(error ?? "Could not create therapist");

  if (dayOffWeekdays.length > 0) {
    const { error: dayOffError } = await supabase
      .from("therapist_day_off")
      .insert(dayOffWeekdays.map((weekday) => ({ therapist_id: data.id, weekday })));
    if (dayOffError) return fail(dayOffError);
  }

  await logAction(supabase, staffId, "therapist_create", `therapist=${data.id} name=${name}`);
  revalidatePath("/therapists");
  revalidatePath("/bookings");
  return { ok: true, id: data.id };
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
