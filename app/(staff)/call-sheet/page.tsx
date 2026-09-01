import { createClient } from "@/lib/supabase/server";
import { CallSheetBrowser } from "@/components/call-sheet-browser";
import { sortSlotTimes } from "@/lib/bookings/slots";

export default async function CallSheetPage() {
  const supabase = await createClient();

  const [{ data: occupancy }, { data: weekendSlots }] = await Promise.all([
    supabase
      .from("locker_occupancy")
      .select(
        "id, locker_number, room_number, checked_in_at, services(name), bookings(start_time, therapists(name))"
      )
      .is("checked_out_at", null),
    supabase.from("weekend_slots").select("slot_time"),
  ]);

  const entries = (occupancy ?? [])
    .filter((o) => o.services?.name && o.services.name !== "Wet Area")
    .map((o) => ({
      id: o.id,
      locker_number: o.locker_number,
      room_number: o.room_number,
      service_name: o.services!.name,
      slot_time: o.bookings?.start_time ? o.bookings.start_time.slice(0, 5) : null,
      therapist_name: o.bookings?.therapists?.name ?? null,
    }));

  const availableSlots = sortSlotTimes(
    (weekendSlots ?? []).map((s) => s.slot_time.slice(0, 5))
  );

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Call Sheet
      </h1>
      <CallSheetBrowser entries={entries} availableSlots={availableSlots} />
    </div>
  );
}
