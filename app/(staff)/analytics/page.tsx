import { createClient } from "@/lib/supabase/server";
import { AnalyticsTabs } from "@/components/analytics-tabs";
import type { CommissionService } from "@/components/commission-rates-browser";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const [{ data: sales }, { data: bookings }, { data: commissionable }, { data: rates }] =
    await Promise.all([
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
      supabase
        .from("services")
        .select("id, name")
        .eq("requires_therapist", true)
        .eq("active", true)
        .order("name"),
      supabase
        .from("commission_rates")
        .select("service_id, percent, effective_from")
        .eq("is_active", true),
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

  const rateByService = new Map(
    (rates ?? []).map((r) => [r.service_id, { percent: Number(r.percent), effective_from: r.effective_from }])
  );

  const commissionServices: CommissionService[] = (commissionable ?? []).map((s) => {
    const rate = rateByService.get(s.id);
    return {
      id: s.id,
      name: s.name,
      currentPercent: rate?.percent ?? null,
      effectiveFrom: rate?.effective_from ?? null,
    };
  });

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Analytics
      </h1>
      <AnalyticsTabs
        sales={shapedSales}
        bookings={shapedBookings}
        commissionServices={commissionServices}
      />
    </div>
  );
}
