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

  const [
    salesResFirstTry,
    { data: therapists },
    { data: staff },
    { data: authorizers },
    { data: redeemTransactions },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, client_id, guest_label, booking_id, amount, payment_method, payment_ref, therapist_id, voided, voided_at, voided_by, void_reason, edited_by, edited_at, created_at, clients(codename), services(name), therapists(name), promos(label)"
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
    supabase
      .from("point_transactions")
      .select("sale_id, booking_id")
      .eq("entry_type", "REDEEM")
      .gte("created_at", bounds.startIso)
      .lte("created_at", bounds.endIso),
  ]);

  let sales = salesResFirstTry.data;
  if (salesResFirstTry.error) {
    console.error("Sales query error (attempting fallback without void_reason):", salesResFirstTry.error);
    const fallbackRes = await supabase
      .from("sales")
      .select(
        "id, client_id, guest_label, booking_id, amount, payment_method, payment_ref, therapist_id, voided, voided_at, voided_by, edited_by, edited_at, created_at, clients(codename), services(name), therapists(name), promos(label)"
      )
      .gte("created_at", bounds.startIso)
      .lte("created_at", bounds.endIso)
      .order("created_at", { ascending: false });
    if (fallbackRes.error) {
      console.error("Sales fallback query error:", fallbackRes.error);
    }
    sales = (fallbackRes.data ?? []).map((s) => ({ ...s, void_reason: null }));
  }

  const staffNameById = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const redeemSaleIds = new Set(
    (redeemTransactions ?? []).map((pt) => pt.sale_id).filter(Boolean)
  );
  const redeemBookingIds = new Set(
    (redeemTransactions ?? []).map((pt) => pt.booking_id).filter(Boolean)
  );

  return (
    <div className="p-6 md:p-8">
      <SalesBrowser
        key={selectedDate}
        selectedDate={selectedDate}
        initialSales={(sales ?? []).map((s) => {
          const isRedemption =
            s.payment_method === "Points" ||
            (s.id ? redeemSaleIds.has(s.id) : false) ||
            Boolean(s.booking_id && redeemBookingIds.has(s.booking_id)) ||
            Boolean(s.payment_ref?.toLowerCase().includes("100 pts")) ||
            Boolean(s.payment_ref?.toLowerCase().includes("redemption"));

          return {
            id: s.id,
            booking_id: (s as { booking_id?: string | null }).booking_id ?? null,
            client_name: s.clients?.codename ?? s.guest_label ?? "Walk-in",
            is_walkin: s.client_id === null,
            service_name: s.services?.name ?? "—",
            amount: Number(s.amount),
            payment_method: s.payment_method,
            payment_ref: s.payment_ref,
            promo_label: s.promos?.label ?? null,
            is_redemption: isRedemption,
            therapist_id: s.therapist_id,
            therapist_name: s.therapists?.name ?? null,
            voided: s.voided,
            voided_by_name: s.voided_by ? staffNameById.get(s.voided_by) ?? "—" : null,
            void_reason: (s as { void_reason?: string | null }).void_reason ?? null,
            edited_by_name: s.edited_by ? staffNameById.get(s.edited_by) ?? "—" : null,
            created_at: s.created_at,
          };
        })}
        therapists={therapists ?? []}
        authorizers={authorizers ?? []}
      />
    </div>
  );
}

