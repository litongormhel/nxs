import { createClient } from "@/lib/supabase/server";
import { ClientBrowser, WalkInVisit } from "@/components/client-browser";

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
    { data: rawWalkIns },
    { data: rawMemberTransactions },
    { data: rawMemberBookings },
    { data: allHistoricalOccupancy },
    { data: rawWalkInSales },
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
    supabase
      .from("bookings")
      .select(`
        id,
        guest_label,
        booking_date,
        start_time,
        room_number,
        status,
        created_at,
        services ( name ),
        therapists ( name ),
        sales ( amount, payment_method ),
        locker_occupancy ( locker_number )
      `)
      .is("client_id", null)
      .not("guest_label", "is", null)
      .order("booking_date", { ascending: false })
      .order("start_time", { ascending: false }),
    supabase
      .from("point_transactions")
      .select(`
        id,
        client_id,
        booking_id,
        sale_id,
        entry_type,
        points_delta,
        source,
        notes,
        created_at,
        sales (
          amount,
          payment_method,
          services ( name ),
          therapists ( name ),
          staff ! sales_processed_by_fkey ( name )
        ),
        bookings (
          booking_date,
          start_time,
          status,
          services ( name ),
          therapists ( name ),
          locker_occupancy ( locker_number )
        )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(`
        id,
        client_id,
        booking_date,
        start_time,
        status,
        created_at,
        services ( name ),
        therapists ( name ),
        sales ( amount, payment_method ),
        locker_occupancy ( locker_number )
      `)
      .not("client_id", "is", null)
      .order("booking_date", { ascending: false })
      .order("start_time", { ascending: false }),
    supabase
      .from("locker_occupancy")
      .select("id, locker_number, guest_label, booking_id, checked_in_at")
      .order("checked_in_at", { ascending: false }),
    supabase
      .from("sales")
      .select("id, booking_id, guest_label, amount, payment_method, created_at")
      .not("guest_label", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  // Build map: clientId → active locker number
  const clientLockerMap: Record<string, number> = {};
  for (const row of occupancy ?? []) {
    if (row.client_id) {
      clientLockerMap[row.client_id] = row.locker_number;
    }
  }

  // Build lookup maps for historical locker occupancy
  const occByBookingId: Record<string, number> = {};
  const occByGuestLabel: Record<string, { locker_number: number; checked_in_at: string }[]> = {};

  for (const occ of (allHistoricalOccupancy ?? [])) {
    if (occ.booking_id && occ.locker_number != null) {
      occByBookingId[occ.booking_id] = occ.locker_number;
    }
    if (occ.guest_label && occ.locker_number != null) {
      const key = occ.guest_label.trim().toLowerCase();
      if (!occByGuestLabel[key]) {
        occByGuestLabel[key] = [];
      }
      occByGuestLabel[key].push({
        locker_number: occ.locker_number,
        checked_in_at: occ.checked_in_at,
      });
    }
  }

  // Build lookup maps for historical sales
  const saleByBookingId: Record<string, { amount: number; payment_method: string | null }> = {};
  const saleByGuestLabel: Record<string, { amount: number; payment_method: string | null; created_at: string }[]> = {};

  for (const sale of (rawWalkInSales ?? [])) {
    if (sale.booking_id && sale.amount != null) {
      saleByBookingId[sale.booking_id] = {
        amount: Number(sale.amount),
        payment_method: sale.payment_method ?? null,
      };
    }
    if (sale.guest_label && sale.amount != null) {
      const key = sale.guest_label.trim().toLowerCase();
      if (!saleByGuestLabel[key]) {
        saleByGuestLabel[key] = [];
      }
      saleByGuestLabel[key].push({
        amount: Number(sale.amount),
        payment_method: sale.payment_method ?? null,
        created_at: sale.created_at,
      });
    }
  }

  // Members Tab MUST strictly contain clients with a registered portal account
  const portalAccountClientIds = new Set((portalAccounts ?? []).map((p) => p.client_id));
  const registeredMembers = (clients ?? [])
    .filter((c) => portalAccountClientIds.has(c.id))
    .map((c) => ({
      ...c,
      has_portal_account: true,
    }));

  // Parse Walk-In visits
  type RawWalkInRow = {
    id: string;
    guest_label: string | null;
    booking_date: string;
    start_time: string;
    room_number: number | null;
    status: string;
    created_at: string;
    services: { name: string } | { name: string }[] | null;
    therapists: { name: string } | { name: string }[] | null;
    sales: { amount: number; payment_method: string } | { amount: number; payment_method: string }[] | null;
    locker_occupancy: { locker_number: number } | { locker_number: number }[] | null;
  };

  const walkInVisits: WalkInVisit[] = ((rawWalkIns ?? []) as RawWalkInRow[]).map((row) => {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    const thera = Array.isArray(row.therapists) ? row.therapists[0] : row.therapists;
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    const occ = Array.isArray(row.locker_occupancy) ? row.locker_occupancy[0] : row.locker_occupancy;

    const guestKey = (row.guest_label ?? "").trim().toLowerCase();

    // Cascading locker resolution:
    // 1. row.locker_number or sale.locker_number (defensive)
    // 2. joined row.locker_occupancy (via booking_id)
    // 3. historical occupancy matched by booking_id
    // 4. historical occupancy matched by guest_label on booking date
    // 5. latest historical occupancy for that guest_label
    let resolvedLocker: number | null =
      (row as any).locker_number ??
      (sale as any)?.locker_number ??
      occ?.locker_number ??
      occByBookingId[row.id] ??
      null;

    if (resolvedLocker == null && guestKey && occByGuestLabel[guestKey]) {
      const historyList = occByGuestLabel[guestKey];
      const sameDate = historyList.find((h) => h.checked_in_at?.startsWith(row.booking_date));
      if (sameDate) {
        resolvedLocker = sameDate.locker_number;
      } else if (historyList.length > 0) {
        resolvedLocker = historyList[0].locker_number;
      }
    }

    // Cascading amount & payment method resolution:
    let resolvedAmount: number | null = sale?.amount != null ? Number(sale.amount) : null;
    let resolvedPaymentMethod: string | null = sale?.payment_method ?? null;

    if (resolvedAmount == null && saleByBookingId[row.id]) {
      resolvedAmount = saleByBookingId[row.id].amount;
      resolvedPaymentMethod = resolvedPaymentMethod ?? saleByBookingId[row.id].payment_method;
    }

    if (resolvedAmount == null && guestKey && saleByGuestLabel[guestKey]) {
      const historySales = saleByGuestLabel[guestKey];
      const sameDateSale = historySales.find((s) => s.created_at?.startsWith(row.booking_date));
      if (sameDateSale) {
        resolvedAmount = sameDateSale.amount;
        resolvedPaymentMethod = resolvedPaymentMethod ?? sameDateSale.payment_method;
      } else if (historySales.length > 0) {
        resolvedAmount = historySales[0].amount;
        resolvedPaymentMethod = resolvedPaymentMethod ?? historySales[0].payment_method;
      }
    }

    return {
      id: row.id,
      guest_label: row.guest_label ?? "Walk-in Guest",
      booking_date: row.booking_date,
      start_time: row.start_time,
      room_number: row.room_number ?? null,
      status: row.status,
      created_at: row.created_at,
      service_name: svc?.name ?? null,
      therapist_name: thera?.name ?? null,
      locker_number: resolvedLocker,
      amount: resolvedAmount,
      payment_method: resolvedPaymentMethod,
    };
  });

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in">Client Profile</h1>

      {error ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          Could not load clients: {error.message}
        </div>
      ) : (
        <ClientBrowser
          clients={registeredMembers}
          walkInVisits={walkInVisits}
          memberTransactions={(rawMemberTransactions ?? []) as any[]}
          memberBookings={(rawMemberBookings ?? []) as any[]}
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
