import { createClient } from "@/lib/supabase/server";
import { AnalyticsBrowser } from "@/components/analytics-browser";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const [{ data: sales }, { data: bookings }] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, client_id, guest_label, amount, created_at, voided, service_id, therapist_id, services(name), clients(codename, points_balance)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, therapist_id, status, therapists(name, archived)")
      .in("status", ["Booked", "Completed"]),
  ]);

  const shapedSales = (sales ?? []).map((s) => ({
    id: s.id,
    client_id: s.client_id,
    client_name: s.clients?.codename ?? s.guest_label ?? "Walk-in",
    points_balance: s.clients?.points_balance ?? null,
    service_name: s.services?.name ?? "—",
    amount: Number(s.amount),
    created_at: s.created_at,
    voided: s.voided,
  }));

  const shapedBookings = (bookings ?? []).map((b) => ({
    id: b.id,
    therapist_id: b.therapist_id,
    therapist_name: b.therapists?.name ?? null,
    therapist_archived: b.therapists?.archived ?? false,
  }));

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Analytics
      </h1>
      <AnalyticsBrowser sales={shapedSales} bookings={shapedBookings} />
    </div>
  );
}
