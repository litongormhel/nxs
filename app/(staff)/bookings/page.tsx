import { createClient } from "@/lib/supabase/server";
import { BookingBrowser } from "@/components/booking-browser";
import { sortSlotTimes } from "@/lib/bookings/slots";

export default async function BookingsPage() {
  const supabase = await createClient();

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
  ]);

  const timeSlots = sortSlotTimes((weekendSlots ?? []).map((s) => s.slot_time.slice(0, 5)));

  // Which clients can EARN/REDEEM points — must have a client_portal_accounts row
  const portalAccountClientIds = new Set((portalAccounts ?? []).map((p) => p.client_id));
  const clientsWithPortalFlag = (clients ?? []).map((c) => ({
    ...c,
    has_portal_account: portalAccountClientIds.has(c.id),
  }));

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Bookings</h1>

      {clientsError ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Could not load bookings: {clientsError.message}
        </div>
      ) : (
        <BookingBrowser
          clients={clientsWithPortalFlag}
          services={services ?? []}
          therapists={therapists ?? []}
          rooms={(rooms ?? []).map((r) => r.number)}
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
