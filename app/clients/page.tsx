import { createClient } from "@/lib/supabase/server";
import { ClientBrowser } from "@/components/client-browser";

export default async function ClientsPage() {
  const supabase = await createClient();

  const [{ data: clients, error }, { data: services }, { data: staff }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, codename, username, member_code, points_balance")
        .order("codename", { ascending: true }),
      supabase
        .from("services")
        .select("id, name, price, points_earned")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("staff")
        .select("id, name, position")
        .eq("active", true)
        .order("name", { ascending: true }),
    ]);

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
          clients={clients}
          services={services ?? []}
          staff={staff ?? []}
        />
      )}
    </div>
  );
}
