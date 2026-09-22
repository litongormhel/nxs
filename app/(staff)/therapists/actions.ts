"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createStaffServiceClient } from "@/lib/staff/service-client";
import { spaDayNow } from "@/lib/analytics/spa-day";

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
  if (typeof error === "string") return { ok: false, error };
  if (error instanceof Error) return { ok: false, error: error.message };
  if (error && typeof error === "object") {
    const errObj = error as Record<string, any>;
    if (typeof errObj.message === "string" && errObj.message.trim().length > 0) {
      return { ok: false, error: errObj.message };
    }
    if (typeof errObj.error_description === "string" && errObj.error_description.trim().length > 0) {
      return { ok: false, error: errObj.error_description };
    }
    if (typeof errObj.details === "string" && errObj.details.trim().length > 0) {
      return { ok: false, error: errObj.details };
    }
    if (typeof errObj.hint === "string" && errObj.hint.trim().length > 0) {
      return { ok: false, error: errObj.hint };
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return { ok: false, error: json };
    } catch {
      // ignore
    }
  }
  const str = String(error);
  return { ok: false, error: str !== "[object Object]" ? str : "An unexpected error occurred." };
}

export async function createTherapist(
  name: string,
  dayOffWeekdays: number[],
  staffId: string,
  serviceIds?: string[]
): Promise<CreateTherapistResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("therapists")
    .insert({ name })
    .select("id")
    .single();
  if (error || !data) return fail(error ?? "Could not create therapist");

  let mutationClient = supabase;
  try {
    mutationClient = createStaffServiceClient() as any;
  } catch {
    mutationClient = supabase;
  }

  if (dayOffWeekdays.length > 0) {
    const { error: dayOffError } = await mutationClient
      .from("therapist_day_off")
      .insert(dayOffWeekdays.map((weekday) => ({ therapist_id: data.id, weekday })));
    if (dayOffError) return fail(dayOffError);
  }

  if (serviceIds && serviceIds.length > 0) {
    const { error: svcError } = await mutationClient
      .from("therapist_services")
      .insert(serviceIds.map((service_id) => ({ therapist_id: data.id, service_id })));
    if (svcError) return fail(svcError);
  }

  if (staffId) {
    try {
      await logAction(supabase, staffId, "therapist_create", `therapist=${data.id} name=${name}`);
    } catch (logErr) {
      console.warn("Failed to log therapist_create action:", logErr);
    }
  }

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

  // Fetch active bookings for this therapist today, including checked-in clients
  // (bookings with status != 'Completed', or status == 'Completed' with unclosed locker occupancy)
  const { data: therapistBookings, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, locker_occupancy(id, checked_out_at)")
    .eq("therapist_id", therapistId)
    .eq("booking_date", date)
    .neq("status", "Cancelled");

  if (fetchError) return fail(fetchError);

  const idsToFlag = (therapistBookings ?? [])
    .filter(
      (b) =>
        b.status !== "Completed" ||
        (b.locker_occupancy ?? []).some((o: any) => !o.checked_out_at)
    )
    .map((b) => b.id);

  let flaggedCount = 0;
  if (idsToFlag.length > 0) {
    const { data: flagged, error: flagError } = await supabase
      .from("bookings")
      .update({ status: "Needs Reassignment" })
      .in("id", idsToFlag)
      .select("id");
    if (flagError) return fail(flagError);
    flaggedCount = flagged?.length ?? 0;
  }

  await logAction(
    supabase,
    staffId,
    "therapist_mark_absent",
    `therapist=${therapistId} date=${date} flagged=${flaggedCount}`
  );
  revalidatePath("/therapists");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markPresentToday(
  therapistId: string,
  date: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  // The service role client is used for the DELETE calls because
  // therapist_absence and therapist_leave have no DELETE RLS policy yet
  // (see migration 20260918000000_therapist_absence_leave_delete_rls.sql).
  // All other reads/writes in this action go through the normal session client.
  const serviceClient = createStaffServiceClient();

  // Remove the therapist_absence record for this date.
  // count:"exact" lets us log whether the row was actually deleted (0 = row
  // didn't exist; 1 = successfully removed).
  const { error: absenceError, count: absenceCount } = await serviceClient
    .from("therapist_absence")
    .delete({ count: "exact" })
    .eq("therapist_id", therapistId)
    .eq("absent_date", date);
  console.log(
    `[markPresentToday] therapist_absence delete — therapist=${therapistId} date=${date} count=${absenceCount} error=${absenceError?.message ?? "none"}`
  );
  if (absenceError) return fail(absenceError);

  // Remove any therapist_leave record that is a single-day leave on exactly this date.
  const { error: leaveError, count: leaveCount } = await serviceClient
    .from("therapist_leave")
    .delete({ count: "exact" })
    .eq("therapist_id", therapistId)
    .eq("start_date", date)
    .eq("end_date", date);
  console.log(
    `[markPresentToday] therapist_leave delete — therapist=${therapistId} date=${date} count=${leaveCount} error=${leaveError?.message ?? "none"}`
  );
  if (leaveError) return fail(leaveError);

  // Restore "Needs Reassignment" bookings on this date back to "Booked"
  const { data: restored, error: restoreError } = await supabase
    .from("bookings")
    .update({ status: "Booked" })
    .eq("therapist_id", therapistId)
    .eq("booking_date", date)
    .eq("status", "Needs Reassignment")
    .select("id");
  if (restoreError) return fail(restoreError);

  await logAction(
    supabase,
    staffId,
    "therapist_mark_present",
    `therapist=${therapistId} date=${date} restored=${restored?.length ?? 0}`
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
    .neq("status", "Completed")
    .neq("status", "Cancelled")
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

  const currentSpaDate = spaDayNow();

  const { data: flagged, error: flagError } = await supabase
    .from("bookings")
    .update({ status: "Needs Reassignment" })
    .eq("therapist_id", therapistId)
    .neq("status", "Completed")
    .neq("status", "Cancelled")
    .gte("booking_date", currentSpaDate)
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

export async function updateTherapistName(
  therapistId: string,
  name: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("therapists")
    .update({ name })
    .eq("id", therapistId);
  if (error) return fail(error);

  await logAction(supabase, staffId, "therapist_rename", `therapist=${therapistId} name=${name}`);
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

  let flaggedCount = 0;
  if (turningOff) {
    const today = spaDayNow();
    const { data: candidates, error: candError } = await supabase
      .from("bookings")
      .select("id, booking_date")
      .eq("therapist_id", therapistId)
      .neq("status", "Completed")
      .neq("status", "Cancelled")
      .gte("booking_date", today);
    if (candError) return fail(candError);

    const matchingIds = (candidates ?? [])
      .filter((b) => new Date(`${b.booking_date}T00:00:00`).getDay() === weekday)
      .map((b) => b.id);

    if (matchingIds.length > 0) {
      const { data: flagged, error: flagError } = await supabase
        .from("bookings")
        .update({ status: "Needs Reassignment" })
        .in("id", matchingIds)
        .select("id");
      if (flagError) return fail(flagError);
      flaggedCount = flagged?.length ?? 0;
    }
  }

  await logAction(
    supabase,
    staffId,
    "therapist_toggle_day_off",
    `therapist=${therapistId} weekday=${weekday} off=${turningOff} flagged=${flaggedCount}`
  );
  revalidatePath("/therapists");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleTherapistService(
  therapistId: string,
  serviceId: string,
  offering: boolean,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  // Use service role client if available to ensure RLS does not silently drop delete/insert
  let mutationClient = supabase;
  try {
    mutationClient = createStaffServiceClient() as any;
  } catch {
    mutationClient = supabase;
  }

  const { error } = offering
    ? await mutationClient
        .from("therapist_services")
        .upsert(
          { therapist_id: therapistId, service_id: serviceId },
          { onConflict: "therapist_id,service_id", ignoreDuplicates: true }
        )
    : await mutationClient
        .from("therapist_services")
        .delete()
        .eq("therapist_id", therapistId)
        .eq("service_id", serviceId);

  if (error) return fail(error);

  if (staffId) {
    try {
      await logAction(
        supabase,
        staffId,
        "therapist_toggle_service",
        `therapist=${therapistId} service=${serviceId} offering=${offering}`
      );
    } catch (logErr) {
      console.warn("Failed to log therapist_toggle_service action:", logErr);
    }
  }

  revalidatePath("/therapists");
  revalidatePath("/bookings");
  return { ok: true };
}

export async function setTherapistBreak(
  therapistId: string,
  date: string,
  slotTime: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const normalizedSlot = slotTime.slice(0, 5);

  // Guard against existing bookings on this slot
  const { data: activeBookings, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, start_time, status")
    .eq("therapist_id", therapistId)
    .eq("booking_date", date)
    .neq("status", "Cancelled");

  if (bookingErr) {
    console.error("[setTherapistBreak] Error checking existing bookings:", bookingErr);
  }

  const hasConflict = (activeBookings ?? []).some(
    (b) => b.start_time.slice(0, 5) === normalizedSlot
  );

  if (hasConflict) {
    return {
      ok: false,
      error: "Therapist has an existing booking on this slot. Please reassign or cancel the booking first.",
    };
  }

  let mutationClient = supabase;
  try {
    mutationClient = createStaffServiceClient() as any;
  } catch {
    mutationClient = supabase;
  }

  const { error: insertError } = await (mutationClient
    .from("therapist_breaks" as any) as any)
    .upsert(
      {
        therapist_id: therapistId,
        break_date: date,
        slot_time: normalizedSlot,
        created_by: staffId || null,
      },
      { onConflict: "therapist_id,break_date,slot_time", ignoreDuplicates: true }
    );

  if (insertError) {
    return fail(insertError);
  }

  if (staffId) {
    try {
      await logAction(
        supabase,
        staffId,
        "therapist_set_break",
        `therapist=${therapistId} date=${date} slot=${normalizedSlot}`
      );
    } catch (logErr) {
      console.warn("Failed to log therapist_set_break action:", logErr);
    }
  }

  revalidatePath("/therapists");
  revalidatePath("/bookings");
  return { ok: true };
}

export async function removeTherapistBreak(
  therapistId: string,
  date: string,
  slotTime: string,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const normalizedSlot = slotTime.slice(0, 5);

  let mutationClient = supabase;
  try {
    mutationClient = createStaffServiceClient() as any;
  } catch {
    mutationClient = supabase;
  }

  const { error: deleteError } = await (mutationClient
    .from("therapist_breaks" as any) as any)
    .delete()
    .eq("therapist_id", therapistId)
    .eq("break_date", date)
    .eq("slot_time", normalizedSlot);

  if (deleteError) {
    return fail(deleteError);
  }

  if (staffId) {
    try {
      await logAction(
        supabase,
        staffId,
        "therapist_remove_break",
        `therapist=${therapistId} date=${date} slot=${normalizedSlot}`
      );
    } catch (logErr) {
      console.warn("Failed to log therapist_remove_break action:", logErr);
    }
  }

  revalidatePath("/therapists");
  revalidatePath("/bookings");
  return { ok: true };
}

export async function syncTherapistBreaks(
  therapistId: string,
  date: string,
  selectedSlots: string[],
  staffId?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const normalizedSlots = Array.from(new Set(selectedSlots.map((s) => s.slice(0, 5))));

  let mutationClient = supabase;
  try {
    mutationClient = createStaffServiceClient() as any;
  } catch {
    mutationClient = supabase;
  }

  // Fetch current breaks for this therapist on this date
  const { data: currentBreaks, error: fetchErr } = await (mutationClient
    .from("therapist_breaks" as any) as any)
    .select("slot_time")
    .eq("therapist_id", therapistId)
    .eq("break_date", date);

  if (fetchErr) {
    return fail(fetchErr);
  }

  const existingSlots: string[] = (currentBreaks ?? []).map((b: any) =>
    (b.slot_time as string).slice(0, 5)
  );

  const slotsToAdd = normalizedSlots.filter((s) => !existingSlots.includes(s));
  const slotsToRemove = existingSlots.filter((s) => !normalizedSlots.includes(s));

  // If there are new break slots to add, ensure none conflict with active bookings
  if (slotsToAdd.length > 0) {
    const { data: activeBookings, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, start_time, status")
      .eq("therapist_id", therapistId)
      .eq("booking_date", date)
      .neq("status", "Cancelled");

    if (bookingErr) {
      console.error("[syncTherapistBreaks] Error checking existing bookings:", bookingErr);
    }

    const conflictingSlots = (activeBookings ?? [])
      .filter((b) => slotsToAdd.includes(b.start_time.slice(0, 5)))
      .map((b) => b.start_time.slice(0, 5));

    if (conflictingSlots.length > 0) {
      return {
        ok: false,
        error: `Therapist has active booking(s) on slot(s): ${conflictingSlots.join(", ")}. Please reassign or cancel the booking first.`,
      };
    }
  }


  // Remove deselected slots
  if (slotsToRemove.length > 0) {
    const { error: delError } = await (mutationClient
      .from("therapist_breaks" as any) as any)
      .delete()
      .eq("therapist_id", therapistId)
      .eq("break_date", date)
      .in("slot_time", slotsToRemove);

    if (delError) {
      return fail(delError);
    }
  }

  // Insert newly added slots
  if (slotsToAdd.length > 0) {
    const rowsToInsert = slotsToAdd.map((s) => ({
      therapist_id: therapistId,
      break_date: date,
      slot_time: s,
      created_by: staffId || null,
    }));

    const { error: insertError } = await (mutationClient
      .from("therapist_breaks" as any) as any)
      .upsert(rowsToInsert, {
        onConflict: "therapist_id,break_date,slot_time",
        ignoreDuplicates: true,
      });

    if (insertError) {
      return fail(insertError);
    }
  }

  // Audit logging
  if (staffId && (slotsToAdd.length > 0 || slotsToRemove.length > 0)) {
    try {
      await logAction(
        supabase,
        staffId,
        "therapist_sync_breaks",
        `therapist=${therapistId} date=${date} added=[${slotsToAdd.join(",")}] removed=[${slotsToRemove.join(",")}] total=${normalizedSlots.length}`
      );
    } catch (logErr) {
      console.warn("Failed to log therapist_sync_breaks action:", logErr);
    }
  }

  revalidatePath("/therapists");
  revalidatePath("/bookings");
  return { ok: true };
}

