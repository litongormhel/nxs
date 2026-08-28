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
    // TEMP: placeholder actor pending Staff Auth phase — selected manually
    // from the Simulate Staff dropdown until sessions/auth.uid() exist.
    staff_id: staffId,
    action,
    detail,
  });
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

// ---------- Services ----------

export async function updateServicePrice(
  serviceId: string,
  price: number,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ price })
    .eq("id", serviceId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_update_service_price", `service=${serviceId} price=${price}`);
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateServicePoints(
  serviceId: string,
  pointsEarned: number,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ points_earned: pointsEarned })
    .eq("id", serviceId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_update_service_points", `service=${serviceId} points=${pointsEarned}`);
  revalidatePath("/settings");
  return { ok: true };
}

export async function addService(
  name: string,
  price: number,
  pointsEarned: number,
  staffId: string
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({ name, price, points_earned: pointsEarned })
    .select("id")
    .single();
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_add_service", `name=${name} price=${price} points=${pointsEarned}`);
  revalidatePath("/settings");
  return { ok: true, id: data.id };
}

export async function deleteService(serviceId: string, staffId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ active: false })
    .eq("id", serviceId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_delete_service", `service=${serviceId}`);
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Promos ----------

export async function addPromo(
  label: string,
  discount: number,
  staffId: string
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promos")
    .insert({ label, discount })
    .select("id")
    .single();
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_add_promo", `label=${label} discount=${discount}`);
  revalidatePath("/settings");
  return { ok: true, id: data.id };
}

export async function updatePromoDiscount(
  promoId: string,
  discount: number,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("promos")
    .update({ discount })
    .eq("id", promoId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_update_promo_discount", `promo=${promoId} discount=${discount}`);
  revalidatePath("/settings");
  return { ok: true };
}

export async function deletePromo(promoId: string, staffId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("promos")
    .update({ active: false })
    .eq("id", promoId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_delete_promo", `promo=${promoId}`);
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Weekend Fixed Time Slots ----------

export async function addWeekendSlot(
  slotTime: string,
  staffId: string
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekend_slots")
    .insert({ slot_time: slotTime })
    .select("id")
    .single();
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_add_weekend_slot", `slot=${slotTime}`);
  revalidatePath("/settings");
  return { ok: true, id: data.id };
}

export async function deleteWeekendSlot(slotId: string, staffId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("weekend_slots").delete().eq("id", slotId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_delete_weekend_slot", `slot=${slotId}`);
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Add-ons ----------

export async function addAddon(
  name: string,
  price: number,
  staffId: string
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("addons")
    .insert({ name, price })
    .select("id")
    .single();
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_add_addon", `name=${name} price=${price}`);
  revalidatePath("/settings");
  return { ok: true, id: data.id };
}

export async function updateAddonPrice(
  addonId: string,
  price: number,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("addons")
    .update({ price })
    .eq("id", addonId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_update_addon_price", `addon=${addonId} price=${price}`);
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteAddon(addonId: string, staffId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { count, error: countErr } = await supabase
    .from("addons")
    .select("*", { count: "exact", head: true })
    .eq("active", true);
  if (countErr) return fail(countErr);
  if ((count ?? 0) <= 1) {
    return { ok: false, error: "At least one add-on must remain." };
  }

  const { error } = await supabase
    .from("addons")
    .update({ active: false })
    .eq("id", addonId);
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_delete_addon", `addon=${addonId}`);
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Capacity ----------

export async function addLockerBatch(staffId: string): Promise<ActionResult & { added?: number[] }> {
  const supabase = await createClient();
  const { data: maxRow, error: maxErr } = await supabase
    .from("lockers")
    .select("number")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) return fail(maxErr);

  const start = (maxRow?.number ?? 0) + 1;
  const newNumbers = Array.from({ length: 10 }, (_, i) => start + i);
  const { error } = await supabase
    .from("lockers")
    .insert(newNumbers.map((number) => ({ number, active: true })));
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_add_lockers", `added=${newNumbers.join(",")}`);
  revalidatePath("/settings");
  return { ok: true, added: newNumbers };
}

export async function updateRoomCount(targetCount: number, staffId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: activeRooms, error: activeErr } = await supabase
    .from("rooms")
    .select("number")
    .eq("active", true)
    .order("number", { ascending: false });
  if (activeErr) return fail(activeErr);

  const currentCount = activeRooms?.length ?? 0;
  if (targetCount === currentCount) return { ok: true };

  if (targetCount > currentCount) {
    const { data: maxRow, error: maxErr } = await supabase
      .from("rooms")
      .select("number")
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) return fail(maxErr);

    const start = (maxRow?.number ?? 0) + 1;
    const toAdd = targetCount - currentCount;
    const newNumbers = Array.from({ length: toAdd }, (_, i) => start + i);
    const { error } = await supabase
      .from("rooms")
      .insert(newNumbers.map((number) => ({ number, active: true })));
    if (error) return fail(error);
    await logAction(supabase, staffId, "settings_update_room_count", `added=${newNumbers.join(",")} target=${targetCount}`);
  } else {
    const toRemove = currentCount - targetCount;
    const removeNumbers = (activeRooms ?? []).slice(0, toRemove).map((r) => r.number);
    const { error } = await supabase
      .from("rooms")
      .update({ active: false })
      .in("number", removeNumbers);
    if (error) return fail(error);
    await logAction(supabase, staffId, "settings_update_room_count", `deactivated=${removeNumbers.join(",")} target=${targetCount}`);
  }

  revalidatePath("/settings");
  return { ok: true };
}
