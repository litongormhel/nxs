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

export async function markAbsentToday(
  therapistId: string,
  date: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: absenceError } = await supabase
    .from("therapist_absence")
    .upsert(
      { therapist_id: therapistId, absent_date: date, created_by: staffId },
      { onConflict: "therapist_id,absent_date", ignoreDuplicates: true }
    );
  if (absenceError) return fail(absenceError);

  const { data: flagged, error: flagError } = await supabase
    .from("bookings")
    .update({ status: "Needs Reassignment" })
    .eq("therapist_id", therapistId)
    .eq("booking_date", date)
    .eq("status", "Booked")
    .select("id");
  if (flagError) return fail(flagError);

  await logAction(
    supabase,
    staffId,
    "therapist_mark_absent",
    `therapist=${therapistId} date=${date} flagged=${flagged?.length ?? 0}`
  );
  revalidatePath("/therapists");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markOnLeave(
  therapistId: string,
  startDate: string,
  endDate: string,
  reason: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: leaveError } = await supabase.from("therapist_leave").insert({
    therapist_id: therapistId,
    start_date: startDate,
    end_date: endDate,
    reason: reason || null,
    created_by: staffId,
  });
  if (leaveError) return fail(leaveError);

  const { data: flagged, error: flagError } = await supabase
    .from("bookings")
    .update({ status: "Needs Reassignment" })
    .eq("therapist_id", therapistId)
    .gte("booking_date", startDate)
    .lte("booking_date", endDate)
    .eq("status", "Booked")
    .select("id");
  if (flagError) return fail(flagError);

  await logAction(
    supabase,
    staffId,
    "therapist_mark_on_leave",
    `therapist=${therapistId} start=${startDate} end=${endDate} flagged=${flagged?.length ?? 0}`
  );
  revalidatePath("/therapists");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function archiveTherapist(
  therapistId: string,
  reason: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: archiveError } = await supabase
    .from("therapists")
    .update({
      archived: true,
      archived_reason: reason,
      archived_by: staffId,
      archived_at: new Date().toISOString(),
    })
    .eq("id", therapistId);
  if (archiveError) return fail(archiveError);

  const { data: flagged, error: flagError } = await supabase
    .from("bookings")
    .update({ status: "Needs Reassignment" })
    .eq("therapist_id", therapistId)
    .eq("status", "Booked")
    .select("id");
  if (flagError) return fail(flagError);

  await logAction(
    supabase,
    staffId,
    "therapist_archive",
    `therapist=${therapistId} reason=${reason} flagged=${flagged?.length ?? 0}`
  );
  revalidatePath("/therapists");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function unarchiveTherapist(
  therapistId: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("therapists")
    .update({
      archived: false,
      archived_reason: null,
      archived_by: null,
      archived_at: null,
    })
    .eq("id", therapistId);
  if (error) return fail(error);

  await logAction(supabase, staffId, "therapist_unarchive", `therapist=${therapistId}`);
  revalidatePath("/therapists");
  return { ok: true };
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
