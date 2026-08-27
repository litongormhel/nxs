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
