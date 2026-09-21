"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/portal/service-client";
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
    let supabase: any;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        supabase = createServiceClient();
      } catch {
        supabase = await createClient();
      }
    } else {
      supabase = await createClient();
    }

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

    // 2. Update / upsert lockers table (ensuring record exists and is active)
    let updateRes = await supabase
      .from("lockers")
      .upsert(
        {
          number: lockerNumber,
          active: true,
          is_maintenance: isMaintenance,
          status: isMaintenance ? "out_of_order" : "available",
          maintenance_note: isMaintenance ? (note?.trim() || null) : null,
        },
        { onConflict: "number" }
      )
      .select();

    let error = updateRes.error;

    // Graceful fallback handling:
    // If PostgREST returns a schema cache missing column error for is_maintenance,
    // fallback cleanly to status upsert (supported throughout UI and booking validation).
    if (
      error &&
      (error.message?.includes("is_maintenance") ||
        error.message?.includes("schema cache") ||
        error.code === "PGRST204")
    ) {
      console.warn(
        `[toggleLockerMaintenance] 'is_maintenance' missing in schema cache (${error.message}). Falling back to status upsert.`
      );

      const fallback = await supabase
        .from("lockers")
        .upsert(
          {
            number: lockerNumber,
            active: true,
            status: isMaintenance ? "out_of_order" : "available",
            maintenance_note: isMaintenance ? (note?.trim() || null) : null,
          },
          { onConflict: "number" }
        )
        .select();

      if (!fallback.error) {
        error = null;
        updateRes = fallback;
      } else if (
        fallback.error.message?.includes("maintenance_note") ||
        fallback.error.code === "PGRST204"
      ) {
        // If maintenance_note is also missing from schema cache, update status only
        const statusOnlyFallback = await supabase
          .from("lockers")
          .upsert(
            {
              number: lockerNumber,
              active: true,
              status: isMaintenance ? "out_of_order" : "available",
            },
            { onConflict: "number" }
          )
          .select();

        error = statusOnlyFallback.error;
        updateRes = statusOnlyFallback;
      } else {
        error = fallback.error;
      }
    }

    // If initial attempt failed or returned 0 rows (e.g. RLS blocked client), attempt fallback via serviceClient
    if (
      (error || !updateRes.data || updateRes.data.length === 0) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        const serviceClient = createServiceClient();
        const serviceRes = await serviceClient
          .from("lockers")
          .upsert(
            {
              number: lockerNumber,
              active: true,
              is_maintenance: isMaintenance,
              status: isMaintenance ? "out_of_order" : "available",
              maintenance_note: isMaintenance ? (note?.trim() || null) : null,
            },
            { onConflict: "number" }
          )
          .select();

        if (!serviceRes.error && serviceRes.data && serviceRes.data.length > 0) {
          updateRes = serviceRes;
          error = null;
        }
      } catch {
        // Continue to error reporting below
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

    if (!updateRes.data || updateRes.data.length === 0) {
      console.warn(`[toggleLockerMaintenance] 0 rows updated for locker #${lockerNumber}.`);
      return fail(
        `Locker #${lockerNumber} was not updated (record not found or insufficient permission).`
      );
    }

    // 3. Audit log
    if (staffId) {
      try {
        const auditClient = process.env.SUPABASE_SERVICE_ROLE_KEY
          ? (() => {
              try {
                return createServiceClient();
              } catch {
                return supabase;
              }
            })()
          : supabase;

        await auditClient.from("action_logs").insert({
          staff_id: staffId,
          action: isMaintenance ? "locker_marked_maintenance" : "locker_cleared_maintenance",
          detail: `Locker ${lockerNumber}${isMaintenance && note?.trim() ? ` (Note: ${note.trim()})` : ""}`,
        });
      } catch (logErr) {
        console.warn("[toggleLockerMaintenance] Audit log failed:", logErr);
      }
    }

    // 4. Revalidate paths
    revalidatePath("/lockers");
    revalidatePath("/bookings");
    revalidatePath("/dashboard");
    revalidatePath("/call-sheet");
    revalidatePath("/clients");

    return { ok: true };
  } catch (err: unknown) {
    return fail(err);
  }
}
