import { createClient } from "@/lib/supabase/server";
import { LockerBoard } from "@/components/locker-board";
import { toSpaDay, spaDayNow } from "@/lib/analytics/spa-day";

type RawLocker = {
  number: number;
  status?: string;
  is_maintenance?: boolean;
  maintenance_note?: string | null;
};

async function fetchLockers(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<RawLocker[]> {
  // 1. Try full query with is_maintenance and maintenance_note
  const res1 = await supabase
    .from("lockers")
    .select("number, status, is_maintenance, maintenance_note")
    .eq("active", true)
    .order("number", { ascending: true });

  if (!res1.error && res1.data) {
    return res1.data as RawLocker[];
  }

  // 2. Fallback to status + maintenance_note if is_maintenance is not in schema cache
  const res2 = await supabase
    .from("lockers")
    .select("number, status, maintenance_note")
    .eq("active", true)
    .order("number", { ascending: true });

  if (!res2.error && res2.data) {
    return res2.data as RawLocker[];
  }

  // 3. Fallback to status only if maintenance_note is also not in schema cache
  const res3 = await supabase
    .from("lockers")
    .select("number, status")
    .eq("active", true)
    .order("number", { ascending: true });

  if (!res3.error && res3.data) {
    return res3.data as RawLocker[];
  }

  // 4. Last-resort fallback to number only
  const res4 = await supabase
    .from("lockers")
    .select("number")
    .eq("active", true)
    .order("number", { ascending: true });

  return (res4.data ?? []) as RawLocker[];
}

export default async function LockersPage() {
  const supabase = await createClient();

  // Run auto-checkout for stale lockers past cutoff before rendering
  try {
    await supabase.rpc("auto_checkout_stale_lockers");
  } catch {
    // Ignore RPC failure if migration not yet applied
  }

  const [rawLockers, { data: occupancy }] = await Promise.all([
    fetchLockers(supabase),
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

  const formattedLockers = rawLockers.map((l) => {
    const isMaintenance = Boolean(
      l.is_maintenance || l.status === "out_of_order" || l.status === "maintenance"
    );
    return {
      number: l.number,
      status: l.status ?? (isMaintenance ? "out_of_order" : "available"),
      isMaintenance,
      maintenanceNote: l.maintenance_note ?? null,
    };
  });

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
