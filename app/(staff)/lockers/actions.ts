"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toSpaDay, spaDayNow } from "@/lib/analytics/spa-day";

type ActionResult = { ok: true } | { ok: false; error: string };
export type BulkCheckoutResult = { ok: true; count: number } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  if (typeof error === "string") return { ok: false, error };
  if (error && typeof error === "object") {
    if ("message" in error && typeof (error as { message: unknown }).message === "string") {
      return { ok: false, error: (error as { message: string }).message };
    }
  }
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function checkOutLocker(
  occupancyId: string,
  actorStaffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("locker_occupancy")
    .update({
      checked_out_at: new Date().toISOString(),
      checked_out_by: actorStaffId,
    })
    .eq("id", occupancyId);

  if (error) return fail(error);

  await supabase.from("action_logs").insert({
    staff_id: actorStaffId,
    action: "locker_checkout",
    detail: `occupancy_id=${occupancyId}`,
  });

  revalidatePath("/lockers");
  revalidatePath("/call-sheet");
  return { ok: true };
}

export async function checkOutOverdueLockers(
  actorStaffId: string
): Promise<BulkCheckoutResult> {
  const supabase = await createClient();

  const { data: occupancies, error: fetchError } = await supabase
    .from("locker_occupancy")
    .select("id, locker_number, checked_in_at")
    .is("checked_out_at", null);

  if (fetchError) return fail(fetchError);

  const today = spaDayNow();
  const overdue = (occupancies ?? []).filter((o) => toSpaDay(o.checked_in_at) !== today);

  if (overdue.length === 0) {
    return { ok: true, count: 0 };
  }

  const overdueIds = overdue.map((o) => o.id);
  const lockerNumbers = overdue.map((o) => o.locker_number).sort((a, b) => a - b);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("locker_occupancy")
    .update({
      checked_out_at: now,
      checked_out_by: actorStaffId || null,
    })
    .in("id", overdueIds);

  if (updateError) return fail(updateError);

  const count = overdue.length;
  await supabase.from("action_logs").insert({
    staff_id: actorStaffId || null,
    action: "bulk_checkout_overdue_lockers",
    detail: `Bulk checked out ${count} overdue lockers: [${lockerNumbers.join(", ")}]`,
  });

  revalidatePath("/lockers");
  revalidatePath("/call-sheet");

  return { ok: true, count };
}

export async function toggleLockerMaintenance(
  lockerNumber: number,
  isMaintenance: boolean,
  note?: string | null,
  staffId?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // 1. Restrict marking as maintenance if currently occupied by an active guest
    if (isMaintenance) {
      const { data: activeOcc, error: occError } = await supabase
        .from("locker_occupancy")
        .select("id, client_id, guest_label")
        .eq("locker_number", lockerNumber)
        .is("checked_out_at", null)
        .maybeSingle();

      if (occError) return fail(occError);

      if (activeOcc) {
        const occupant = activeOcc.guest_label || "an active guest";
        return {
          ok: false,
          error: `Cannot mark Locker #${lockerNumber} as out of order while occupied by ${occupant}. Please check out the guest first.`,
        };
      }
    }

    // 2. Update lockers table
    let { error } = await supabase
      .from("lockers")
      .update({
        is_maintenance: isMaintenance,
        status: isMaintenance ? "out_of_order" : "available",
        maintenance_note: isMaintenance ? (note?.trim() || null) : null,
      })
      .eq("number", lockerNumber);

    // Graceful fallback handling:
    // If PostgREST returns a schema cache missing column error for is_maintenance,
    // fallback cleanly to status update (supported throughout UI and booking validation).
    if (
      error &&
      (error.message?.includes("is_maintenance") ||
        error.message?.includes("schema cache") ||
        error.code === "PGRST204")
    ) {
      console.warn(
        `[toggleLockerMaintenance] 'is_maintenance' missing in schema cache (${error.message}). Falling back to status update.`
      );

      const fallback = await supabase
        .from("lockers")
        .update({
          status: isMaintenance ? "out_of_order" : "available",
          maintenance_note: isMaintenance ? (note?.trim() || null) : null,
        })
        .eq("number", lockerNumber);

      if (!fallback.error) {
        error = null;
      } else if (
        fallback.error.message?.includes("maintenance_note") ||
        fallback.error.code === "PGRST204"
      ) {
        // If maintenance_note is also missing from schema cache, update status only
        const statusOnlyFallback = await supabase
          .from("lockers")
          .update({
            status: isMaintenance ? "out_of_order" : "available",
          })
          .eq("number", lockerNumber);

        error = statusOnlyFallback.error;
      } else {
        error = fallback.error;
      }
    }

    if (error) {
      console.error("[toggleLockerMaintenance Error]:", error);
      if (
        error.message?.includes("is_maintenance") ||
        error.message?.includes("schema cache") ||
        error.code === "PGRST204"
      ) {
        return fail(
          `Unable to update locker maintenance status due to database schema cache: ${error.message}. Please reload the PostgREST schema cache.`
        );
      }
      return fail(error);
    }

    // 3. Audit log
    await supabase.from("action_logs").insert({
      staff_id: staffId || null,
      action: isMaintenance ? "locker_marked_maintenance" : "locker_cleared_maintenance",
      detail: `Locker ${lockerNumber}${isMaintenance && note?.trim() ? ` (Note: ${note.trim()})` : ""}`,
    });

    // 4. Revalidate paths
    revalidatePath("/lockers");
    revalidatePath("/bookings");
    revalidatePath("/call-sheet");
    revalidatePath("/clients");

    return { ok: true };
  } catch (err: unknown) {
    return fail(err);
  }
}
