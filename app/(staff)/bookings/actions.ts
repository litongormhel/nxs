"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

/**
 * Resolves the EARN points for a completed visit: Wet Area always gets its
 * fixed WET_AREA_POINTS, bypassing the formula entirely. Otherwise reads the
 * owner-configured app_settings formula (single read per call site — each
 * booking/walk-in has exactly one service line under the current schema, so
 * this is never called more than once per visit) and runs
 * computeLoyaltyPoints(). Returns null when the formula isn't configured yet
 * — callers must skip the ledger insert on null, not substitute a fallback.
 */
async function resolveEarnedPoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceName: string,
  servicePaidAmount: number,
  fullPrice: number,
  basePoints: number
): Promise<number | null> {
  if (serviceName === "Wet Area") return WET_AREA_POINTS;

  const { data: settings } = await supabase
    .from("app_settings")
    .select("loyalty_formula_mode, peso_per_point")
    .eq("id", true)
    .single();

  const mode = (settings?.loyalty_formula_mode ?? null) as LoyaltyFormulaMode | null;
  if (!mode) return null;

  return computeLoyaltyPoints(
    mode,
    servicePaidAmount,
    fullPrice,
    basePoints,
    settings?.peso_per_point ?? null
  );
}

export type CreateBookingInput = {
  clientId: string | null;
  guestLabel: string | null;
  serviceId: string;
  therapistId: string | null;
  roomNumber: number | null;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  status: BookingStatus;
  paxCount: number | null;
  promoId: string | null;
  createdBy: string;
};

export type CreateBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string; field?: "room" | "therapist" };

const EXCLUSION_VIOLATION = "23P01";

export async function createBooking(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      client_id: input.clientId,
      guest_label: input.guestLabel,
      service_id: input.serviceId,
      therapist_id: input.therapistId,
      room_number: input.roomNumber,
      booking_date: input.bookingDate,
      start_time: input.startTime,
      status: input.status,
      pax_count: input.paxCount,
      promo_id: input.promoId,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      if (error.message.includes("no_double_book_room")) {
        return {
          ok: false,
          field: "room",
          error: "That room is already booked for the selected time.",
        };
      }
      if (error.message.includes("no_double_book_therapist")) {
        return {
          ok: false,
          field: "therapist",
          error: "That therapist is already booked for the selected time.",
        };
      }
      return { ok: false, error: "This booking conflicts with an existing one." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/bookings");
  revalidatePath("/dashboard");

  return { ok: true, bookingId: data.id };
}

export type QuickWalkinInput = {
  clientId: string | null;
  guestLabel: string | null;
  serviceId: string;
  therapistId: string | null;
  roomNumber: number | null;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  lockerNumber: number;
  promoId: string | null;
  manualDiscountType: "pct" | "fixed" | null;
  manualDiscountValue: number | null;
  addonIds: string[];
  amount: number;
  /** Service-only paid amount (post-promo/discount, excluding add-ons) — the input to the loyalty formula, distinct from `amount` which includes add-ons and is what's recorded on the sale. */
  servicePaidAmount: number;
  paymentMethod: "Cash" | "GCash";
  paymentRef: string | null;
  staffId: string;
};

export type QuickWalkinResult =
  | { ok: true; bookingId: string; pointsAwarded: number | null }
  | { ok: false; error: string; field?: "room" | "therapist" | "locker" };

const UNIQUE_VIOLATION = "23505";

export async function quickWalkin(
  input: QuickWalkinInput
): Promise<QuickWalkinResult> {
  const supabase = await createClient();

  let pointsAwarded: number | null = null;
  if (input.clientId) {
    const { data: service, error: svcErr } = await supabase
      .from("services")
      .select("name, price, points_earned")
      .eq("id", input.serviceId)
      .single();
    if (svcErr || !service) {
      return { ok: false, error: svcErr?.message ?? "Service not found." };
    }
    pointsAwarded = await resolveEarnedPoints(
      supabase,
      service.name,
      input.servicePaidAmount,
      service.price,
      service.points_earned
    );
  }

  const { data, error } = await supabase.rpc("quick_walkin", {
    p_client_id: input.clientId,
    p_guest_label: input.guestLabel,
    p_service_id: input.serviceId,
    p_therapist_id: input.therapistId,
    p_room_number: input.roomNumber,
    p_booking_date: input.bookingDate,
    p_start_time: input.startTime,
    p_locker_number: input.lockerNumber,
    p_promo_id: input.promoId,
    p_manual_discount_type: input.manualDiscountType,
    p_manual_discount_value: input.manualDiscountValue,
    p_addon_ids: input.addonIds,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_ref: input.paymentRef,
    p_staff_id: input.staffId,
    p_points_earned: pointsAwarded,
  });

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      if (error.message.includes("no_double_book_room")) {
        return {
          ok: false,
          field: "room",
          error: "That room is already booked for the selected time.",
        };
      }
      if (error.message.includes("no_double_book_therapist")) {
        return {
          ok: false,
          field: "therapist",
          error: "That therapist is already booked for the selected time.",
        };
      }
      return { ok: false, error: "This booking conflicts with an existing one." };
    }
    if (error.code === UNIQUE_VIOLATION) {
      if (error.message.includes("one_active_occupant_per_locker")) {
        return {
          ok: false,
          field: "locker",
          error: "That locker was just taken — pick another.",
        };
      }
      if (error.message.includes("one_active_occupant_per_room")) {
        return {
          ok: false,
          field: "room",
          error: "That room is already occupied.",
        };
      }
    }
    return { ok: false, error: error.message };
  }

  const bookingId = data?.[0]?.booking_id;
  if (!bookingId) {
    return { ok: false, error: "Quick walk-in did not return a booking id." };
  }

  revalidatePath("/bookings");
  revalidatePath("/dashboard");

  return { ok: true, bookingId, pointsAwarded };
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type ChangeTherapistResult =
  | { ok: true }
  | { ok: false; error: string };

