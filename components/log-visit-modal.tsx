"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { logVisitBooking } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
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
    initialBooking?.client_id ?? initialClientId ?? clients[0]?.id ?? null
  );
  const [guestLabel, setGuestLabel] = useState<string | null>(
    initialBooking?.guest_label ?? null
  );

  const [date, setDate] = useState(initialBooking?.booking_date ?? todayIso());
  const [serviceId, setServiceId] = useState<string>(
    initialBooking?.service_id ?? services[0]?.id ?? ""
  );
  const [therapistId, setTherapistId] = useState<string>(
    initialBooking?.therapist_id ?? ""
  );
  const [lockerNumber, setLockerNumber] = useState<number | "">("");
  const [occupiedLockers, setOccupiedLockers] = useState<Set<number>>(new Set());

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
    "Cash" | "GCash" | "Card" | "Points"
  >("Cash");
  const [gcashRef, setGcashRef] = useState("");
  const { sessionStaff } = useStaffSim();
  const actor = sessionStaff;
  const staffId = actor?.id ?? "";

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch open bookings and occupied lockers on mount
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
      .from("locker_occupancy")
      .select("locker_number")
      .is("checked_out_at", null)
      .then(({ data }) =>
        setOccupiedLockers(new Set((data ?? []).map((r) => r.locker_number)))
      );
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);
  const selectedService = services.find((s) => s.id === serviceId);
  const isWetArea = selectedService?.name === "Wet Area";
  const selectedPromo = promos.find((p) => p.id === promoId);

  const freeLockers = useMemo(() => {
    if (lockers.length === 0) {
      const all: number[] = [];
      for (let i = 1; i <= 100; i++) all.push(i);
      return all.filter((n) => !occupiedLockers.has(n));
    }
    return lockers.filter((n) => !occupiedLockers.has(n));
  }, [lockers, occupiedLockers]);

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

  // Calculate points and amount
  const pointsDelta = isRedemption ? -100 : selectedService?.points_earned ?? 0;

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

  const canSubmit =
    !isPending &&
    (clientId ? true : (guestLabel && guestLabel.trim().length > 0)) &&
    !!serviceId &&
    (isWetArea || !!therapistId) &&
    !!lockerNumber &&
    !!staffId;

  function handleConfirm() {
    setError(null);
    if (!isWetArea && !therapistId) {
      setError("Please select a therapist for this service.");
      return;
    }
    if (!lockerNumber) {
      setError("Please assign a locker.");
      return;
    }

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
        paymentMethod,
        paymentRef: paymentMethod === "GCash" ? gcashRef.trim() || null : null,
        isRedemption,
        upgradeTo: isUpgraded ? upgradeTo : null,
        upgradeCash: isUpgraded ? upgradeCash : null,
        staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onLogged();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-foreground">Log Visit</h2>
        <p className="mt-0.5 text-xs text-muted">
          {selectedClient
            ? `${selectedClient.codename} · @${selectedClient.username}`
            : guestLabel ?? "Walk-in Guest"}
        </p>

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
                <span className="font-semibold text-[#f3d48b]">
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
              {freeLockers.map((n) => (
                <option key={n} value={n}>
                  Locker {n}
                </option>
              ))}
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
                type="number"
                value={pointsDelta}
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

          {/* Payment Method & Promo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="fPayment">
                Payment Method
              </label>
              <select
                id="fPayment"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as "Cash" | "GCash" | "Card" | "Points"
                  )
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Card">Card</option>
                <option value="Points">Points</option>
              </select>
            </div>
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
          </div>

          {/* GCash Ref */}
          {paymentMethod === "GCash" && (
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

          {/* Logged by staff */}
          <div>
            <div className="text-xs text-muted">Logged by (staff)</div>
            <div className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
              {actor ? `${actor.name} · ${actor.position}` : "—"}
            </div>
          </div>

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
    </div>
  );
}
