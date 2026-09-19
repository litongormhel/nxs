"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { logVisitBooking } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { ScanMemberQrModal, type ScannedClient } from "@/components/scan-member-qr-modal";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";
import type {
  Addon,
  Client,
  Promo,
  Service,
  Staff,
  Therapist,
} from "@/components/booking-browser";
import type { Database } from "@/lib/types/database";

type BookingOption = {
  id: string;
  client_id: string | null;
  guest_label: string | null;
  service_id: string;
  therapist_id: string | null;
  room_number: number | null;
  booking_date: string;
  start_time: string;
  promo_id: string | null;
  status: Database["public"]["Enums"]["booking_status"];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(t: string): string {
  if (!t || !t.includes(":")) return t;
  const [h, m] = t.split(":");
  const hr = ((+h + 11) % 12) + 1;
  return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
}

export function LogVisitModal({
  clients,
  services,
  therapists,
  staff,
  promos = [],
  addons = [],
  lockers = [],
  initialBooking = null,
  initialClientId = null,
  initialServiceId = null,
  onClose,
  onLogged,
}: {
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  staff: Staff[];
  promos?: Promo[];
  addons?: Addon[];
  lockers?: number[];
  initialBooking?: BookingOption | null;
  initialClientId?: string | null;
  initialServiceId?: string | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    initialBooking?.id ?? null
  );
  const [bookingQuery, setBookingQuery] = useState("");
  const [openBookings, setOpenBookings] = useState<BookingOption[]>([]);
  const [showBookingResults, setShowBookingResults] = useState(false);

  const [clientId, setClientId] = useState<string | null>(
    initialBooking ? initialBooking.client_id : (initialClientId ?? clients[0]?.id ?? null)
  );
  const [guestLabel, setGuestLabel] = useState<string | null>(
    initialBooking?.guest_label ?? null
  );

  const isGuestOrigin = useMemo(
    () => (initialBooking ? !initialBooking.client_id : !initialClientId),
    [initialBooking, initialClientId]
  );

  const [clientLinkQuery, setClientLinkQuery] = useState("");
  const [showClientLinkResults, setShowClientLinkResults] = useState(false);
  const [showScanQrModal, setShowScanQrModal] = useState(false);
  const [scannedFallback, setScannedFallback] = useState<{
    codename: string;
    username: string;
  } | null>(null);

  const matchingClients = useMemo(() => {
    if (!clientLinkQuery.trim()) return [];
    const q = clientLinkQuery.toLowerCase();
    return clients
      .filter(
        (c) =>
          c.codename.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clientLinkQuery, clients]);

  function handleScanResolved(scannedClient: ScannedClient) {
    setShowScanQrModal(false);
    setClientId(scannedClient.id);
    setGuestLabel(null);
    const foundInClients = clients.some((c) => c.id === scannedClient.id);
    if (!foundInClients) {
      setScannedFallback({
        codename: scannedClient.codename,
        username: scannedClient.username,
      });
    } else {
      setScannedFallback(null);
    }
  }

  const [date, setDate] = useState(initialBooking?.booking_date ?? todayIso());
  const [serviceId, setServiceId] = useState<string>(
    initialBooking?.service_id ?? initialServiceId ?? services[0]?.id ?? ""
  );
  const [therapistId, setTherapistId] = useState<string>(
    initialBooking?.therapist_id ?? ""
  );
  type ActiveOccupancy = {
    locker_number: number;
    booking_id: string | null;
    client_id: string | null;
  };

  const [lockerNumber, setLockerNumber] = useState<number | "">("");
  const [activeOccupancies, setActiveOccupancies] = useState<ActiveOccupancy[]>([]);
  const [maintenanceLockers, setMaintenanceLockers] = useState<Map<number, string | null>>(new Map());

  const [isRedemption, setIsRedemption] = useState(false);
  const [isUpgraded, setIsUpgraded] = useState(false);
  const [upgradeTo, setUpgradeTo] = useState("Signature Massage");
  const [upgradeCash, setUpgradeCash] = useState(300);

  const [manualDiscountOn, setManualDiscountOn] = useState(false);
  const [discountType, setDiscountType] = useState<"pct" | "fixed">("pct");
  const [discountValue, setDiscountValue] = useState(25);

  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [promoId, setPromoId] = useState<string>(initialBooking?.promo_id ?? "none");
  const [paymentMethod, setPaymentMethod] = useState<
    "Cash" | "GCash" | "Split (Cash + GCash)"
  >("Cash");
  const [splitCash, setSplitCash] = useState<number | "">(0);
  const [splitGcash, setSplitGcash] = useState<number | "">(0);
  const [lastEditedField, setLastEditedField] = useState<"cash" | "gcash">("cash");
  const [gcashRef, setGcashRef] = useState("");
  const { sessionStaff } = useStaffSim();
  const actor = sessionStaff;
  const staffId = actor?.id ?? "";

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pointsWarning, setPointsWarning] = useState<string | null>(null);
  const showSummaryState = useState(false);
  const [showSummary, setShowSummary] = showSummaryState;

  const [loyaltySettings, setLoyaltySettings] = useState<{
    mode: LoyaltyFormulaMode;
    pesoPerPoint: number | null;
  }>({ mode: "proportional", pesoPerPoint: null });

  // Fetch open bookings, occupied lockers, out-of-order lockers, and loyalty settings on mount
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bookings")
      .select(
        "id, client_id, guest_label, service_id, therapist_id, room_number, booking_date, start_time, promo_id, status"
      )
      .in("status", ["Booked", "Needs Reassignment"])
      .order("booking_date", { ascending: true })
      .then(({ data }) => setOpenBookings((data as BookingOption[]) ?? []));

    supabase
      .from("lockers")
      .select("number, status, is_maintenance, maintenance_note")
      .eq("active", true)
      .then(({ data }) => {
        const map = new Map<number, string | null>();
        for (const l of data ?? []) {
          if (l.is_maintenance || l.status === "out_of_order" || l.status === "maintenance") {
            map.set(l.number, l.maintenance_note ?? null);
          }
        }
        setMaintenanceLockers(map);
      });

    supabase
      .from("locker_occupancy")
      .select("locker_number, booking_id, client_id")
      .is("checked_out_at", null)
      .then(({ data }) =>
        setActiveOccupancies((data as ActiveOccupancy[]) ?? [])
      );

    supabase
      .from("app_settings")
      .select("loyalty_formula_mode, peso_per_point")
      .eq("id", true)
      .single()
      .then(({ data }) => {
        setLoyaltySettings({
          mode: (data?.loyalty_formula_mode as LoyaltyFormulaMode) || "proportional",
          pesoPerPoint: data?.peso_per_point ?? null,
        });
      });
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);
  const selectedService = services.find((s) => s.id === serviceId);
  const isWetArea = selectedService?.name === "Wet Area";
  const selectedPromo = promos.find((p) => p.id === promoId);

  const lockerOptions = useMemo(() => {
    const all = lockers.length > 0 ? lockers : Array.from({ length: 100 }, (_, i) => i + 1);
    return all.map((num) => {
      const occ = activeOccupancies.find((o) => o.locker_number === num);
      const isMine =
        !!occ &&
        ((!!selectedBookingId && occ.booking_id === selectedBookingId) ||
          (!!clientId && occ.client_id === clientId));
      const isOccupied = !!occ && !isMine;
      const isMaintenance = maintenanceLockers.has(num);
      const maintenanceNote = maintenanceLockers.get(num) ?? null;

      return {
        number: num,
        isOccupied,
        isMine,
        isMaintenance,
        maintenanceNote,
      };
    });
  }, [lockers, activeOccupancies, selectedBookingId, clientId, maintenanceLockers]);

  // Filtered booking search results
  const matchingBookings = useMemo(() => {
    if (!bookingQuery.trim()) return [];
    const q = bookingQuery.toLowerCase();
    return openBookings.filter((b) => {
      const cName = b.client_id
        ? (clients.find((c) => c.id === b.client_id)?.codename ?? "")
        : (b.guest_label ?? "");
      return cName.toLowerCase().includes(q);
    });
  }, [bookingQuery, openBookings, clients]);

  const linkedBooking = useMemo(() => {
    if (!selectedBookingId) return null;
    return (
      openBookings.find((b) => b.id === selectedBookingId) ??
      initialBooking ??
      null
    );
  }, [selectedBookingId, openBookings, initialBooking]);

  function linkBooking(b: BookingOption) {
    setSelectedBookingId(b.id);
    setShowBookingResults(false);
    setBookingQuery("");
    if (b.client_id) {
      setClientId(b.client_id);
      setGuestLabel(null);
    } else {
      setClientId(null);
      setGuestLabel(b.guest_label);
    }
    setServiceId(b.service_id);
    setTherapistId(b.therapist_id ?? "");
    setDate(b.booking_date);
    if (b.promo_id) setPromoId(b.promo_id);
    const existingOcc = activeOccupancies.find((o) => o.booking_id === b.id);
    if (existingOcc) {
      setLockerNumber(existingOcc.locker_number);
    }
  }

  function onServiceSelect(val: string) {
    if (val === "REDEEM") {
      setIsRedemption(true);
      const combi = services.find((s) => s.name === "Combi Massage") ?? services[0];
      if (combi) setServiceId(combi.id);
    } else {
      setIsRedemption(false);
      setIsUpgraded(false);
      setServiceId(val);
      const s = services.find((x) => x.id === val);
      if (s?.name === "Wet Area") {
        setTherapistId("");
        setPromoId("none");
      }
    }
  }

  function onPromoChange(val: string) {
    setPromoId(val);
    if (val !== "none") {
      setManualDiscountOn(false);
    }
  }

  function onManualDiscountToggle(checked: boolean) {
    setManualDiscountOn(checked);
    if (checked) {
      setPromoId("none");
    }
  }

  function toggleAddon(id: string) {
    setAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const computedAmount = useMemo(() => {
    if (isRedemption && !isUpgraded) return 0;
    if (isRedemption && isUpgraded) {
      const addonsTotal = addons
        .filter((a) => addonIds.includes(a.id))
        .reduce((sum, a) => sum + a.price, 0);
      return upgradeCash + addonsTotal;
    }

    const basePrice = selectedService?.price ?? 0;
    let value = basePrice;
    if (selectedPromo) {
      value = Math.max(basePrice - selectedPromo.discount, 0);
    } else if (manualDiscountOn) {
      value =
        discountType === "pct"
          ? Math.max(Math.round(basePrice * (1 - discountValue / 100)), 0)
          : Math.max(basePrice - discountValue, 0);
    }

    const addonsTotal = addons
      .filter((a) => addonIds.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0);

    return value + addonsTotal;
  }, [
    isRedemption,
    isUpgraded,
    upgradeCash,
    selectedService,
    selectedPromo,
    manualDiscountOn,
    discountType,
    discountValue,
    addonIds,
    addons,
  ]);

  // Service-only paid amount (post-promo/discount, excluding add-ons) — the
  // input to the loyalty formula. Distinct from computedAmount, which is
  // what's recorded on the sale and includes add-ons.
  const servicePaidAmount = useMemo(() => {
    if (isRedemption && !isUpgraded) return 0;
    if (isRedemption && isUpgraded) return upgradeCash;

    const basePrice = selectedService?.price ?? 0;
    if (selectedPromo) return Math.max(basePrice - selectedPromo.discount, 0);
    if (manualDiscountOn) {
      return discountType === "pct"
        ? Math.max(Math.round(basePrice * (1 - discountValue / 100)), 0)
        : Math.max(basePrice - discountValue, 0);
    }
    return basePrice;
  }, [
    isRedemption,
    isUpgraded,
    upgradeCash,
    selectedService,
    selectedPromo,
    manualDiscountOn,
    discountType,
    discountValue,
  ]);

  // Calculate dynamic points (auto) based on formula mode
  const pointsDelta = useMemo(() => {
    if (isRedemption) return -100;
    if (isWetArea) return WET_AREA_POINTS;
    if (!selectedService) return 0;
    return computeLoyaltyPoints(
      loyaltySettings.mode,
      servicePaidAmount,
      selectedService.price,
      selectedService.points_earned,
      loyaltySettings.pesoPerPoint
    );
  }, [
    isRedemption,
    isWetArea,
    selectedService,
    loyaltySettings,
    servicePaidAmount,
  ]);

  useEffect(() => {
    if (paymentMethod === "Split (Cash + GCash)") {
      if (lastEditedField === "gcash") {
        const g = typeof splitGcash === "number" ? splitGcash : 0;
        setSplitCash(Math.max(0, computedAmount - g));
      } else {
        const c = typeof splitCash === "number" ? splitCash : 0;
        setSplitGcash(Math.max(0, computedAmount - c));
      }
    }
  }, [computedAmount, paymentMethod, lastEditedField]);

  const numCash = typeof splitCash === "number" ? splitCash : (parseFloat(String(splitCash)) || 0);
  const numGcash = typeof splitGcash === "number" ? splitGcash : (parseFloat(String(splitGcash)) || 0);
  const isSplit = paymentMethod === "Split (Cash + GCash)";
  const isSplitValid = !isSplit || (numCash >= 0 && numGcash >= 0 && Math.abs((numCash + numGcash) - computedAmount) < 0.01);

  const canEarnRedeem = !clientId || !!selectedClient?.has_portal_account || !!scannedFallback;

  const canSubmit =
    !isPending &&
    (clientId ? true : (guestLabel && guestLabel.trim().length > 0)) &&
    !!serviceId &&
    (isWetArea || !!therapistId) &&
    !!lockerNumber &&
    !!staffId &&
    canEarnRedeem &&
    isSplitValid;

  function handleConfirm() {
    setError(null);
    if (!canEarnRedeem) {
      setError("Walang portal account — hindi pa mag-eearn/redeem ng points.");
      return;
    }
    if (!isWetArea && !therapistId) {
      setError("Please select a therapist for this service.");
      return;
    }
    if (!lockerNumber) {
      setError("Please assign a locker.");
      return;
    }
    if (maintenanceLockers.has(Number(lockerNumber))) {
      const note = maintenanceLockers.get(Number(lockerNumber));
      setError(`Locker #${lockerNumber} is out of order${note ? ` (${note})` : ""} and cannot be assigned.`);
      return;
    }
    if (!isSplitValid) {
      setError(`Sum of Cash (₱${numCash}) and GCash (₱${numGcash}) must equal total amount paid (₱${computedAmount}).`);
      return;
    }
    setShowSummary(true);
  }

  function handleFinalizeSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await logVisitBooking({
        bookingId: selectedBookingId,
        clientId,
        guestLabel,
        serviceId,
        therapistId: isWetArea ? null : therapistId,
        roomNumber: linkedBooking?.room_number ?? null,
        bookingDate: date,
        startTime: linkedBooking?.start_time ?? "16:00",
        lockerNumber: Number(lockerNumber),
        promoId: promoId === "none" ? null : promoId,
        manualDiscountType: manualDiscountOn ? discountType : null,
        manualDiscountValue: manualDiscountOn ? discountValue : null,
        addonIds,
        amount: computedAmount,
        servicePaidAmount,
        paymentMethod,
        splitCashAmount: isSplit ? numCash : null,
        splitGcashAmount: isSplit ? numGcash : null,
        paymentRef: (paymentMethod === "GCash" || (isSplit && numGcash > 0)) ? gcashRef.trim() || null : null,
        isRedemption,
        upgradeTo: isUpgraded ? upgradeTo : null,
        upgradeCash: isUpgraded ? upgradeCash : null,
        staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (clientId && !isRedemption && result.pointsAwarded === null) {
        setPointsWarning(
          "Visit logged, pero WALANG POINTS na-award — hindi pa naka-configure ang loyalty formula sa Settings."
        );
        return;
      }

      onLogged();
    });
  }

  if (pointsWarning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-xl border border-[#a97e2e] bg-surface p-6 shadow-2xl space-y-4">
          <h2 className="text-base font-semibold text-accent-gold">⚠ Points Not Awarded</h2>
          <p className="text-sm text-foreground">{pointsWarning}</p>
          <button
            type="button"
            onClick={() => {
              setPointsWarning(null);
              onLogged();
            }}
            className="w-full rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  if (showSummary) {
    const clientCodenameDisplay = selectedClient
      ? selectedClient.codename
      : scannedFallback
      ? scannedFallback.codename
      : (guestLabel && guestLabel.trim().length > 0)
      ? guestLabel
      : "Walk-in Guest";

    const therapistDisplay = isWetArea
      ? "None (Wet Area)"
      : therapists.find((t) => t.id === therapistId)?.name ?? "—";

    const massageTimeDisplay = linkedBooking?.start_time
      ? fmtTime(linkedBooking.start_time)
      : "4:00 PM";
    const lockerDisplay = lockerNumber ? `Locker ${lockerNumber}` : "—";
    const roomDisplay = linkedBooking?.room_number ? `Room ${linkedBooking.room_number}` : "—";

    const baseServiceName = selectedService?.name ?? (isRedemption ? "Combi Massage" : "—");
    const serviceWithUpgrade = isRedemption && isUpgraded ? `${baseServiceName} (Upgraded to ${upgradeTo})` : baseServiceName;
    const selectedAddonNames = addons
      .filter((a) => addonIds.includes(a.id))
      .map((a) => a.name);
    const serviceAvailedDisplay = selectedAddonNames.length > 0
      ? `${serviceWithUpgrade} (+ ${selectedAddonNames.join(", ")})`
      : serviceWithUpgrade;

    const paymentBreakdown =
      paymentMethod === "Cash"
        ? `₱${computedAmount.toLocaleString()} (Cash)`
        : paymentMethod === "GCash"
        ? `₱${computedAmount.toLocaleString()} (GCash${gcashRef.trim() ? ` - Ref: ${gcashRef.trim()}` : ""})`
        : `₱${computedAmount.toLocaleString()} (Cash: ₱${numCash.toLocaleString()} | GCash: ₱${numGcash.toLocaleString()}${gcashRef.trim() ? ` - Ref: ${gcashRef.trim()}` : ""})`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-5">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Confirm Check-in</h2>
              <p className="text-xs text-muted">Review visit summary receipt before finalizing</p>
            </div>
            <span className="rounded-md bg-gold/10 px-2 py-1 text-[11px] font-medium text-accent-gold ring-1 ring-inset ring-gold/20">
              Summary
            </span>
          </div>

          {/* Scannable Receipt Card */}
          <div className="rounded-lg border border-[#292524] bg-[#0c0a09] p-4 space-y-3 font-sans text-xs">
            <div className="flex items-center justify-between border-b border-[#292524] pb-2.5">
              <span className="text-muted">Client Codename</span>
              <span className="font-bold text-accent-gold text-sm">{clientCodenameDisplay}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-[#292524] pb-2.5">
              <div>
                <span className="text-muted block text-[11px]">Therapist</span>
                <span className="font-medium text-foreground">{therapistDisplay}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Massage Time</span>
                <span className="font-mono text-foreground">{massageTimeDisplay}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-[#292524] pb-2.5">
              <div>
                <span className="text-muted block text-[11px]">Locker Number</span>
                <span className="font-medium text-foreground">{lockerDisplay}</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Room Number</span>
                <span className="font-medium text-foreground">{roomDisplay}</span>
              </div>
            </div>

            <div className="border-b border-[#292524] pb-2.5">
              <span className="text-muted block text-[11px]">Service Availed</span>
              <span className="font-medium text-foreground">{serviceAvailedDisplay}</span>
            </div>

            {clientId && (
              <div className="border-b border-[#292524] pb-2.5 flex items-center justify-between">
                <span className="text-muted text-[11px]">Points Earned</span>
                <span className="font-mono text-xs font-bold text-accent-gold">
                  {pointsDelta >= 0 ? `+${pointsDelta} pts` : `${pointsDelta} pts`}
                </span>
              </div>
            )}

            <div>
              <span className="text-muted block text-[11px]">Total Payment</span>
              <div className="font-mono text-base font-bold text-accent-gold mt-0.5">
                ₱{computedAmount.toLocaleString()}
              </div>
              <div className="font-mono text-[11px] text-muted mt-0.5">
                {paymentBreakdown}
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowSummary(false)}
              disabled={isPending}
              className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-gold/30 disabled:opacity-50"
            >
              Back / Edit
            </button>
            <button
              type="button"
              onClick={handleFinalizeSubmit}
              disabled={isPending}
              className="flex-[1.4] rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Finalizing…
                </>
              ) : (
                "Finalize Check-in"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-foreground">Log Visit</h2>
        <p className="mt-0.5 text-xs text-muted">
          {selectedClient
            ? `${selectedClient.codename} · @${selectedClient.username}`
            : scannedFallback
            ? `${scannedFallback.codename} · @${scannedFallback.username}`
            : guestLabel ?? "Walk-in Guest"}
        </p>
        {isGuestOrigin && clientId !== null && (
          <button
            type="button"
            onClick={() => {
              setClientId(null);
              setGuestLabel(linkedBooking?.guest_label ?? guestLabel ?? null);
              setScannedFallback(null);
            }}
            className="mt-1 text-xs text-gold hover:underline block"
          >
            Unlink account (back to walk-in)
          </button>
        )}
        {!canEarnRedeem && (
          <p className="mt-1 text-xs text-accent-red">
            Walang portal account — hindi pa mag-eearn/redeem ng points.
          </p>
        )}

        {!clientId && (
          <div className="mt-3 rounded-lg border border-border bg-background/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">
                Link to Client Account <span className="text-muted font-normal">(optional — enables points)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowScanQrModal(true)}
                className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground hover:border-gold/50"
              >
                Scan QR
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search client by codename or username…"
                value={clientLinkQuery}
                onChange={(e) => {
                  setClientLinkQuery(e.target.value);
                  setShowClientLinkResults(true);
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-gold outline-none"
              />
              {showClientLinkResults && matchingClients.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                  {matchingClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setClientId(client.id);
                        setGuestLabel(null);
                        setScannedFallback(null);
                        setClientLinkQuery("");
                        setShowClientLinkResults(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-gold/10 border-b border-border last:border-0"
                    >
                      <span className="font-semibold text-gold">{client.codename}</span>{" "}
                      <span className="text-muted">(@{client.username})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {/* Find Booking */}
          <div>
            <label className="text-xs text-muted" htmlFor="fBookingSearch">
              Find Booking <span className="opacity-70">(search any name — including walk-ins)</span>
            </label>
            <input
              id="fBookingSearch"
              type="text"
              placeholder="Type a name or codename…"
              value={bookingQuery}
              onChange={(e) => {
                setBookingQuery(e.target.value);
                setShowBookingResults(true);
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            />
            {showBookingResults && matchingBookings.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background">
                {matchingBookings.map((b) => {
                  const cName = b.client_id
                    ? (clients.find((c) => c.id === b.client_id)?.codename ?? "Client")
                    : (b.guest_label ?? "Walk-in");
                  const sName =
                    services.find((s) => s.id === b.service_id)?.name ?? "Service";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => linkBooking(b)}
                      className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-gold/10 border-b border-border last:border-0"
                    >
                      <span className="font-semibold text-gold">{cName}</span> —{" "}
                      {fmtDate(b.booking_date)} {fmtTime(b.start_time)} · {sName}
                      {b.room_number ? ` (Room ${b.room_number})` : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {linkedBooking && (
              <p className="mt-1 text-xs text-muted">
                Linked:{" "}
                <span className="font-semibold text-accent-gold">
                  {linkedBooking.client_id
                    ? (clients.find((c) => c.id === linkedBooking.client_id)?.codename ?? "Client")
                    : (linkedBooking.guest_label ?? "Walk-in")}
                </span>{" "}
                · Room {linkedBooking.room_number ?? "—"}
              </p>
            )}
          </div>

          {/* Date of Visit & Therapist */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="fDate">
                Date of Visit
              </label>
              <input
                id="fDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="fTherapist">
                Therapist <span className="opacity-70">(required unless Wet Area)</span>
              </label>
              {!isWetArea && linkedBooking ? (
                <div className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground opacity-80">
                  {therapists.find((t) => t.id === linkedBooking.therapist_id)?.name ??
                    "— unassigned —"}
                </div>
              ) : (
                <select
                  id="fTherapist"
                  value={therapistId}
                  disabled={isWetArea}
                  onChange={(e) => setTherapistId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none disabled:opacity-50"
                >
                  <option value="">— none —</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Assign Locker */}
          <div>
            <label className="text-xs text-muted" htmlFor="fLocker">
              Assign Locker
            </label>
            <select
              id="fLocker"
              value={lockerNumber}
              onChange={(e) => setLockerNumber(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            >
              <option value="">— select a free locker —</option>
              {lockerOptions.map((opt) => {
                const disabled = opt.isOccupied || opt.isMaintenance;
                return (
                  <option
                    key={opt.number}
                    value={opt.number}
                    disabled={disabled}
                    className={disabled ? "text-muted" : undefined}
                  >
                    Locker {opt.number}{
                      opt.isMaintenance
                        ? ` — Out of Order${opt.maintenanceNote ? ` (${opt.maintenanceNote})` : ""}`
                        : opt.isOccupied
                        ? " — Occupied"
                        : opt.isMine
                        ? " (Assigned)"
                        : ""
                    }
                  </option>
                );
              })}
            </select>
          </div>

          {/* Availed Service */}
          <div>
            <label className="text-xs text-muted" htmlFor="fService">
              Availed Service
            </label>
            <select
              id="fService"
              value={isRedemption ? "REDEEM" : serviceId}
              onChange={(e) => onServiceSelect(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (+{s.points_earned} pts)
                </option>
              ))}
              <option value="REDEEM">Redeem: Combi Massage Reward (−100 pts)</option>
            </select>
          </div>

          {/* Upgrade Box (when Redeem) */}
          {isRedemption && (
            <div className="rounded-lg border border-dashed border-[#a97e2e] bg-[#c89b3c]/5 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  id="fUpgrade"
                  checked={isUpgraded}
                  onChange={(e) => setIsUpgraded(e.target.checked)}
                  className="accent-gold"
                />
                Upgraded with cash top-up
              </label>
              {isUpgraded && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs text-muted" htmlFor="fUpgradeTo">
                      Upgraded To
                    </label>
                    <select
                      id="fUpgradeTo"
                      value={upgradeTo}
                      onChange={(e) => setUpgradeTo(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                    >
                      <option>Signature Massage</option>
                      <option>Scrub</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted" htmlFor="fUpgradeCash">
                      Cash Top-up (₱)
                    </label>
                    <input
                      id="fUpgradeCash"
                      type="number"
                      value={upgradeCash}
                      onChange={(e) => setUpgradeCash(Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Discount Box */}
          <div className="rounded-lg border border-dashed border-[#5e3c3c] bg-red-950/10 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                id="fManualDiscount"
                checked={manualDiscountOn}
                onChange={(e) => onManualDiscountToggle(e.target.checked)}
                disabled={promoId !== "none"}
                className="accent-gold"
              />
              Manual discount (e.g. Senior or PWD)
            </label>
            {manualDiscountOn && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted" htmlFor="fDiscountType">
                    Type
                  </label>
                  <select
                    id="fDiscountType"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "pct" | "fixed")}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                  >
                    <option value="pct">Percentage</option>
                    <option value="fixed">Fixed ₱</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted" htmlFor="fDiscountValue">
                    Value
                  </label>
                  <input
                    id="fDiscountValue"
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Promo Code */}
          <div>
            <label className="text-xs text-muted" htmlFor="fPromo">
              Promo Code <span className="opacity-70">(optional — one discount at a time)</span>
            </label>
            <select
              id="fPromo"
              value={promoId}
              disabled={manualDiscountOn}
              onChange={(e) => onPromoChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none disabled:opacity-50"
            >
              <option value="none">None</option>
              {promos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (−₱{p.discount})
                </option>
              ))}
            </select>
          </div>

          {/* Add-ons Box */}
          {addons.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                Add-ons <span className="opacity-70">(optional)</span>
              </label>
              <div className="space-y-2">
                {addons.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center justify-between text-sm text-foreground cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.id)}
                        onChange={() => toggleAddon(a.id)}
                        className="accent-gold"
                      />
                      {a.name}
                    </span>
                    <span className="font-mono text-xs text-muted">+₱{a.price}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Points & Amount Paid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="fPoints">
                Added Points <span className="opacity-70">(auto)</span>
              </label>
              <input
                id="fPoints"
                type={clientId ? "number" : "text"}
                value={clientId ? pointsDelta : "N/A — no account linked"}
                disabled
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground opacity-70"
              />
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="fAmount">
                Amount Paid (₱) <span className="opacity-70">(auto)</span>
              </label>
              <input
                id="fAmount"
                type="number"
                value={computedAmount}
                disabled
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground opacity-70 font-mono"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-xs text-muted" htmlFor="fPayment">
              Payment Method
            </label>
            <select
              id="fPayment"
              value={paymentMethod}
              onChange={(e) => {
                const newMethod = e.target.value as "Cash" | "GCash" | "Split (Cash + GCash)";
                setPaymentMethod(newMethod);
                if (newMethod === "Split (Cash + GCash)") {
                  setSplitCash(computedAmount);
                  setSplitGcash(0);
                  setLastEditedField("cash");
                }
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            >
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Split (Cash + GCash)">Split (Cash + GCash)</option>
            </select>
          </div>

          {/* Split Payment Form Controls */}
          {paymentMethod === "Split (Cash + GCash)" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted" htmlFor="fSplitCash">
                    Cash Amount (₱)
                  </label>
                  <input
                    id="fSplitCash"
                    type="number"
                    min="0"
                    step="any"
                    value={splitCash}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === "") {
                        setSplitCash("");
                        setLastEditedField("cash");
                      } else {
                        const val = parseFloat(valStr);
                        const num = isNaN(val) ? 0 : val;
                        setSplitCash(num);
                        setSplitGcash(Math.max(0, computedAmount - num));
                        setLastEditedField("cash");
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted" htmlFor="fSplitGcash">
                    GCash Amount (₱)
                  </label>
                  <input
                    id="fSplitGcash"
                    type="number"
                    min="0"
                    step="any"
                    value={splitGcash}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === "") {
                        setSplitGcash("");
                        setLastEditedField("gcash");
                      } else {
                        const val = parseFloat(valStr);
                        const num = isNaN(val) ? 0 : val;
                        setSplitGcash(num);
                        setSplitCash(Math.max(0, computedAmount - num));
                        setLastEditedField("gcash");
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none font-mono"
                  />
                </div>
              </div>

              {!isSplitValid && (
                <p className="text-xs text-amber-400 font-medium">
                  ⚠ Sum of Cash (₱{numCash.toLocaleString()}) and GCash (₱{numGcash.toLocaleString()}) must equal required total (₱{computedAmount.toLocaleString()}).
                </p>
              )}
            </div>
          )}

          {/* GCash Ref */}
          {(paymentMethod === "GCash" || (paymentMethod === "Split (Cash + GCash)" && numGcash > 0)) && (
            <div>
              <label className="text-xs text-muted" htmlFor="fGcashRef">
                GCash Reference Number <span className="opacity-70">(optional)</span>
              </label>
              <input
                id="fGcashRef"
                type="text"
                placeholder="e.g. 1234567890"
                value={gcashRef}
                onChange={(e) => setGcashRef(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p
              id="modalError"
              className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-gold/30 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-[1.4] rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
      {showScanQrModal && (
        <div className="relative z-[60]">
          <ScanMemberQrModal
            onClose={() => setShowScanQrModal(false)}
            onResolved={handleScanResolved}
          />
        </div>
      )}
    </div>
  );
}
