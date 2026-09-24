"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { toSpaDay, spaDayNow } from "@/lib/analytics/spa-day";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";

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

/**
 * Credits loyalty points to a client's account upon checkout / visit completion.
 * Strictly adheres to append-only ledger rules and calculates points against
 * the final settled bill (service + add-ons) after any mid-visit modifications/downgrades.
 */
export async function creditCheckoutLoyaltyPoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  occupancyId: string,
  actorStaffId: string
): Promise<{ ok: boolean; pointsAwarded?: number; reason?: string }> {
  // 1. Fetch locker occupancy
  const { data: occ, error: occErr } = await supabase
    .from("locker_occupancy")
    .select("id, locker_number, client_id, guest_label, service_id, booking_id")
    .eq("id", occupancyId)
    .maybeSingle();

  if (occErr || !occ) {
    return { ok: false, reason: occErr?.message ?? "Occupancy not found" };
  }

  // If no registered member client_id, walk-ins cannot earn loyalty points
  if (!occ.client_id) {
    return { ok: true, pointsAwarded: 0, reason: "walkin_guest" };
  }

  const clientId = occ.client_id;

  // 2. Check if client has a registered client_portal_accounts row
  const { data: portalAccount } = await supabase
    .from("client_portal_accounts")
    .select("client_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!portalAccount) {
    return { ok: true, pointsAwarded: 0, reason: "no_portal_account" };
  }

  let bookingId = occ.booking_id;
  if (!bookingId) {
    // Fallback: look for the latest non-cancelled booking for this client
    const { data: fallbackBooking } = await supabase
      .from("bookings")
      .select("id")
      .eq("client_id", clientId)
      .neq("status", "Cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    bookingId = fallbackBooking?.id ?? null;
  }

  // 3. Duplicate and Redemption guards
  if (bookingId) {
    // Guard against duplicate EARN entry for this booking
    const { data: existingEarn } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("client_id", clientId)
      .eq("booking_id", bookingId)
      .eq("entry_type", "EARN")
      .maybeSingle();

    if (existingEarn) {
      return { ok: true, pointsAwarded: 0, reason: "already_credited" };
    }

    // Guard against crediting points on a 100-pt redemption visit
    const { data: existingRedeem } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("client_id", clientId)
      .eq("booking_id", bookingId)
      .eq("entry_type", "REDEEM")
      .maybeSingle();

    if (existingRedeem) {
      return { ok: true, pointsAwarded: 0, reason: "loyalty_redemption" };
    }
  }

  // 4. Resolve final service
  let finalServiceId = occ.service_id;
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("service_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (booking?.service_id) {
      finalServiceId = booking.service_id;
    }
  }

  if (!finalServiceId) {
    return { ok: false, reason: "Service not found for occupancy" };
  }

  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("id, name, price, points_earned")
    .eq("id", finalServiceId)
    .single();

  if (svcErr || !service) {
    return { ok: false, reason: svcErr?.message ?? "Service details not found" };
  }

  // 5. Fetch non-voided sales & addons for settled bill calculation
  let sales: any[] = [];
  if (bookingId) {
    const { data: salesData } = await supabase
      .from("sales")
      .select("id, amount, payment_method, service_id, promo_id, manual_discount_type, manual_discount_value")
      .eq("booking_id", bookingId)
      .eq("voided", false);
    sales = salesData ?? [];
  }

  // Check if any sale is a redemption payment
  const isRedeemSale = sales.some(
    (s) => s.payment_method === "Points" || s.promo_id === "redeem_100_pts"
  );
  if (isRedeemSale) {
    return { ok: true, pointsAwarded: 0, reason: "loyalty_redemption" };
  }

  const saleIds = sales.map((s) => s.id);
  let addonsTotal = 0;
  if (saleIds.length > 0) {
    const { data: addonsData } = await supabase
      .from("sale_addons")
      .select("price_at_sale")
      .in("sale_id", saleIds);
    addonsTotal = (addonsData ?? []).reduce(
      (sum, a) => sum + (Number(a.price_at_sale) || 0),
      0
    );
  }

  const totalSalesAmount = sales.reduce(
    (sum, s) => sum + (Number(s.amount) || 0),
    0
  );
  const servicePaidAmount = sales.length > 0
    ? Math.max(0, totalSalesAmount - addonsTotal)
    : Number(service.price) || 0;

  // 6. Calculate points
  let pointsToCredit = 0;
  if (service.name === "Wet Area") {
    pointsToCredit = WET_AREA_POINTS;
  } else {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("loyalty_formula_mode, peso_per_point")
      .eq("id", true)
      .single();

    const mode = (settings?.loyalty_formula_mode ?? "proportional") as LoyaltyFormulaMode;
    if (mode === "uniform") {
      pointsToCredit = computeLoyaltyPoints(
        "uniform",
        totalSalesAmount > 0 ? totalSalesAmount : servicePaidAmount,
        Number(service.price) || 0,
        service.points_earned,
        settings?.peso_per_point ?? null
      );
    } else {
      pointsToCredit = computeLoyaltyPoints(
        "proportional",
        servicePaidAmount,
        Number(service.price) || 0,
        service.points_earned,
        settings?.peso_per_point ?? null
      );
    }
  }

  if (pointsToCredit <= 0) {
    return { ok: true, pointsAwarded: 0, reason: "zero_points_calculated" };
  }

  // 7. Resolve processed_by staff id (ensuring valid non-empty UUID)
  let effectiveStaffId = actorStaffId;
  if (!effectiveStaffId || effectiveStaffId.trim() === "") {
    const { data: fallbackStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("active", true)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    effectiveStaffId = fallbackStaff?.id ?? actorStaffId;
  }

  // 8. Insert the single EARN row into point_transactions
  const primarySaleId = sales[0]?.id ?? null;
  const { error: insertErr } = await supabase.from("point_transactions").insert({
    client_id: clientId,
    booking_id: bookingId ?? null,
    sale_id: primarySaleId,
    points_delta: pointsToCredit,
    entry_type: "EARN",
    source: "STAFF_MANUAL",
    processed_by: effectiveStaffId,
    notes: `Visit: ${service.name}`,
  });

  if (insertErr) {
    console.error("[creditCheckoutLoyaltyPoints Error]:", insertErr);
    return { ok: false, reason: insertErr.message };
  }

  await supabase.from("action_logs").insert({
    staff_id: effectiveStaffId,
    action: "checkout_points_credited",
    detail: `occupancy_id=${occupancyId} booking_id=${bookingId ?? "none"} client_id=${clientId} service="${service.name}" points_awarded=${pointsToCredit}`,
  });

  return { ok: true, pointsAwarded: pointsToCredit };
}

export async function checkOutLocker(
  occupancyId: string,
  actorStaffId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  // 1. Credit loyalty points against final settled bill if applicable
  try {
    await creditCheckoutLoyaltyPoints(supabase, occupancyId, actorStaffId);
  } catch (ptsErr) {
    console.warn("[checkOutLocker] Points crediting non-blocking exception:", ptsErr);
  }

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
  revalidatePath("/bookings");
  revalidatePath("/clients");
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

  // Credit loyalty points for overdue lockers prior to checkout
  for (const occId of overdueIds) {
    try {
      await creditCheckoutLoyaltyPoints(supabase, occId, actorStaffId);
    } catch (ptsErr) {
      console.warn(`[checkOutOverdueLockers] Points crediting warning for ${occId}:`, ptsErr);
    }
  }

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
  revalidatePath("/bookings");
  revalidatePath("/clients");

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
