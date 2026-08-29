"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };
type StaffPosition = Database["public"]["Enums"]["staff_position"];

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

export async function addStaff(
  name: string,
  position: StaffPosition,
  comment: string | null,
  actorStaffId: string
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .insert({ name, position, comment: comment || null })
    .select("id")
    .single();
  if (error) return fail(error);
  await logAction(
    supabase,
    actorStaffId,
    "staff_add",
    `name=${name} position=${position}${comment ? ` comment=${comment}` : ""}`
  );
  revalidatePath("/staff");
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}
