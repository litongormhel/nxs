import { createClient } from "@/lib/supabase/server";
import { TherapistBrowser, BookingInfo } from "@/components/therapist-browser";

export default async function TherapistsPage() {
  const supabase = await createClient();

  const [
    { data: dbTherapists },
    { data: dbBookings },
    { data: dbDayOff },
    { data: dbAbsence },
    { data: dbLeave },
    { data: dbServices },
    { data: dbTherapistServices },
  ] = await Promise.all([
    supabase
      .from("therapists")
      .select("id, name, archived, archived_reason, archived_at")
      .order("name", { ascending: true }),
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, status, therapists(name), services(name), clients(codename), guest_label"
      )
      .order("start_time", { ascending: true }),
    supabase.from("therapist_day_off").select("therapist_id, weekday"),
    supabase.from("therapist_absence").select("therapist_id, absent_date"),
    supabase
      .from("therapist_leave")
      .select("therapist_id, start_date, end_date, reason")
      .order("created_at", { ascending: false }),
    supabase.from("services").select("id, name"),
    supabase.from("therapist_services").select("therapist_id, service_id"),
  ]);

  const therapists =
    dbTherapists && dbTherapists.length > 0
      ? dbTherapists.map((t) => ({ id: t.id, name: t.name }))
      : [
          "Ron",
          "Don",
          "Tristan",
          "Leo",
          "Roy",
          "Xander",
          "Dan",
          "Marco",
          "Akio",
          "Josh",
        ].map((name) => ({ id: name, name }));

  const archivedByTherapist: Record<
    string,
    { reason: string; archivedAt: string }
  > = {};
  (dbTherapists ?? []).forEach((t) => {
    if (t.archived) {
      archivedByTherapist[t.id] = {
        reason: t.archived_reason ?? "",
        archivedAt: t.archived_at ?? "",
      };
    }
  });

  const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOffByTherapist: Record<string, string[]> = {};
  (dbDayOff ?? []).forEach((row) => {
    const wd = WEEKDAY_NAMES[row.weekday];
    if (!wd) return;
    (dayOffByTherapist[row.therapist_id] ??= []).push(wd);
  });

  const absenceByTherapist: Record<string, string[]> = {};
  (dbAbsence ?? []).forEach((row) => {
    (absenceByTherapist[row.therapist_id] ??= []).push(row.absent_date);
  });

  const leaveByTherapist: Record<
    string,
    { start: string; end: string; reason: string }
  > = {};
  (dbLeave ?? []).forEach((row) => {
    if (leaveByTherapist[row.therapist_id]) return; // most recent only, per created_at desc order
    leaveByTherapist[row.therapist_id] = {
      start: row.start_date,
      end: row.end_date,
      reason: row.reason ?? "",
    };
  });

  const serviceIds: Record<string, string> = {};
  (dbServices ?? []).forEach((s) => {
    serviceIds[s.name] = s.id;
  });

  const servicesByTherapist: Record<string, string[]> = {};
  (dbTherapistServices ?? []).forEach((row) => {
    const service = (dbServices ?? []).find((s) => s.id === row.service_id);
    if (!service) return;
    (servicesByTherapist[row.therapist_id] ??= []).push(service.name);
  });

  const bookings: BookingInfo[] = (dbBookings ?? []).map((b: any) => ({
    id: b.id,
    therapist: b.therapists?.name ?? "",
    clientName: b.clients?.codename ?? b.guest_label ?? "Walk-in",
    date: b.booking_date,
    time: b.start_time,
    service: b.services?.name ?? "Massage",
    status: b.status,
  }));

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Therapists
      </h1>

      <TherapistBrowser
        initialTherapists={therapists}
        initialDayOff={dayOffByTherapist}
        initialBookings={bookings.length > 0 ? bookings : undefined}
        initialAbsence={absenceByTherapist}
        initialLeave={leaveByTherapist}
        initialArchived={archivedByTherapist}
        initialServices={servicesByTherapist}
        serviceIds={serviceIds}
      />
    </div>
  );
}
