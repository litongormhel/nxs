import { createClient } from "@/lib/supabase/server";
import { CallSheetBrowser } from "@/components/call-sheet-browser";
import { sortSlotTimes } from "@/lib/bookings/slots";
import { toSpaDay, spaDayNow } from "@/lib/analytics/spa-day";

export default async function CallSheetPage() {
  const supabase = await createClient();

  const [{ data: occupancy }, { data: weekendSlots }] = await Promise.all([
    supabase
      .from("locker_occupancy")
      .select(
        "id, locker_number, room_number, checked_in_at, client_id, guest_label, clients(codename), services(name), bookings(start_time, therapists(name))"
      )
      .is("checked_out_at", null),
    supabase.from("weekend_slots").select("slot_time"),
  ]);

  const today = spaDayNow();

  const entries = (occupancy ?? [])
    .filter((o) => o.services?.name && o.services.name !== "Wet Area")
    .map((o) => ({
      id: o.id,
      locker_number: o.locker_number,
      room_number: o.room_number,
      service_name: o.services!.name,
      slot_time: o.bookings?.start_time ? o.bookings.start_time.slice(0, 5) : null,
      therapist_name: o.bookings?.therapists?.name ?? null,
      guest_or_client: o.clients?.codename ?? o.guest_label ?? "Walk-in",
      checked_in_at: o.checked_in_at,
      stale: toSpaDay(o.checked_in_at) !== today,
    }));

  const inProgress = entries.filter((e) => !e.stale);
  const needsCheckout = entries.filter((e) => e.stale);

  const availableSlots = sortSlotTimes(
    (weekendSlots ?? []).map((s) => s.slot_time.slice(0, 5))
  );

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Call Sheet
      </h1>
      <CallSheetBrowser
        inProgress={inProgress}
        needsCheckout={needsCheckout}
        availableSlots={availableSlots}
      />
    </div>
  );
}
