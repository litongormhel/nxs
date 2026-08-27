"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

export type CreateBookingInput = {
  clientId: string | null;
  guestLabel: string | null;
  serviceId: string;
  therapistId: string;
  roomNumber: number;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  status: BookingStatus;
  paxCount: number | null;
  promoId: string | null;
  // TEMP: placeholder actor pending Staff Auth phase — selected manually
  // from the staff directory until sessions/auth.uid() exist.
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
  paymentMethod: "Cash" | "GCash";
  paymentRef: string | null;
  // TEMP: placeholder actor pending Staff Auth phase — selected manually
  // from the staff directory until sessions/auth.uid() exist.
  staffId: string;
};

export type QuickWalkinResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string; field?: "room" | "therapist" | "locker" };

const UNIQUE_VIOLATION = "23505";

export async function quickWalkin(
  input: QuickWalkinInput
): Promise<QuickWalkinResult> {
  const supabase = await createClient();

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

  return { ok: true, bookingId };
}
