import { createClient } from "@/lib/supabase/server";
import { ClientBrowser } from "@/components/client-browser";

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

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Client Profile</h1>

      {error ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Could not load clients: {error.message}
        </div>
      ) : !clients || clients.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          No clients yet.
        </div>
      ) : (
        <ClientBrowser
          clients={clientsWithPortalFlag}
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
