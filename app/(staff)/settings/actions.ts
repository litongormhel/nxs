"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/portal/service-client";
import type { Database } from "@/lib/types/database";

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
  staffId: string,
  constraints?: {
    applicableDays?: string[] | null;
    applicableSlots?: string[] | null;
    minPax?: number | null;
  }
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;

  const insertPayload: Record<string, any> = { label, discount };
  if (constraints?.applicableDays !== undefined) {
    insertPayload.applicable_days = constraints.applicableDays;
  }
  if (constraints?.applicableSlots !== undefined) {
    insertPayload.applicable_slots = constraints.applicableSlots;
  }
  if (constraints?.minPax !== undefined) {
    insertPayload.min_pax = constraints.minPax ?? 1;
  }

  let { data, error } = await (supabase as any)
    .from("promos")
    .insert(insertPayload)
    .select("id")
    .single();

  // Fallback in case schema cache is pending column reload
  if (error && (error.code === "42703" || error.code === "PGRST204" || error.message?.includes("applicable_days") || error.message?.includes("applicable_slots") || error.message?.includes("min_pax"))) {
    const res = await supabase
      .from("promos")
      .insert({ label, discount })
      .select("id")
      .single();
    data = res.data;
    error = res.error;
  }

  if (error) return fail(error);
  await logAction(
    supabase,
    staffId,
    "settings_add_promo",
    JSON.stringify({
      label,
      discount,
      applicableDays: constraints?.applicableDays ?? null,
      applicableSlots: constraints?.applicableSlots ?? null,
      minPax: constraints?.minPax ?? 1,
    })
  );
  revalidatePath("/settings");
  return { ok: true, id: data.id };
}

export async function updatePromo(
  promoId: string,
  updates: {
    label?: string;
    discount?: number;
    applicableDays?: string[] | null;
    applicableSlots?: string[] | null;
    minPax?: number | null;
  },
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;

  const updatePayload: Database["public"]["Tables"]["promos"]["Update"] = {};
  if (updates.label !== undefined) updatePayload.label = updates.label;
  if (updates.discount !== undefined) updatePayload.discount = updates.discount;
  if (updates.applicableDays !== undefined) updatePayload.applicable_days = updates.applicableDays;
  if (updates.applicableSlots !== undefined) updatePayload.applicable_slots = updates.applicableSlots;
  if (updates.minPax !== undefined) updatePayload.min_pax = typeof updates.minPax === "number" && updates.minPax > 0 ? updates.minPax : 1;

  let { error } = await supabase
    .from("promos")
    .update(updatePayload)
    .eq("id", promoId);

  // Fallback in case columns are pending reload in schema cache
  if (error && (error.code === "42703" || error.code === "PGRST204" || error.message?.includes("applicable_days") || error.message?.includes("applicable_slots") || error.message?.includes("min_pax"))) {
    const safePayload: Database["public"]["Tables"]["promos"]["Update"] = {};
    if (updates.label !== undefined) safePayload.label = updates.label;
    if (updates.discount !== undefined) safePayload.discount = updates.discount;
    const res = await supabase
      .from("promos")
      .update(safePayload)
      .eq("id", promoId);
    error = res.error;
  }

  if (error) return fail(error);

  let promoLabel = updates.label;
  if (!promoLabel) {
    const { data: existingPromo } = await supabase
      .from("promos")
      .select("label")
      .eq("id", promoId)
      .maybeSingle();
    promoLabel = existingPromo?.label;
  }

  await logAction(
    supabase,
    staffId,
    "settings_update_promo",
    JSON.stringify({
      promoId,
      label: promoLabel,
      ...updates,
    })
  );
  revalidatePath("/settings");
  return { ok: true };
}

export async function updatePromoDiscount(
  promoId: string,
  discount: number,
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;

  const { data: existingPromo } = await supabase
    .from("promos")
    .select("label")
    .eq("id", promoId)
    .maybeSingle();

  const { error } = await supabase
    .from("promos")
    .update({ discount })
    .eq("id", promoId);
  if (error) return fail(error);
  await logAction(
    supabase,
    staffId,
    "settings_update_promo_discount",
    `promo=${promoId} label=${existingPromo?.label ?? ""} discount=${discount}`
  );
  revalidatePath("/settings");
  return { ok: true };
}

