"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toSpaDay, spaDayNow } from "@/lib/analytics/spa-day";

type ActionResult = { ok: true } | { ok: false; error: string };
export type BulkCheckoutResult = { ok: true; count: number } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
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
