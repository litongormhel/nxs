import { createClient } from "@/lib/supabase/server";

async function getCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "therapists" | "services" | "rooms" | "lockers",
  filter: { column: string; value: boolean },
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(filter.column, filter.value);

  if (error) {
    return null;
  }
  return count ?? 0;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [availableTherapists, totalServices, totalRooms, totalLockers] =
    await Promise.all([
      getCount(supabase, "therapists", { column: "archived", value: false }),
      getCount(supabase, "services", { column: "active", value: true }),
      getCount(supabase, "rooms", { column: "active", value: true }),
      getCount(supabase, "lockers", { column: "active", value: true }),
    ]);

  const cards = [
    { label: "Available Therapists", value: availableTherapists },
    { label: "Total Services", value: totalServices },
    { label: "Total Rooms", value: totalRooms },
    { label: "Total Lockers", value: totalLockers },
  ];

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Dashboard</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-surface p-5 transition-all hover:border-gold/30"
          >
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
              {card.label}
            </h2>
            <p className="mt-3 text-3xl font-semibold text-gold">
              {card.value ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
