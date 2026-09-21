"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/portal/service-client";

type ActionResult = { ok: true } | { ok: false; error: string };

async function logAction(
  supabase: any,
  staffId: string,
  action: string,
  detail: string
) {
  if (!staffId) return;
  try {
    await supabase.from("action_logs").insert({
      staff_id: staffId,
      action,
      detail,
    });
  } catch {
    // Audit log failures should not block successful settings operations
  }
}

function fail(error: unknown): ActionResult {
  if (!error) return { ok: false, error: "An unexpected error occurred." };
  if (typeof error === "string") return { ok: false, error };
  if (typeof error === "object") {
    const err = error as Record<string, any>;
    const msg =
      err.message ||
      err.error_description ||
      err.error ||
      err.details ||
      err.hint;
    if (typeof msg === "string" && msg.trim()) {
      return { ok: false, error: msg };
    }
  }
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
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;
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
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;
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
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;
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

// ---------- Loyalty Points Formula (schema/config only — not wired into any live points-award path) ----------

export async function updateLoyaltyFormula(
  mode: "uniform" | "proportional",
  pesoPerPoint: number | null,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      loyalty_formula_mode: mode,
      peso_per_point: mode === "uniform" ? pesoPerPoint : null,
    })
    .eq("id", true);
  if (error) return fail(error);
  await logAction(
    supabase,
    staffId,
    "settings_update_loyalty_formula",
    `mode=${mode} peso_per_point=${mode === "uniform" ? pesoPerPoint : "n/a"}`
  );
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- SMS Confirmation Template ----------

export async function updateSmsTemplate(
  template: string,
  staffId: string
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

    let { error } = await supabase
      .from("app_settings")
      .update({ sms_confirmation_template: template })
      .eq("id", true);

    if (error) {
      // If standard client failed due to RLS, attempt fallback to service client if available
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const serviceClient = createServiceClient();
          const { error: serviceError } = await serviceClient
            .from("app_settings")
            .update({ sms_confirmation_template: template })
            .eq("id", true);
          if (!serviceError) {
            error = null;
            supabase = serviceClient;
          } else {
            error = serviceError;
          }
        } catch {
          // Fall back to returning the formatted original error
        }
      }
    }

    if (error) {
      // Gracefully handle column absence / schema cache missing column error
      if (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        error.message?.includes("sms_confirmation_template") ||
        error.message?.includes("schema cache")
      ) {
        console.warn(
          `[updateSmsTemplate] 'sms_confirmation_template' missing in schema cache: ${error.message}`
        );
        return fail(
          `Could not find the 'sms_confirmation_template' column of 'app_settings' in the schema cache. Please ensure migration 20260921150000_add_sms_confirmation_template.sql is applied and schema cache is reloaded.`
        );
      }
      return fail(error);
    }

    await logAction(
      supabase,
      staffId,
      "settings_update_sms_template",
      "updated sms confirmation template"
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (err: unknown) {
    return fail(err);
  }
}

export const saveSmsTemplate = updateSmsTemplate;

export async function resetSmsTemplate(staffId: string): Promise<ActionResult> {
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

    let { error } = await supabase
      .from("app_settings")
      .update({ sms_confirmation_template: null })
      .eq("id", true);

    if (error) {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const serviceClient = createServiceClient();
          const { error: serviceError } = await serviceClient
            .from("app_settings")
            .update({ sms_confirmation_template: null })
            .eq("id", true);
          if (!serviceError) {
            error = null;
            supabase = serviceClient;
          } else {
            error = serviceError;
          }
        } catch {
          // Fall back to returning the formatted original error
        }
      }
    }

    if (error) {
      if (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        error.message?.includes("sms_confirmation_template") ||
        error.message?.includes("schema cache")
      ) {
        console.warn(
          `[resetSmsTemplate] 'sms_confirmation_template' missing in schema cache: ${error.message}`
        );
        return fail(
          `Could not find the 'sms_confirmation_template' column of 'app_settings' in the schema cache. Please ensure migration 20260921150000_add_sms_confirmation_template.sql is applied and schema cache is reloaded.`
        );
      }
      return fail(error);
    }

    await logAction(
      supabase,
      staffId,
      "settings_reset_sms_template",
      "reset sms confirmation template to default"
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (err: unknown) {
    return fail(err);
  }
}

// ---------- Void Authorization Code ----------

export async function updateVoidAuthCode(code: string, staffId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Code must be exactly 6 digits." };
  }
  const { error } = await supabase.rpc("set_void_auth_code", { p_code: code });
  if (error) return fail(error);
  await logAction(supabase, staffId, "settings_update_void_auth_code", "void authorization code updated");
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Capacity ----------

export async function addLockers(count: number, staffId: string): Promise<ActionResult & { added?: number[] }> {
  if (count <= 0) return { ok: false, error: "Count must be at least 1." };
  const supabase = await createClient();
  const { data: maxRow, error: maxErr } = await supabase
    .from("lockers")
    .select("number")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) return fail(maxErr);

  const start = (maxRow?.number ?? 0) + 1;
  const newNumbers = Array.from({ length: count }, (_, i) => start + i);
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
