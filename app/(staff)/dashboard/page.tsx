import { createClient } from "@/lib/supabase/server";
import { ReassignmentPanel, FlaggedBooking } from "@/components/reassignment-panel";

async function getCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "therapists" | "services" | "rooms" | "lockers",
  filter: { column: string; value: boolean },
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(filter.column, filter.value);

  if (error) {
    return null;
  }
  return count ?? 0;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    availableTherapists,
    totalServices,
    totalRooms,
    totalLockers,
    { data: dbFlagged },
    { data: dbTherapists },
  ] = await Promise.all([
    getCount(supabase, "therapists", { column: "archived", value: false }),
    getCount(supabase, "services", { column: "active", value: true }),
    getCount(supabase, "rooms", { column: "active", value: true }),
    getCount(supabase, "lockers", { column: "active", value: true }),
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, room_number, therapist_id, therapists(name), services(name), clients(codename), guest_label"
      )
      .eq("status", "Needs Reassignment")
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("therapists")
      .select("id, name")
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);

  type FlaggedRow = {
    id: string;
    booking_date: string;
    start_time: string;
    room_number: number | null;
    therapist_id: string | null;
    therapists: { name: string } | null;
    services: { name: string } | null;
    clients: { codename: string } | null;
    guest_label: string | null;
  };

  const flaggedBookings: FlaggedBooking[] = ((dbFlagged ?? []) as FlaggedRow[]).map((b) => ({
    id: b.id,
    bookingDate: b.booking_date,
    startTime: b.start_time,
    clientLabel: b.clients?.codename ?? b.guest_label ?? "Walk-in",
    serviceName: b.services?.name ?? "Massage",
    roomNumber: b.room_number,
    therapistId: b.therapist_id,
    therapistName: b.therapists?.name ?? "Unassigned",
  }));

  const therapistOptions = (dbTherapists ?? []).map((t) => ({ id: t.id, name: t.name }));

  const cards = [
    { label: "Available Therapists", value: availableTherapists },
    { label: "Total Services", value: totalServices },
    { label: "Total Rooms", value: totalRooms },
    { label: "Total Lockers", value: totalLockers },
  ];

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Dashboard</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-surface p-5 transition-all hover:border-gold/30"
          >
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
              {card.label}
            </h2>
            <p className="mt-3 text-3xl font-semibold text-gold">
              {card.value ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <ReassignmentPanel initialFlagged={flaggedBookings} therapists={therapistOptions} />
    </div>
  );
}
