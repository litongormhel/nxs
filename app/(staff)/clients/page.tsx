import { createClient } from "@/lib/supabase/server";
import { ClientBrowser, WalkInVisit, PendingClaim } from "@/components/client-browser";

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
    appSettingsRes,
    visitClaimsRes,
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
    (async () => {
      const fullRes = await supabase
        .from("promos")
        .select("id, label, discount, applicable_days, applicable_slots, min_pax")
        .eq("active", true)
        .order("discount", { ascending: true });
      if (fullRes.error && (fullRes.error.code === "42703" || fullRes.error.code === "PGRST204" || fullRes.error.message?.includes("applicable_days") || fullRes.error.message?.includes("schema cache"))) {
        const fallbackRes = await supabase
          .from("promos")
          .select("id, label, discount")
          .eq("active", true)
          .order("discount", { ascending: true });
        return {
          data: (fallbackRes.data ?? []).map((p) => ({
            ...p,
            applicable_days: null,
            applicable_slots: null,
            min_pax: 1,
          })),
          error: fallbackRes.error,
        };
      }
      return fullRes;
    })(),
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
    (supabase as any)
      .from("app_settings")
      .select("loyalty_formula_mode, peso_per_point, allow_walkin_claims")
      .eq("id", true)
      .maybeSingle(),
    (supabase as any)
      .from("visit_claims")
      .select(`
        id,
        booking_id,
        target_client_id,
        requested_by_staff_id,
        reviewed_by_staff_id,
        points_to_credit,
        status,
        created_at,
        reviewed_at,
        bookings (
          id,
          guest_label,
          booking_date,
          start_time,
          services ( name ),
          therapists ( name ),
          sales ( amount, payment_method, guest_label ),
          locker_occupancy ( locker_number, guest_label )
        )
      `)
      .order("created_at", { ascending: false }),
  ]);

  const appSettings = appSettingsRes?.data ?? null;
  const rawVisitClaims: any[] = visitClaimsRes?.data ?? [];

  // Set of booking_ids that are currently in pending claim status
  const pendingClaimBookingIds = new Set(
    rawVisitClaims
      .filter((c) => c.status === "pending")
      .map((c) => c.booking_id)
  );

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

  // Current operational date in Manila time (Asia/Manila, UTC+8)
  const todayManila = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Parse Walk-In visits (strictly only checked-in or completed stays, excluding pending claims)
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

  const walkInVisits: WalkInVisit[] = ((rawWalkIns ?? []) as RawWalkInRow[])
    .filter((row) => {
      // 1. Exclude scheduled future bookings beyond current operating date
      if (row.booking_date > todayManila) {
        return false;
      }

      // 2. Exclude bookings currently in pending claim status
      if (pendingClaimBookingIds.has(row.id)) {
        return false;
      }

      const normStatus = (row.status ?? "").trim().toLowerCase();
      const isCompletedOrInService = normStatus === "completed" || normStatus === "in_service";

      // Direct locker occupancy linked to this specific booking
      const occ = Array.isArray(row.locker_occupancy) ? row.locker_occupancy[0] : row.locker_occupancy;
      const hasDirectLocker =
        (row as any).locker_number != null ||
        occ?.locker_number != null ||
        occByBookingId[row.id] != null;

      // Direct sales record linked to this specific booking
      const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
      const hasDirectSale =
        (row as any).amount != null ||
        sale?.amount != null ||
        saleByBookingId[row.id] != null;

      // Exclude bookings with status Booked, Needs Reassignment, Cancelled, No-show, pending, etc. that have not checked in
      if (!isCompletedOrInService && !hasDirectLocker && !hasDirectSale) {
        return false;
      }

      // If status is explicitly cancelled or no-show without any valid stay/sales record, exclude
      if ((normStatus === "cancelled" || normStatus === "no-show") && !hasDirectLocker && !hasDirectSale) {
        return false;
      }

      return true;
    })
    .map((row) => {
      const svc = Array.isArray(row.services) ? row.services[0] : row.services;
      const thera = Array.isArray(row.therapists) ? row.therapists[0] : row.therapists;
      const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
      const occ = Array.isArray(row.locker_occupancy) ? row.locker_occupancy[0] : row.locker_occupancy;

      const guestKey = (row.guest_label ?? "").trim().toLowerCase();

      // Cascading locker resolution:
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

  // Resolve Pending Claims with full booking & member metadata
  const pendingClaims: PendingClaim[] = rawVisitClaims
    .filter((c) => c.status === "pending")
    .map((c) => {
      const targetClient = (clients ?? []).find((cl) => cl.id === c.target_client_id);
      const staffMember = (staff ?? []).find((s) => s.id === c.requested_by_staff_id);
      const joinedBooking = Array.isArray(c.bookings) ? c.bookings[0] : c.bookings;
      const rawBooking = joinedBooking ?? ((rawWalkIns ?? []) as RawWalkInRow[]).find((b) => b.id === c.booking_id);

      const svc = Array.isArray(rawBooking?.services) ? rawBooking?.services[0] : rawBooking?.services;
      const thera = Array.isArray(rawBooking?.therapists) ? rawBooking?.therapists[0] : rawBooking?.therapists;
      const sale = Array.isArray(rawBooking?.sales) ? rawBooking?.sales[0] : rawBooking?.sales;
      const occ = Array.isArray(rawBooking?.locker_occupancy) ? rawBooking?.locker_occupancy[0] : rawBooking?.locker_occupancy;
      const bookingOcc = Array.isArray(joinedBooking?.locker_occupancy) ? joinedBooking?.locker_occupancy[0] : joinedBooking?.locker_occupancy;

      const guestKey = (
        rawBooking?.guest_label ??
        joinedBooking?.guest_label ??
        sale?.guest_label ??
        ""
      ).trim().toLowerCase();

      const resolvedGuestLabel =
        joinedBooking?.guest_label ??
        rawBooking?.guest_label ??
        sale?.guest_label ??
        rawWalkInSales?.find((s: any) => s.booking_id === c.booking_id)?.guest_label ??
        allHistoricalOccupancy?.find((o: any) => o.booking_id === c.booking_id)?.guest_label ??
        null;

      let resolvedLocker =
        bookingOcc?.locker_number ??
        occ?.locker_number ??
        (rawBooking as any)?.locker_number ??
        (sale as any)?.locker_number ??
        occByBookingId[c.booking_id] ??
        null;

      if (resolvedLocker == null && guestKey && occByGuestLabel[guestKey]) {
        const historyList = occByGuestLabel[guestKey];
        const targetDate = rawBooking?.booking_date ?? joinedBooking?.booking_date;
        const sameDate = historyList.find((h) => targetDate && h.checked_in_at?.startsWith(targetDate));
        if (sameDate) {
          resolvedLocker = sameDate.locker_number;
        } else if (historyList.length > 0) {
          resolvedLocker = historyList[0].locker_number;
        }
      }

      const resolvedAmount =
        sale?.amount != null
          ? Number(sale.amount)
          : saleByBookingId[c.booking_id]?.amount ?? null;

      const resolvedPaymentMethod =
        sale?.payment_method ??
        saleByBookingId[c.booking_id]?.payment_method ??
        null;

      const codename = resolvedGuestLabel?.trim() || "Walk-in Guest";

      return {
        id: c.id,
        booking_id: c.booking_id,
        target_client_id: c.target_client_id,
        target_client_codename: targetClient?.codename ?? "Unknown Member",
        target_client_username: targetClient?.username ?? "unknown",
        target_client_member_code: targetClient?.member_code ?? "",
        walkin_codename: codename,
        guest_label: resolvedGuestLabel?.trim() || null,
        points_to_credit: c.points_to_credit ?? 0,
        status: c.status,
        created_at: c.created_at,
        requested_by_staff_name: staffMember?.name ?? "Staff",
        booking_date: rawBooking?.booking_date ?? (c.created_at ? c.created_at.split("T")[0] : ""),
        start_time: rawBooking?.start_time ?? null,
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
          pendingClaims={pendingClaims}
          loyaltySettings={{
            mode: appSettings?.loyalty_formula_mode ?? "proportional",
            pesoPerPoint: appSettings?.peso_per_point ?? null,
          }}
          allowWalkinClaims={appSettings?.allow_walkin_claims ?? true}
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
