import { createClient } from "@/lib/supabase/server";
import { SalesBrowser } from "@/components/sales-browser";
import { spaDayNow, getSpaDayBounds } from "@/lib/analytics/spa-day";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const selectedDate = params?.date || spaDayNow();
  const bounds = getSpaDayBounds(selectedDate);

  const supabase = await createClient();

  const [{ data: sales }, { data: therapists }, { data: staff }, { data: authorizers }] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, client_id, guest_label, amount, payment_method, payment_ref, therapist_id, voided, voided_at, voided_by, void_reason, edited_by, edited_at, created_at, clients(codename), services(name), therapists(name), promos(label)"
      )
      .gte("created_at", bounds.startIso)
      .lte("created_at", bounds.endIso)
      .order("created_at", { ascending: false }),
    supabase.from("therapists").select("id, name").eq("archived", false).order("name", { ascending: true }),
    supabase.from("staff").select("id, name"),
    supabase
      .from("staff")
      .select("id, name")
      .in("position", ["Supervisor", "Owner"])
      .order("name", { ascending: true }),
  ]);

  const staffNameById = new Map((staff ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="p-6 md:p-8">
      <SalesBrowser
        key={selectedDate}
        selectedDate={selectedDate}
        initialSales={(sales ?? []).map((s) => ({
          id: s.id,
          client_name: s.clients?.codename ?? s.guest_label ?? "Walk-in",
          is_walkin: s.client_id === null,
          service_name: s.services?.name ?? "—",
          amount: Number(s.amount),
          payment_method: s.payment_method,
          payment_ref: s.payment_ref,
          promo_label: s.promos?.label ?? null,
          therapist_id: s.therapist_id,
          therapist_name: s.therapists?.name ?? null,
          voided: s.voided,
          voided_by_name: s.voided_by ? staffNameById.get(s.voided_by) ?? "—" : null,
          void_reason: (s as { void_reason?: string | null }).void_reason ?? null,
          edited_by_name: s.edited_by ? staffNameById.get(s.edited_by) ?? "—" : null,
          created_at: s.created_at,
        }))}
        therapists={therapists ?? []}
        authorizers={authorizers ?? []}
      />
    </div>
  );
}

