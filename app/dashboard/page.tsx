import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  let count: number | null = null;
  let errorMsg: string | null = null;
  let isFallback = false;

  try {
    const supabase = await createClient();
    const { count: dbCount, error: dbError } = await supabase
      .from("services")
      .select("*", { count: "exact", head: true });

    if (dbError) {
      throw new Error(dbError.message);
    }

    if (dbCount === null || dbCount === 0) {
      isFallback = true;
      errorMsg = "Database table is empty.";
      count = 3; // Fallback to NXS SPA mock services count
    } else {
      count = dbCount;
    }
  } catch (err: unknown) {
    errorMsg = err instanceof Error ? err.message : "Could not query Supabase database.";
    isFallback = true;
    // Fallback to NXS SPA mock data (3 services: Wet Area, Combi Massage, Signature Massage)
    count = 3;
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Dashboard</h1>

      <div className="mt-6 max-w-md rounded-lg border border-border bg-surface p-5 transition-all hover:border-gold/30">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          Connection Test
        </h2>

        {isFallback ? (
          <div className="mt-3 space-y-3">
            <div className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
              <span className="font-semibold">Offline/Fallback Mode:</span> Using local NXS SPA mock data. ({errorMsg})
            </div>
            <div>
              <p className="text-3xl font-semibold text-gold">{count}</p>
              <p className="mt-1 text-sm text-muted">rows in `services` table (mock fallback)</p>
            </div>
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
