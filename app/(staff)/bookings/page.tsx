import { createClient } from "@/lib/supabase/server";
import { BookingBrowser } from "@/components/booking-browser";
import { sortSlotTimes } from "@/lib/bookings/slots";
import { ReassignmentPanel, type FlaggedBooking } from "@/components/reassignment-panel";
import { spaDayNow } from "@/lib/analytics/spa-day";

export default async function BookingsPage() {
  const supabase = await createClient();
  const currentSpaDate = spaDayNow();

  try {
    await supabase.rpc("auto_cancel_lapsed_bookings");
  } catch (err) {
    console.error("Failed to run auto-cancel sweep on bookings load:", err);
  }

  const [
    { data: clients, error: clientsError },
    { data: services },
    { data: therapists },
    { data: rooms },
    { data: staff },
    { data: promos },
    { data: addons },
    { data: lockers },
    { data: weekendSlots },
    { data: portalAccounts },
    { data: dbFlaggedStatus },
    { data: dbActiveBookings },
    { data: dbAbsences },
    { data: dbLeaves },
    { data: dbDaysOff },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, codename, username, member_code")
      .order("codename", { ascending: true }),
    supabase
      .from("services")
      .select("id, name, price, duration_minutes, points_earned")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("therapists")
      .select("id, name")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("rooms")
      .select("number")
      .eq("active", true)
      .order("number", { ascending: true }),
    supabase
      .from("staff")
      .select("id, name, position")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("promos")
      .select("id, label, discount")
      .eq("active", true)
      .order("label", { ascending: true }),
    supabase
      .from("addons")
      .select("id, name, price")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("lockers")
      .select("number")
      .eq("active", true)
      .order("number", { ascending: true }),
    supabase.from("weekend_slots").select("slot_time"),
    supabase.from("client_portal_accounts").select("client_id"),
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, duration_minutes, room_number, therapist_id, status, therapists(name, archived), services(name), clients(codename), guest_label"
      )
      .eq("status", "Needs Reassignment")
      .gte("booking_date", currentSpaDate)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, duration_minutes, room_number, therapist_id, status, therapists(name, archived), services(name), clients(codename), guest_label, locker_occupancy(id, checked_in_at, checked_out_at)"
      )
      .gte("booking_date", currentSpaDate)
      .not("therapist_id", "is", null)
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
  ]);

  const timeSlots = sortSlotTimes((weekendSlots ?? []).map((s) => s.slot_time.slice(0, 5)));

  // Which clients can EARN/REDEEM points — must have a client_portal_accounts row
  const portalAccountClientIds = new Set((portalAccounts ?? []).map((p) => p.client_id));
  const clientsWithPortalFlag = (clients ?? []).map((c) => ({
    ...c,
    has_portal_account: portalAccountClientIds.has(c.id),
  }));

  const activeRooms =
    rooms && rooms.length > 0
      ? rooms.map((r) => r.number)
      : Array.from({ length: 18 }, (_, i) => i + 1);

  type FlaggedRow = {
    id: string;
    booking_date: string;
    start_time: string;
    duration_minutes?: number | null;
    room_number: number | null;
    therapist_id: string | null;
    status: string;
    therapists: { name: string; archived: boolean } | null;
    services: { name: string } | null;
    clients: { codename: string } | null;
    guest_label: string | null;
    locker_occupancy?: { id: string; checked_in_at: string; checked_out_at: string | null }[] | null;
  };

  const normId = (id: string | null | undefined) => String(id || "").trim().toLowerCase();
  const normDate = (d: string | null | undefined) => String(d || "").slice(0, 10);

  const absenceSet = new Set(
    (dbAbsences ?? []).map((a) => `${normId(a.therapist_id)}:${normDate(a.absent_date)}`)
  );

  const absentTherapistIdsToday = new Set(
    (dbAbsences ?? [])
      .filter((a) => normDate(a.absent_date) === currentSpaDate)
      .map((a) => normId(a.therapist_id))
  );

  const isTherapistUnavailable = (
    therapistId: string,
    dateStr: string,
    isArchived?: boolean
  ) => {
    if (isArchived) return true;
    const nid = normId(therapistId);
    const ndate = normDate(dateStr);
    if (absenceSet.has(`${nid}:${ndate}`)) return true;

    const onLeave = (dbLeaves ?? []).some(
      (l) =>
        normId(l.therapist_id) === nid &&
        ndate >= normDate(l.start_date) &&
        ndate <= normDate(l.end_date)
    );
    if (onLeave) return true;

    const dateObj = new Date(`${ndate}T00:00:00`);
    const weekday = dateObj.getDay();
    const isDayOff = (dbDaysOff ?? []).some(
      (d) => normId(d.therapist_id) === nid && d.weekday === weekday
    );
    if (isDayOff) return true;

    return false;
  };

  const mapById = new Map<string, FlaggedRow>();

  for (const b of (dbFlaggedStatus ?? []) as FlaggedRow[]) {
    mapById.set(b.id, b);
  }

  for (const b of (dbActiveBookings ?? []) as FlaggedRow[]) {
    if (!b.therapist_id) continue;
    const nid = normId(b.therapist_id);
    const ndate = normDate(b.booking_date);
    const isAbsentToday = ndate === currentSpaDate && absentTherapistIdsToday.has(nid);

    // Active booking: not cancelled, and either not completed OR checked-in (has active locker stay)
    const isCheckedIn = (b.locker_occupancy ?? []).some((o) => !o.checked_out_at);
    const isActiveBooking =
      b.status !== "Cancelled" && (b.status !== "Completed" || isCheckedIn);

    if (!isActiveBooking) continue;

    if (
      isAbsentToday ||
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

  const reassignmentBookings: FlaggedBooking[] = sortedRows.map((b) => ({
    id: b.id,
    bookingDate: b.booking_date,
    startTime: b.start_time,
    durationMinutes: b.duration_minutes,
    clientLabel: b.clients?.codename ?? b.guest_label ?? "Walk-in",
    serviceName: b.services?.name ?? "Massage",
    roomNumber: b.room_number,
    therapistId: b.therapist_id,
    therapistName: b.therapists?.name ?? "Unassigned",
  }));

  const reassignmentKey = reassignmentBookings
    .map((b) => `${b.id}:${b.therapistId}:${b.startTime}`)
    .join("|");

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Bookings</h1>

      <ReassignmentPanel
        bookings={reassignmentBookings}
        therapists={(therapists ?? []).map((t) => ({ id: t.id, name: t.name }))}
        daysOff={dbDaysOff ?? []}
        absences={dbAbsences ?? []}
        leaves={dbLeaves ?? []}
        allBookings={(dbActiveBookings ?? []).map((b) => ({
          id: b.id,
          therapist_id: b.therapist_id,
          booking_date: b.booking_date,
          start_time: b.start_time,
          duration_minutes: b.duration_minutes,
          status: b.status,
        }))}
        standardSlots={timeSlots}
      />

      {clientsError ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Could not load bookings: {clientsError.message}
        </div>
      ) : (
        <BookingBrowser
          key={reassignmentKey}
          clients={clientsWithPortalFlag}
          services={services ?? []}
          therapists={therapists ?? []}
          rooms={activeRooms}
          staff={staff ?? []}
          promos={promos ?? []}
          addons={addons ?? []}
          lockers={(lockers ?? []).map((l) => l.number)}
          timeSlots={timeSlots}
        />
      )}
    </div>
  );
}