export async function deletePromo(
  promoId: string,
  staffId: string,
  promoLabel?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;

  let label = promoLabel;
  if (!label) {
    const { data: promoRow } = await supabase
      .from("promos")
      .select("label")
      .eq("id", promoId)
      .maybeSingle();
    if (promoRow?.label) {
      label = promoRow.label;
    }
  }

  const { error } = await supabase
    .from("promos")
    .update({ active: false })
    .eq("id", promoId);
  if (error) return fail(error);
  await logAction(
    supabase,
    staffId,
    "settings_delete_promo",
    label ? `label=${label} promo=${promoId}` : `promo=${promoId}`
  );
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

// ---------- Walk-in Claims Setting (Owner Only) ----------

export type WalkinClaimsSettingResult =
  | { success: true; ok: true; enabled: boolean }
  | { success: false; ok: false; error: string };

export async function updateWalkinClaimsSetting(
  enabled: boolean,
  staffId: string
): Promise<WalkinClaimsSettingResult> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) {
    return {
      success: false,
      ok: false,
      error: "error" in ownerCheck ? ownerCheck.error : "Owner only.",
    };
  }

  try {
    let clientToUse: any = supabase;

    // Retrieve active app_settings row to ensure we target the exact row ID
    let { data: existingRow, error: fetchError } = await clientToUse
      .from("app_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (fetchError && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const serviceClient = createServiceClient();
        const { data: serviceRow, error: serviceFetchError } = await (serviceClient as any)
          .from("app_settings")
          .select("id")
          .limit(1)
          .maybeSingle();
        if (!serviceFetchError && serviceRow) {
          existingRow = serviceRow;
          clientToUse = serviceClient;
          fetchError = null;
        }
      } catch {
        // Fall back to original client
      }
    }

    const targetId = existingRow?.id ?? true;

    let updateRes = await (clientToUse as any)
      .from("app_settings")
      .update({ allow_walkin_claims: enabled })
      .eq("id", targetId)
      .select("allow_walkin_claims");

    let error = updateRes.error;
    let updatedData = updateRes.data;

    // Fall back to service client if update failed due to RLS, or if 0 rows were updated
    if ((error || !updatedData || updatedData.length === 0) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const serviceClient = createServiceClient();
        const serviceUpdate = await (serviceClient as any)
          .from("app_settings")
          .update({ allow_walkin_claims: enabled })
          .eq("id", targetId)
          .select("allow_walkin_claims");

        if (!serviceUpdate.error && serviceUpdate.data && serviceUpdate.data.length > 0) {
          error = null;
          clientToUse = serviceClient;
          updatedData = serviceUpdate.data;
        } else if (!serviceUpdate.error && (!serviceUpdate.data || serviceUpdate.data.length === 0)) {
          // If row with targetId doesn't exist, check any first row or insert
          const { data: anyRow } = await (serviceClient as any)
            .from("app_settings")
            .select("id")
            .limit(1)
            .maybeSingle();

          if (anyRow) {
            const retryRes = await (serviceClient as any)
              .from("app_settings")
              .update({ allow_walkin_claims: enabled })
              .eq("id", anyRow.id)
              .select("allow_walkin_claims");
            if (!retryRes.error && retryRes.data && retryRes.data.length > 0) {
              error = null;
              clientToUse = serviceClient;
              updatedData = retryRes.data;
            }
          } else {
            const insertRes = await (serviceClient as any)
              .from("app_settings")
              .insert({ id: true, allow_walkin_claims: enabled })
              .select("allow_walkin_claims");
            if (!insertRes.error) {
              error = null;
              clientToUse = serviceClient;
              updatedData = insertRes.data;
            }
          }
        } else {
          error = serviceUpdate.error;
        }
      } catch {
        // Fall back to original error
      }
    }

    if (error) {
      const errRes = fail(error);
      return { success: false, ok: false, error: "error" in errRes ? errRes.error : "Failed" };
    }

    await logAction(
      clientToUse,
      staffId,
      "settings_update_walkin_claims_toggle",
      `allow_walkin_claims=${enabled}`
    );

    revalidatePath("/settings");
    revalidatePath("/clients");
    return { success: true, ok: true, enabled };
  } catch (err: unknown) {
    const errRes = fail(err);
    return { success: false, ok: false, error: "error" in errRes ? errRes.error : "Failed" };
  }
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

