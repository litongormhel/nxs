import { createClient } from "@/lib/supabase/server";
import { ClientBrowser, WalkInVisit } from "@/components/client-browser";

export default async function ClientsPage() {
  const supabase = await createClient();

  const [
    { data: clients, error },
    { data: services },
    { data: staff },
    { data: therapists },
    { data: promos },
    { data: addons },
    { data: lockers },
    { data: occupancy },
    { data: portalAccounts },
    { data: rawWalkIns },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, codename, username, member_code, points_balance, since_date, phone, qr_token")
      .order("codename", { ascending: true }),
    supabase
      .from("services")
      .select("id, name, price, duration_minutes, points_earned")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("staff")
      .select("id, name, position")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("therapists")
      .select("id, name")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("promos")
      .select("id, label, discount")
      .eq("active", true)
      .order("discount", { ascending: true }),
    supabase
      .from("addons")
      .select("id, name, price")
      .eq("active", true)
      .order("price", { ascending: true }),
    supabase
      .from("lockers")
      .select("number")
      .order("number", { ascending: true }),
    supabase
      .from("locker_occupancy")
      .select("client_id, locker_number")
      .is("checked_out_at", null)
      .not("client_id", "is", null),
    supabase.from("client_portal_accounts").select("client_id"),
    supabase
      .from("bookings")
      .select(`
        id,
        guest_label,
        booking_date,
        start_time,
        status,
        created_at,
        services ( name ),
        therapists ( name ),
        sales ( amount, payment_method ),
        locker_occupancy ( locker_number )
      `)
      .is("client_id", null)
      .not("guest_label", "is", null)
      .order("booking_date", { ascending: false })
      .order("start_time", { ascending: false }),
  ]);

  // Build map: clientId → active locker number
  const clientLockerMap: Record<string, number> = {};
  for (const row of occupancy ?? []) {
    if (row.client_id) {
      clientLockerMap[row.client_id] = row.locker_number;
    }
  }

  // Which clients can EARN/REDEEM points — must have a client_portal_accounts row
  const portalAccountClientIds = new Set((portalAccounts ?? []).map((p) => p.client_id));
  const clientsWithPortalFlag = (clients ?? []).map((c) => ({
    ...c,
    has_portal_account: portalAccountClientIds.has(c.id),
  }));

  // Parse Walk-In visits
  type RawWalkInRow = {
    id: string;
    guest_label: string | null;
    booking_date: string;
    start_time: string;
    status: string;
    created_at: string;
    services: { name: string } | { name: string }[] | null;
    therapists: { name: string } | { name: string }[] | null;
    sales: { amount: number; payment_method: string } | { amount: number; payment_method: string }[] | null;
    locker_occupancy: { locker_number: number } | { locker_number: number }[] | null;
  };

  const walkInVisits: WalkInVisit[] = ((rawWalkIns ?? []) as RawWalkInRow[]).map((row) => {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    const thera = Array.isArray(row.therapists) ? row.therapists[0] : row.therapists;
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    const occ = Array.isArray(row.locker_occupancy) ? row.locker_occupancy[0] : row.locker_occupancy;

    return {
      id: row.id,
      guest_label: row.guest_label ?? "Walk-in Guest",
      booking_date: row.booking_date,
      start_time: row.start_time,
      status: row.status,
      created_at: row.created_at,
      service_name: svc?.name ?? null,
      therapist_name: thera?.name ?? null,
      locker_number: occ?.locker_number ?? null,
      amount: sale?.amount ?? null,
      payment_method: sale?.payment_method ?? null,
    };
  });

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Client Profile</h1>

      {error ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Could not load clients: {error.message}
        </div>
      ) : (
        <ClientBrowser
          clients={clientsWithPortalFlag}
          walkInVisits={walkInVisits}
          services={services ?? []}
          staff={staff ?? []}
          therapists={therapists ?? []}
          promos={promos ?? []}
          addons={addons ?? []}
          lockers={(lockers ?? []).map((l) => l.number)}
          clientLockerMap={clientLockerMap}
        />
      )}
    </div>
  );
}
