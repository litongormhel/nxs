import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("services")
    .select("*", { count: "exact", head: true });

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold">Dashboard</h1>

      <div className="mt-6 max-w-md rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          Connection Test
        </h2>

        {error ? (
          <div className="mt-3 text-sm text-red-400">
            <p className="font-medium">Failed to connect to Supabase.</p>
            <p className="mt-1 text-red-400/70">{error.message}</p>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-3xl font-semibold text-gold">{count}</p>
            <p className="mt-1 text-sm text-muted">rows in `services` table</p>
          </div>
        )}
      </div>
    </div>
  );
}
