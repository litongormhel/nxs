"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createStaffServiceClient, staffSyntheticEmail } from "@/lib/staff/service-client";
import type { Database } from "@/lib/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };
type StaffPosition = Database["public"]["Enums"]["staff_position"];

const LOGIN_CAPABLE = new Set<StaffPosition>(["Receptionist", "Supervisor", "Owner"]);
const PERMANENT_BAN = "876000h";

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

async function requireOwner(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ActionResult | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: staff, error } = await supabase
    .from("staff")
    .select("position")
    .eq("user_id", user.id)
    .single();
  if (error) return fail(error);
  if (staff?.position !== "Owner") {
    return { ok: false, error: "Owner only." };
  }
  return null;
}

export type LoginProvisioning = {
  username: string;
  password: string;
  mustChangePassword: boolean;
};

export async function addStaff(
  name: string,
  position: StaffPosition,
  comment: string | null,
  actorStaffId: string,
  login?: LoginProvisioning
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const ownerErr = await requireOwner(supabase);
  if (ownerErr) return ownerErr;

  const needsLogin = LOGIN_CAPABLE.has(position);
  if (needsLogin && !login) {
    return { ok: false, error: "Username and password are required for this position." };
  }

  if (!needsLogin) {
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

  const { username, password, mustChangePassword } = login!;
  const serviceClient = createStaffServiceClient();
  const email = staffSyntheticEmail(username);

  const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return fail(createErr ?? new Error("Failed to create login account."));
  }

  const { data, error } = await supabase
    .from("staff")
    .insert({
      name,
      position,
      comment: comment || null,
      user_id: created.user.id,
      username,
      must_change_password: mustChangePassword,
    })
    .select("id")
    .single();

  if (error) {
    await serviceClient.auth.admin.deleteUser(created.user.id);
    return fail(error);
  }

  await logAction(
    supabase,
    actorStaffId,
    "staff_add",
    `name=${name} position=${position} username=${username}${comment ? ` comment=${comment}` : ""}`
  );
  revalidatePath("/staff");
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}

export async function archiveStaff(
  staffId: string,
  reason: string | null,
  actorStaffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerErr = await requireOwner(supabase);
  if (ownerErr) return ownerErr;

  const { data: target, error: fetchErr } = await supabase
    .from("staff")
    .select("id, name, user_id, active")
    .eq("id", staffId)
    .single();
  if (fetchErr) return fail(fetchErr);
  if (!target.active) return { ok: false, error: "Already archived." };

  const { error } = await supabase
    .from("staff")
    .update({
      active: false,
      archived_reason: reason || null,
      archived_by: actorStaffId,
      archived_at: new Date().toISOString(),
    })
    .eq("id", staffId);
  if (error) return fail(error);

  if (target.user_id) {
    const serviceClient = createStaffServiceClient();
    const { error: banErr } = await serviceClient.auth.admin.updateUserById(target.user_id, {
      ban_duration: PERMANENT_BAN,
    });
    if (banErr) return fail(banErr);
  }

  await logAction(
    supabase,
    actorStaffId,
    "staff_archive",
    `name=${target.name}${reason ? ` reason=${reason}` : ""}`
  );
  revalidatePath("/staff");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function restoreStaff(staffId: string, actorStaffId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerErr = await requireOwner(supabase);
  if (ownerErr) return ownerErr;

  const { data: target, error: fetchErr } = await supabase
    .from("staff")
    .select("id, name, user_id, active")
    .eq("id", staffId)
    .single();
  if (fetchErr) return fail(fetchErr);
  if (target.active) return { ok: false, error: "Not archived." };

  const { error } = await supabase
    .from("staff")
    .update({
      active: true,
      archived_reason: null,
      archived_by: null,
      archived_at: null,
    })
    .eq("id", staffId);
  if (error) return fail(error);

  if (target.user_id) {
    const serviceClient = createStaffServiceClient();
    const { error: unbanErr } = await serviceClient.auth.admin.updateUserById(target.user_id, {
      ban_duration: "none",
    });
    if (unbanErr) return fail(unbanErr);
  }

  await logAction(supabase, actorStaffId, "staff_restore", `name=${target.name}`);
  revalidatePath("/staff");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateStaffDetails(
  staffId: string,
  name: string,
  comment: string | null,
  actorStaffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerErr = await requireOwner(supabase);
  if (ownerErr) return ownerErr;

  const { error } = await supabase
    .from("staff")
    .update({ name, comment: comment || null })
    .eq("id", staffId);
  if (error) return fail(error);

  await logAction(supabase, actorStaffId, "staff_edit", `id=${staffId} name=${name}`);
  revalidatePath("/staff");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetStaffPassword(
  staffId: string,
  newPassword: string,
  actorStaffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerErr = await requireOwner(supabase);
  if (ownerErr) return ownerErr;

  const { data: target, error: fetchErr } = await supabase
    .from("staff")
    .select("id, name, user_id")
    .eq("id", staffId)
    .single();
  if (fetchErr) return fail(fetchErr);
  if (!target.user_id) return { ok: false, error: "This staff member has no login account." };

  const serviceClient = createStaffServiceClient();
  const { error: updateErr } = await serviceClient.auth.admin.updateUserById(target.user_id, {
    password: newPassword,
  });
  if (updateErr) return fail(updateErr);

  const { error } = await supabase
    .from("staff")
    .update({ must_change_password: true })
    .eq("id", staffId);
  if (error) return fail(error);

  await logAction(supabase, actorStaffId, "staff_reset_password", `name=${target.name}`);
  revalidatePath("/staff");
  return { ok: true };
}
