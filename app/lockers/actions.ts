"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: unknown): ActionResult {
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
    // TEMP: placeholder actor pending Staff Auth phase — selected manually
    // from the Simulate Staff dropdown until sessions/auth.uid() exist.
    staff_id: actorStaffId,
    action: "locker_checkout",
    detail: `occupancy_id=${occupancyId}`,
  });

  revalidatePath("/lockers");
  revalidatePath("/call-sheet");
  return { ok: true };
}