export async function changeBookingTherapist(
  bookingId: string,
  newTherapistId: string,
  staffId: string,
  newStartTime: string
): Promise<ChangeTherapistResult> {
  const supabase = await createClient();

  const { data: booking, error: fetchErr } = await supabase
    .from("bookings")
    .select("status, therapist_id, booking_date, start_time")
    .eq("id", bookingId)
    .single();

  if (fetchErr || !booking) {
    return { ok: false, error: fetchErr?.message ?? "Booking not found." };
  }

  if (booking.status === "Completed" || booking.status === "Cancelled") {
    return {
      ok: false,
      error: "Cannot change a Completed or Cancelled booking.",
    };
  }

  const therapistChanged = booking.therapist_id !== newTherapistId;
  const timeChanged = booking.start_time !== newStartTime;

  if (!therapistChanged && !timeChanged) {
    return { ok: false, error: "No changes were made." };
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      therapist_id: newTherapistId,
      start_time: newStartTime,
      ...(booking.status === "Needs Reassignment" ? { status: "Booked" } : {}),
    })
    .eq("id", bookingId);

  if (updateErr) {
    if (updateErr.code === EXCLUSION_VIOLATION) {
      return {
        ok: false,
        error: "That therapist is already booked for the selected time.",
      };
    }
    return { ok: false, error: updateErr.message };
  }

  // Build activity log detail — only log what actually changed.
  const logParts: string[] = [`booking_id=${bookingId} date=${booking.booking_date}`];

  if (therapistChanged) {
    const ids = [booking.therapist_id, newTherapistId].filter((id): id is string => !!id);
    const { data: therapistRows } = ids.length
      ? await supabase.from("therapists").select("id, name").in("id", ids)
      : { data: [] };
    const oldName = therapistRows?.find((t) => t.id === booking.therapist_id)?.name ?? "Unassigned";
    const newName = therapistRows?.find((t) => t.id === newTherapistId)?.name ?? newTherapistId;
    logParts.push(`old_therapist=${oldName} new_therapist=${newName}`);
  }

  if (timeChanged) {
    logParts.push(`old_time=${booking.start_time} new_time=${newStartTime}`);
  }

  await supabase.from("action_logs").insert({
    staff_id: staffId,
    action: "change_therapist",
    detail: logParts.join(" "),
  });

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/call-sheet");

  return { ok: true };
}

