import { createClient } from "@/lib/supabase/server";
import { CallSheetBrowser } from "@/components/call-sheet-browser";
import { sortSlotTimes } from "@/lib/bookings/slots";
import { toSpaDay, spaDayNow } from "@/lib/analytics/spa-day";

function extractCodename(clientObj: unknown): string | null {
  if (!clientObj) return null;
  if (Array.isArray(clientObj)) {
    return (clientObj[0] as { codename?: string })?.codename ?? null;
  }
  return (clientObj as { codename?: string }).codename ?? null;
}

export default async function CallSheetPage() {
  const supabase = await createClient();

  const [{ data: occupancy }, { data: weekendSlots }] = await Promise.all([
    supabase
      .from("locker_occupancy")
      .select(
        "id, locker_number, room_number, checked_in_at, client_id, guest_label, clients(codename), services(name), bookings(start_time, duration_minutes, guest_label, therapists(name), clients(codename))"
      )
      .is("checked_out_at", null),
    supabase.from("weekend_slots").select("slot_time"),
  ]);

  const today = spaDayNow();

  const entries = (occupancy ?? [])
    .filter((o) => o.services?.name && o.services.name !== "Wet Area")
    .map((o) => {
      const bookingObj = Array.isArray(o.bookings) ? o.bookings[0] : o.bookings;
      const directCodename = extractCodename(o.clients);
      const bookingCodename = extractCodename(bookingObj?.clients);
      const clientCodename =
        directCodename ??
        bookingCodename ??
        o.guest_label ??
        bookingObj?.guest_label ??
        null;

      const therapistName = Array.isArray(bookingObj?.therapists)
        ? bookingObj.therapists[0]?.name
        : bookingObj?.therapists?.name ?? null;

      return {
        id: o.id,
        locker_number: o.locker_number,
        room_number: o.room_number,
        service_name: o.services!.name,
        slot_time: bookingObj?.start_time ? bookingObj.start_time.slice(0, 5) : null,
        duration_minutes: bookingObj?.duration_minutes ?? 90,
        therapist_name: therapistName,
        client_codename: clientCodename,
        guest_or_client: clientCodename ?? "Walk-in",
        checked_in_at: o.checked_in_at,
        stale: toSpaDay(o.checked_in_at) !== today,
      };
    });

  const inProgress = entries.filter((e) => !e.stale);

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
        availableSlots={availableSlots}
      />
    </div>
  );
}
