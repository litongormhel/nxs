import { createClient } from "@/lib/supabase/server";
import { SalesBrowser } from "@/components/sales-browser";

export default async function SalesPage() {
  const supabase = await createClient();

  const [{ data: sales }, { data: therapists }, { data: staff }] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, client_id, guest_label, amount, payment_method, payment_ref, therapist_id, voided, voided_at, voided_by, edited_by, edited_at, created_at, clients(codename), services(name), therapists(name), promos(label)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("therapists").select("id, name").eq("archived", false).order("name", { ascending: true }),
    supabase.from("staff").select("id, name"),
  ]);

  const staffNameById = new Map((staff ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Sales
      </h1>
      <SalesBrowser
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
          edited_by_name: s.edited_by ? staffNameById.get(s.edited_by) ?? "—" : null,
          created_at: s.created_at,
        }))}
        therapists={therapists ?? []}
      />
    </div>
  );
}