export type ResolveMemberQrResult =
  | {
      ok: true;
      client: { id: string; codename: string; username: string; points_balance: number };
    }
  | { ok: false; reason: "not_found" | "orphaned" };

/**
 * Resolves a scanned Member QR token to a client for Log Visit / Quick
 * Walk-in prefill. Lookup only — no ledger/booking writes. "orphaned"
 * (portal account found, linked clients row missing) shouldn't happen given
 * the FK, but is surfaced distinctly from "not_found" rather than a raw error.
 */
export async function resolveMemberQr(qrToken: string): Promise<ResolveMemberQrResult> {
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("client_portal_accounts")
    .select("client_id")
    .eq("qr_token", qrToken)
    .maybeSingle();

  if (!account) {
    return { ok: false, reason: "not_found" };
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, codename, username, points_balance")
    .eq("id", account.client_id)
    .maybeSingle();

  if (!client) {
    return { ok: false, reason: "orphaned" };
  }

  return { ok: true, client };
}

export type LogVisitBookingInput = {
  bookingId: string | null;
  clientId: string | null;
  guestLabel: string | null;
  serviceId: string;
  therapistId: string | null;
  roomNumber: number | null;
  bookingDate: string;
  startTime: string;
  lockerNumber: number;
  promoId: string | null;
  manualDiscountType: "pct" | "fixed" | null;
  manualDiscountValue: number | null;
  addonIds: string[];
  amount: number;
  /** Service-only paid amount (post-promo/discount, excluding add-ons) — the input to the loyalty formula, distinct from `amount` which includes add-ons and is what's recorded on the sale. */
  servicePaidAmount: number;
  paymentMethod: "Cash" | "GCash" | "Card" | "Points";
  paymentRef: string | null;
  isRedemption: boolean;
  upgradeTo?: string | null;
  upgradeCash?: number | null;
  staffId: string;
};

export type LogVisitBookingResult =
  | { ok: true; saleId: string | null; ledgerId: string | null; pointsAwarded: number | null }
  | { ok: false; error: string; field?: "room" | "therapist" | "locker" };

export async function logVisitBooking(
  input: LogVisitBookingInput
): Promise<LogVisitBookingResult> {
  const supabase = await createClient();

  // If no existing booking is linked, use the quick_walkin RPC for atomic creation
  if (!input.bookingId) {
    const res = await quickWalkin({
      clientId: input.clientId,
      guestLabel: input.guestLabel,
      serviceId: input.serviceId,
      therapistId: input.therapistId,
      roomNumber: input.roomNumber,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      lockerNumber: input.lockerNumber,
      promoId: input.promoId,
      manualDiscountType: input.manualDiscountType,
      manualDiscountValue: input.manualDiscountValue,
      addonIds: input.addonIds,
      amount: input.amount,
      servicePaidAmount: input.servicePaidAmount,
      paymentMethod: input.paymentMethod === "GCash" ? "GCash" : "Cash",
      paymentRef: input.paymentRef,
      staffId: input.staffId,
    });
    if (!res.ok) {
      return { ok: false, error: res.error, field: res.field };
    }
    return { ok: true, saleId: null, ledgerId: null, pointsAwarded: res.pointsAwarded };
  }

  // 1. Fetch service info
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("name, price, points_earned")
    .eq("id", input.serviceId)
    .single();

  if (svcErr || !service) {
    return { ok: false, error: svcErr?.message ?? "Service not found." };
  }

  const earnedPoints = input.isRedemption
    ? null
    : await resolveEarnedPoints(
        supabase,
        service.name,
        input.servicePaidAmount,
        service.price,
        service.points_earned
      );

  // 2. Update booking status to Completed
  const { error: bookingErr } = await supabase
    .from("bookings")
    .update({
      status: "Completed",
      service_id: input.serviceId,
      therapist_id: input.therapistId,
      room_number: input.roomNumber,
    })
    .eq("id", input.bookingId);

  if (bookingErr) {
    return { ok: false, error: bookingErr.message };
  }

  // 3. Insert Sale
  const { data: saleData, error: saleErr } = await supabase
    .from("sales")
    .insert({
      client_id: input.clientId,
      guest_label: input.guestLabel,
      booking_id: input.bookingId,
      service_id: input.serviceId,
      therapist_id: input.therapistId,
      amount: input.amount,
      payment_method: input.paymentMethod,
      payment_ref: input.paymentRef,
      promo_id: input.promoId,
      manual_discount_type: input.manualDiscountType,
      manual_discount_value: input.manualDiscountValue,
      processed_by: input.staffId,
    })
    .select("id")
    .single();

  if (saleErr) {
    return { ok: false, error: saleErr.message };
  }

  const saleId = saleData?.id ?? null;

  // 4. Insert Sale Addons
  if (input.addonIds.length > 0 && saleId) {
    const { data: addonsData } = await supabase
      .from("addons")
      .select("id, price")
      .in("id", input.addonIds);

    if (addonsData && addonsData.length > 0) {
      const saleAddonRows = addonsData.map((a) => ({
        sale_id: saleId,
        addon_id: a.id,
        price_at_sale: a.price,
      }));
      await supabase.from("sale_addons").insert(saleAddonRows);
    }
  }

  // 5. Insert Points Transaction (for registered clients)
  // EARN with earnedPoints === null means the loyalty formula isn't
  // configured yet — the ledger insert is skipped entirely (no fabricated
  // zero-point row); the visit still completes, and this is flagged in the
  // action_logs entry below instead of a silent skip.
  let ledgerId: string | null = null;
  if (input.clientId && (input.isRedemption || earnedPoints !== null)) {
    const pointsDelta = input.isRedemption ? -100 : (earnedPoints as number);
    const entryType = input.isRedemption ? "REDEEM" : "EARN";
    const notes = input.isRedemption
      ? `Redemption: ${service.name}${input.upgradeTo ? ` → ${input.upgradeTo} (upgrade)` : ""}`
      : `Visit: ${service.name}`;

    const { data: ledgerData, error: ledgerErr } = await supabase
      .from("point_transactions")
      .insert({
        client_id: input.clientId,
        booking_id: input.bookingId,
        sale_id: saleId,
        points_delta: pointsDelta,
        entry_type: entryType,
        source: "STAFF_MANUAL",
        processed_by: input.staffId,
        notes,
      })
      .select("id")
      .single();

    if (ledgerErr) {
      return { ok: false, error: ledgerErr.message };
    }
    ledgerId = ledgerData?.id ?? null;
  }

  // 6. Assign Locker Occupancy
  const { error: lockerErr } = await supabase.from("locker_occupancy").insert({
    locker_number: input.lockerNumber,
    client_id: input.clientId,
    guest_label: input.guestLabel,
    room_number: input.roomNumber,
    service_id: input.serviceId,
    checked_in_by: input.staffId,
    booking_id: input.bookingId,
  });

  if (lockerErr) {
    if (lockerErr.code === UNIQUE_VIOLATION) {
      if (lockerErr.message.includes("one_active_occupant_per_locker")) {
        return { ok: false, field: "locker", error: "That locker was just taken — pick another." };
      }
      if (lockerErr.message.includes("one_active_occupant_per_room")) {
        return { ok: false, field: "room", error: "That room is already occupied." };
      }
    }
    return { ok: false, error: lockerErr.message };
  }

  // 7. Insert Action Log
  const pointsLogNote =
    input.clientId && !input.isRedemption
      ? ` points_awarded=${earnedPoints === null ? "NONE:formula_not_configured" : earnedPoints}`
      : "";
  await supabase.from("action_logs").insert({
    staff_id: input.staffId,
    action: "log_visit",
    detail: `client=${input.clientId ?? input.guestLabel} service=${service.name} amount=${input.amount} sale_id=${saleId} booking_id=${input.bookingId}${pointsLogNote}`,
  });

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  revalidatePath("/lockers");
  revalidatePath("/call-sheet");

  return { ok: true, saleId, ledgerId, pointsAwarded: input.isRedemption ? null : earnedPoints };
}
