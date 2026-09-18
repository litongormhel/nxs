import { createClient } from "@/lib/supabase/server";
import { ReassignmentPanel, FlaggedBooking } from "@/components/reassignment-panel";
import { spaDayNow } from "@/lib/analytics/spa-day";

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
  const currentSpaDate = spaDayNow();

  const [
    availableTherapists,
    totalServices,
    totalRooms,
    totalLockers,
    { data: dbFlaggedStatus },
    { data: dbActiveBookings },
    { data: dbAbsences },
    { data: dbLeaves },
    { data: dbDaysOff },
    { data: dbTherapists },
  ] = await Promise.all([
    getCount(supabase, "therapists", { column: "archived", value: false }),
    getCount(supabase, "services", { column: "active", value: true }),
    getCount(supabase, "rooms", { column: "active", value: true }),
    getCount(supabase, "lockers", { column: "active", value: true }),
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, room_number, therapist_id, therapists(name, archived), services(name), clients(codename), guest_label"
      )
      .eq("status", "Needs Reassignment")
      .gte("booking_date", currentSpaDate)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, room_number, therapist_id, therapists(name, archived), services(name), clients(codename), guest_label"
      )
      .gte("booking_date", currentSpaDate)
      .not("therapist_id", "is", null)
      .neq("status", "Completed")
      .neq("status", "Cancelled")
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("therapist_absence")
      .select("therapist_id, absent_date")
      .gte("absent_date", currentSpaDate),
    supabase
      .from("therapist_leave")
      .select("therapist_id, start_date, end_date")
      .gte("end_date", currentSpaDate),
    supabase
      .from("therapist_day_off")
      .select("therapist_id, weekday"),
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
    therapists: { name: string; archived: boolean } | null;
    services: { name: string } | null;
    clients: { codename: string } | null;
    guest_label: string | null;
  };

  const absenceSet = new Set((dbAbsences ?? []).map((a) => `${a.therapist_id}:${a.absent_date}`));

  const isTherapistUnavailable = (
    therapistId: string,
    dateStr: string,
    isArchived?: boolean
  ) => {
    if (isArchived) return true;
    if (absenceSet.has(`${therapistId}:${dateStr}`)) return true;

    const onLeave = (dbLeaves ?? []).some(
      (l) => l.therapist_id === therapistId && dateStr >= l.start_date && dateStr <= l.end_date
    );
    if (onLeave) return true;

    const dateObj = new Date(`${dateStr}T00:00:00`);
    const weekday = dateObj.getDay();
    const isDayOff = (dbDaysOff ?? []).some(
      (d) => d.therapist_id === therapistId && d.weekday === weekday
    );
    if (isDayOff) return true;

    return false;
  };

  const mapById = new Map<string, FlaggedRow>();

  for (const b of (dbFlaggedStatus ?? []) as FlaggedRow[]) {
    mapById.set(b.id, b);
  }

  for (const b of (dbActiveBookings ?? []) as FlaggedRow[]) {
    if (
      b.therapist_id &&
      isTherapistUnavailable(b.therapist_id, b.booking_date, b.therapists?.archived)
    ) {
      mapById.set(b.id, b);
    }
  }

  const sortedRows = Array.from(mapById.values()).sort((a, b) => {
    if (a.booking_date !== b.booking_date) {
      return a.booking_date.localeCompare(b.booking_date);
    }
    return (a.start_time || "").localeCompare(b.start_time || "");
  });

  const flaggedBookings: FlaggedBooking[] = sortedRows.map((b) => ({
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
