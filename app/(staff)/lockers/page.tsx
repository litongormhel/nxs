import { createClient } from "@/lib/supabase/server";
import { LockerBoard } from "@/components/locker-board";
import { toSpaDay, spaDayNow } from "@/lib/analytics/spa-day";

export default async function LockersPage() {
  const supabase = await createClient();

  // Run auto-checkout for stale lockers past cutoff before rendering
  try {
    await supabase.rpc("auto_checkout_stale_lockers");
  } catch {
    // Ignore RPC failure if migration not yet applied
  }

  const [lockersRes, { data: occupancy }] = await Promise.all([
    supabase
      .from("lockers")
      .select("number, status, is_maintenance, maintenance_note")
      .eq("active", true)
      .order("number", { ascending: true })
      .then(async (res) => {
        if (res.error) {
          return supabase
            .from("lockers")
            .select("number")
            .eq("active", true)
            .order("number", { ascending: true });
        }
        return res;
      }),
    supabase
      .from("locker_occupancy")
      .select(`
        id, locker_number, room_number, client_id, guest_label, checked_in_at,
        clients(codename),
        services(name),
        bookings(start_time, duration_minutes, room_number, therapists(name), services(name))
      `)
      .is("checked_out_at", null),
  ]);

  const rawLockers = (lockersRes.data ?? []) as Array<{
    number: number;
    status?: string;
    is_maintenance?: boolean;
    maintenance_note?: string | null;
  }>;

  const formattedLockers = rawLockers.map((l) => ({
    number: l.number,
    status: l.status ?? (l.is_maintenance ? "out_of_order" : "available"),
    isMaintenance: Boolean(l.is_maintenance || l.status === "out_of_order" || l.status === "maintenance"),
    maintenanceNote: l.maintenance_note ?? null,
  }));

  const today = spaDayNow();

  const occupancyByLocker = new Map(
    (occupancy ?? []).map((o) => {
      const bookingObj = Array.isArray(o.bookings) ? o.bookings[0] : o.bookings;
      const clientCodename = o.clients?.codename ?? o.guest_label ?? bookingObj?.guest_label ?? "Occupied";
      const therapistName = Array.isArray(bookingObj?.therapists)
        ? bookingObj.therapists[0]?.name
        : bookingObj?.therapists?.name ?? null;
      const serviceName = o.services?.name ?? bookingObj?.services?.name ?? "Wet Area";

      return [
        o.locker_number,
        {
          occupancyId: o.id,
          label: clientCodename,
          clientCodename,
          checkedInAt: o.checked_in_at,
          stale: toSpaDay(o.checked_in_at) !== today,
          roomNumber: o.room_number ?? bookingObj?.room_number ?? null,
          serviceName,
          startTime: bookingObj?.start_time ? bookingObj.start_time.slice(0, 5) : null,
          durationMinutes: bookingObj?.duration_minutes ?? 90,
          therapistName,
        },
      ];
    })
  );

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Lockers
      </h1>
      <LockerBoard
        lockers={formattedLockers}
        lockerNumbers={formattedLockers.map((l) => l.number)}
        occupancy={Object.fromEntries(occupancyByLocker)}
      />
    </div>
  );
}
