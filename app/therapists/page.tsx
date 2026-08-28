import { createClient } from "@/lib/supabase/server";
import { TherapistBrowser, BookingInfo } from "@/components/therapist-browser";

export default async function TherapistsPage() {
  const supabase = await createClient();

  const [{ data: dbTherapists }, { data: dbBookings }] = await Promise.all([
    supabase
      .from("therapists")
      .select("name")
      .order("name", { ascending: true }),
    supabase
      .from("bookings")
      .select(
        "id, booking_date, start_time, status, therapists(name), services(name), clients(codename), guest_label"
      )
      .order("start_time", { ascending: true }),
  ]);

  const therapistNames =
    dbTherapists && dbTherapists.length > 0
      ? dbTherapists.map((t) => t.name)
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
        ];

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
        initialTherapists={therapistNames}
        initialBookings={bookings.length > 0 ? bookings : undefined}
      />
    </div>
  );
}
