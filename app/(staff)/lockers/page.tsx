import { createClient } from "@/lib/supabase/server";
import { LockerBoard } from "@/components/locker-board";

export default async function LockersPage() {
  const supabase = await createClient();

  const [{ data: lockers }, { data: occupancy }] = await Promise.all([
    supabase
      .from("lockers")
      .select("number")
      .eq("active", true)
      .order("number", { ascending: true }),
    supabase
      .from("locker_occupancy")
      .select("id, locker_number, client_id, guest_label, checked_in_at, clients(codename)")
      .is("checked_out_at", null),
  ]);

  const occupancyByLocker = new Map(
    (occupancy ?? []).map((o) => [
      o.locker_number,
      {
        occupancyId: o.id,
        label: o.clients?.codename ?? o.guest_label ?? "Occupied",
        checkedInAt: o.checked_in_at,
      },
    ])
  );

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Lockers
      </h1>
      <LockerBoard
        lockerNumbers={(lockers ?? []).map((l) => l.number)}
        occupancy={Object.fromEntries(occupancyByLocker)}
      />
    </div>
  );
}