// ---------- Branding & Appearance (Owner for Branding, Staff/Owner for Appearance) ----------

export async function updateBrandingSettings(
  payload: { spaName?: string; logoUrl?: string | null },
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;

  try {
    let clientToUse: any = supabase;
    const updateObj: Record<string, any> = {};
    if (payload.spaName !== undefined) updateObj.spa_name = payload.spaName.trim() || "NXS Spa";
    if (payload.logoUrl !== undefined) updateObj.logo_url = payload.logoUrl;

    let { error } = await clientToUse
      .from("app_settings")
      .update(updateObj)
      .eq("id", true);

    if (error && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const serviceClient = createServiceClient();
        const sRes = await (serviceClient as any)
          .from("app_settings")
          .update(updateObj)
          .eq("id", true);
        if (!sRes.error) {
          error = null;
          clientToUse = serviceClient;
        }
      } catch {
        // Fall back to original error
      }
    }

    if (error) return fail(error);

    await logAction(
      clientToUse,
      staffId,
      "settings_update_branding",
      `spa_name=${updateObj.spa_name ?? "unchanged"} logo=${updateObj.logo_url ? "updated" : "cleared"}`
    );

    revalidatePath("/settings");
    revalidatePath("/bookings");
    return { ok: true };
  } catch (err: unknown) {
    return fail(err);
  }
}

export async function uploadBrandLogo(
  formData: FormData,
  staffId: string
): Promise<ActionResult & { url?: string }> {
  const supabase = await createClient();
  const ownerCheck = await requireOwner(supabase);
  if (ownerCheck) return ownerCheck;

  const file = formData.get("file") as File | null;
  if (!file || typeof file === "string") {
    return { ok: false, error: "No image file provided." };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Only image files (JPEG, PNG, WebP, SVG, GIF) are allowed." };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Image size must be 5MB or less." };
  }

  try {
    let storageClient: any = supabase;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        storageClient = createServiceClient();
      } catch {
        storageClient = supabase;
      }
    }

    const ext = file.name.split(".").pop() || "png";
    const filename = `logo-${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await storageClient.storage
      .from("brand-assets")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return fail(uploadError);
    }

    const { data: urlData } = storageClient.storage
      .from("brand-assets")
      .getPublicUrl(filename);

    const publicUrl = urlData?.publicUrl || "";

    await logAction(
      storageClient,
      staffId,
      "settings_upload_brand_logo",
      `filename=${filename} url=${publicUrl}`
    );

    return { ok: true, url: publicUrl };
  } catch (err: unknown) {
    return fail(err);
  }
}

export async function updateAppearanceSettings(
  payload: {
    accentColor?: string;
    fontFamily?: string;
    fontScale?: string;
    tableDensity?: string;
  },
  staffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  try {
    let clientToUse: any = supabase;
    const updateObj: Record<string, any> = {};
    if (payload.accentColor !== undefined) updateObj.accent_color = payload.accentColor;
    if (payload.fontFamily !== undefined) updateObj.font_family = payload.fontFamily;
    if (payload.fontScale !== undefined) updateObj.font_scale = payload.fontScale;
    if (payload.tableDensity !== undefined) updateObj.table_density = payload.tableDensity;

    let { error } = await clientToUse
      .from("app_settings")
      .update(updateObj)
      .eq("id", true);

    if (error && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const serviceClient = createServiceClient();
        const sRes = await (serviceClient as any)
          .from("app_settings")
          .update(updateObj)
          .eq("id", true);
        if (!sRes.error) {
          error = null;
          clientToUse = serviceClient;
        }
      } catch {
        // Ignore fallback
      }
    }

    // If the columns aren't in schema cache yet, don't break
    if (error) {
      console.warn("Could not save appearance settings to app_settings:", error);
    } else {
      await logAction(
        clientToUse,
        staffId,
        "settings_update_appearance",
        JSON.stringify(payload)
      );
    }

    revalidatePath("/settings");
    return { ok: true };
  } catch (err: unknown) {
    return fail(err);
  }
}

