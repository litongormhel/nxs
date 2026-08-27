import { createClient } from "@/lib/supabase/server";
import { BookingBrowser } from "@/components/booking-browser";

export default async function BookingsPage() {
  const supabase = await createClient();

  const [
    { data: clients, error: clientsError },
    { data: services },
    { data: therapists },
    { data: rooms },
    { data: staff },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, codename, username")
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
  ]);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Bookings</h1>

      {clientsError ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Could not load bookings: {clientsError.message}
        </div>
      ) : (
        <BookingBrowser
          clients={clients ?? []}
          services={services ?? []}
          therapists={therapists ?? []}
          rooms={(rooms ?? []).map((r) => r.number)}
          staff={staff ?? []}
        />
      )}
    </div>
  );
}
