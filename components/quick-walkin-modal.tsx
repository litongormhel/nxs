"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { quickWalkin } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap } from "@/lib/bookings/slots";
import type {
  Addon,
  Client,
  Promo,
  Service,
  Staff,
  Therapist,
} from "@/components/booking-browser";
import type { Database } from "@/lib/types/database";

type ConflictRow = {
  therapist_id: string | null;
  room_number: number | null;
  start_time: string;
  duration_minutes: number | null;
};

const ACTIVE_STATUSES: Database["public"]["Enums"]["booking_status"][] = [
  "Booked",
  "Completed",
  "Needs Reassignment",
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function roundedNowTime(): string {
  const d = new Date();
  let h = d.getHours();
  let m = Math.round(d.getMinutes() / 30) * 30;
  if (m === 60) {
    m = 0;
    h += 1;
  }
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtTime(t: string): string {
  if (!t || !t.includes(":")) return t;
  const [h, m] = t.split(":");
  const hr = ((+h + 11) % 12) + 1;
  return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
}

export function QuickWalkinModal({
  clients,
  services,
  therapists,
  rooms,
  staff,
  promos,
  addons,
  lockers,
  timeSlots,
  initialClientId = null,
  onClose,
  onCreated,
}: {
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  rooms: number[];
  staff: Staff[];
  promos: Promo[];
  addons: Addon[];
  lockers: number[];
  timeSlots: string[];
  initialClientId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const date = todayIso();

  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  // Set when opened via a Member QR scan — the client field is locked to a
  // read-only display until the user explicitly clicks "Change client", so a
  // scan can't be silently overridden by an accidental keystroke.
  const [clientLocked, setClientLocked] = useState(!!initialClientId);
  const [guestName, setGuestName] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [therapistId, setTherapistId] = useState<string>("");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [slotTime, setSlotTime] = useState<string>("");
  const [customTime, setCustomTime] = useState(roundedNowTime());
  const [roomNumber, setRoomNumber] = useState<number | "">("");
  const [lockerNumber, setLockerNumber] = useState<number | "">("");
  const [promoId, setPromoId] = useState<string>("none");
  const [manualDiscountOn, setManualDiscountOn] = useState(false);
  const [discountType, setDiscountType] = useState<"pct" | "fixed">("pct");
  const [discountValue, setDiscountValue] = useState(25);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitMethod1, setSplitMethod1] = useState<string>("Cash");
  const [splitAmount1, setSplitAmount1] = useState<number | "">(0);
  const [splitMethod2, setSplitMethod2] = useState<string>("GCash");
  const [splitAmount2, setSplitAmount2] = useState<number | "">(0);
  const [lastEditedSplitField, setLastEditedSplitField] = useState<"amount1" | "amount2">("amount1");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [gcashRef, setGcashRef] = useState("");
  const { sessionStaff } = useStaffSim();
  const actor = sessionStaff;
  const staffId = actor?.id ?? "";
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [unavailableTherapists, setUnavailableTherapists] = useState<Map<string, string>>(new Map());
  const [occupiedLockers, setOccupiedLockers] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pointsWarning, setPointsWarning] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bookings")
      .select("therapist_id, room_number, start_time, duration_minutes")
      .eq("booking_date", date)
      .in("status", ACTIVE_STATUSES)
      .then(({ data }) => setConflicts(data ?? []));
    supabase
      .from("locker_occupancy")
      .select("locker_number")
      .is("checked_out_at", null)
      .then(({ data }) => setOccupiedLockers(new Set((data ?? []).map((r) => r.locker_number))));
  }, [date]);

  useEffect(() => {
    const supabase = createClient();
    const weekday = new Date(`${date}T00:00:00`).getDay();
    Promise.all([
      supabase.from("therapist_day_off").select("therapist_id, weekday"),
      supabase.from("therapist_absence").select("therapist_id, absent_date").eq("absent_date", date),
      supabase
        .from("therapist_leave")
        .select("therapist_id, start_date, end_date")
        .lte("start_date", date)
        .gte("end_date", date),
    ]).then(([dayOff, absence, leave]) => {
      const map = new Map<string, string>();
      for (const row of dayOff.data ?? []) {
        if (row.weekday === weekday) map.set(row.therapist_id, "Day Off");
      }
      for (const row of absence.data ?? []) {
        map.set(row.therapist_id, "Absent");
      }
      for (const row of leave.data ?? []) {
        map.set(row.therapist_id, "On Leave");
      }
      setUnavailableTherapists(map);
    });
  }, [date]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const selectedService = services.find((s) => s.id === serviceId);
  const duration = selectedService?.duration_minutes ?? 0;
  const isMassageService = selectedService?.name !== "Wet Area";
  const time = useCustomTime ? customTime : slotTime;

  const takenTherapists = useMemo(() => {
    const taken = new Set<string>();
    if (!time) return taken;
    for (const row of conflicts) {
      if (!row.therapist_id) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? 0)) {
        taken.add(row.therapist_id);
      }
    }
    return taken;
  }, [conflicts, time, duration]);

  const effectiveRooms = useMemo(
    () => (rooms && rooms.length > 0 ? rooms : Array.from({ length: 18 }, (_, i) => i + 1)),
    [rooms]
  );

  // Taken slots in the slot grid (therapist busy or no rooms available)
  const takenSlots = useMemo(() => {
    const taken = new Set<string>();
    for (const slot of timeSlots) {
      const therapistBusy =
        !!therapistId &&
        conflicts.some(
          (c) =>
            c.therapist_id === therapistId &&
            slotsOverlap(slot, duration, c.start_time, c.duration_minutes ?? 0)
        );

      const takenRooms = new Set<number>();
      for (const row of conflicts) {
        if (row.room_number == null) continue;
        if (slotsOverlap(slot, duration, row.start_time, row.duration_minutes ?? 0)) {
          takenRooms.add(row.room_number);
        }
      }
      const freeRoomCount = effectiveRooms.filter((r) => !takenRooms.has(r)).length;

      if (therapistBusy || freeRoomCount === 0) {
        taken.add(slot);
      }
    }
    return taken;
  }, [conflicts, therapistId, duration, effectiveRooms, timeSlots]);

  // Therapists with zero free slots anywhere in the day's slot grid
  const fullyBookedTherapists = useMemo(() => {
    const fullyBooked = new Set<string>();
    if (timeSlots.length === 0) return fullyBooked;
    for (const t of therapists) {
      const hasFreeSlot = timeSlots.some(
        (slot) =>
          !conflicts.some(
            (c) =>
              c.therapist_id === t.id &&
              slotsOverlap(slot, duration, c.start_time, c.duration_minutes ?? 0)
          )
      );
      if (!hasFreeSlot) fullyBooked.add(t.id);
    }
    return fullyBooked;
  }, [therapists, timeSlots, conflicts, duration]);

  const freeRooms = useMemo(() => {
    if (!time) return [];
    const taken = new Set<number>();
    for (const row of conflicts) {
      if (row.room_number == null) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? 0)) {
        taken.add(row.room_number);
      }
    }
    return effectiveRooms.filter((r) => !taken.has(r));
  }, [conflicts, time, duration, effectiveRooms]);

  const freeLockers = useMemo(
    () => lockers.filter((n) => !occupiedLockers.has(n)),
    [lockers, occupiedLockers]
  );

  const filteredClients = useMemo(() => {
    if (!clientQuery.trim()) return [];
    const q = clientQuery.toLowerCase();
    return clients
      .filter(
        (c) => c.codename.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clients, clientQuery]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const selectedPromo = promos.find((p) => p.id === promoId);

  // Reset dependent selections when service changes (mirrors mockup's onWalkinServiceChange)
  function onServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    setTherapistId("");
    setSlotTime("");
    setUseCustomTime(false);
    setRoomNumber("");
    setPromoId("none");
    setManualDiscountOn(false);
  }

  const amount = useMemo(() => {
    const base = selectedService?.price ?? 0;
    let value = base;
    if (selectedPromo) {
      value = Math.max(base - selectedPromo.discount, 0);
    } else if (manualDiscountOn) {
      value =
        discountType === "pct"
          ? Math.max(Math.round(base * (1 - discountValue / 100)), 0)
          : Math.max(base - discountValue, 0);
    }
    const addonsTotal = addons
      .filter((a) => addonIds.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0);
    return value + addonsTotal;
  }, [selectedService, selectedPromo, manualDiscountOn, discountType, discountValue, addonIds, addons]);

  // Service-only paid amount (post-promo/discount, excluding add-ons) — the
  // input to the loyalty formula. Distinct from `amount`, which is what's
  // recorded on the sale and includes add-ons.
  const servicePaidAmount = useMemo(() => {
    const base = selectedService?.price ?? 0;
    if (selectedPromo) return Math.max(base - selectedPromo.discount, 0);
    if (manualDiscountOn) {
      return discountType === "pct"
        ? Math.max(Math.round(base * (1 - discountValue / 100)), 0)
        : Math.max(base - discountValue, 0);
    }
    return base;
  }, [selectedService, selectedPromo, manualDiscountOn, discountType, discountValue]);

  useEffect(() => {
    if (isSplitPayment) {
      if (lastEditedSplitField === "amount2") {
        const a2 = typeof splitAmount2 === "number" ? splitAmount2 : 0;
        setSplitAmount1(Math.max(0, amount - a2));
      } else {
        const a1 = typeof splitAmount1 === "number" ? splitAmount1 : 0;
        setSplitAmount2(Math.max(0, amount - a1));
      }
    }
  }, [amount, isSplitPayment, lastEditedSplitField]);

  const numSplit1 = typeof splitAmount1 === "number" ? splitAmount1 : (parseFloat(String(splitAmount1)) || 0);
  const numSplit2 = typeof splitAmount2 === "number" ? splitAmount2 : (parseFloat(String(splitAmount2)) || 0);
  const isSplitValid = !isSplitPayment || (numSplit1 >= 0 && numSplit2 >= 0 && Math.abs((numSplit1 + numSplit2) - amount) < 0.01);

  function toggleAddon(id: string) {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onPromoChange(value: string) {
    setPromoId(value);
    if (value !== "none") setManualDiscountOn(false);
  }

  function onManualDiscountToggle(checked: boolean) {
    setManualDiscountOn(checked);
    if (checked) setPromoId("none");
  }

  const canSubmit =
    !isPending &&
    !!serviceId &&
    !!staffId &&
    !!lockerNumber &&
    isSplitValid &&
    (clientId ? true : guestName.trim().length > 0) &&
    (!isMassageService ||
      (!!therapistId &&
        !!time &&
        !!roomNumber &&
        !takenTherapists.has(therapistId) &&
        !unavailableTherapists.has(therapistId)));

  function handleSubmit() {
    setError(null);
    if (isSplitPayment && !isSplitValid) {
      setError(`Sum of Method 1 (₱${numSplit1.toLocaleString()}) and Method 2 (₱${numSplit2.toLocaleString()}) must equal required total (₱${amount.toLocaleString()}).`);
      return;
    }

    startTransition(async () => {
      const isRefRequired = paymentMethod !== "Cash" || (isSplitPayment && (splitMethod1 !== "Cash" || splitMethod2 !== "Cash"));
      const result = await quickWalkin({
        clientId,
        guestLabel: clientId ? null : guestName.trim(),
        serviceId,
        therapistId: isMassageService ? therapistId : null,
        roomNumber: isMassageService ? (roomNumber as number) : null,
        bookingDate: date,
        startTime: isMassageService ? time : roundedNowTime(),
        lockerNumber: lockerNumber as number,
        promoId: promoId === "none" ? null : promoId,
        manualDiscountType: manualDiscountOn ? discountType : null,
        manualDiscountValue: manualDiscountOn ? discountValue : null,
        addonIds,
        amount,
        servicePaidAmount,
        paymentMethod: isSplitPayment ? "Split (Cash + GCash)" : paymentMethod,
        isSplitPayment,
        splitMethod1,
        splitAmount1: numSplit1,
        splitMethod2,
        splitAmount2: numSplit2,
        splitCashAmount: isSplitPayment ? (splitMethod1 === "Cash" ? numSplit1 : (splitMethod2 === "Cash" ? numSplit2 : 0)) : null,
        splitGcashAmount: isSplitPayment ? (splitMethod1 === "GCash" ? numSplit1 : (splitMethod2 === "GCash" ? numSplit2 : 0)) : null,
        paymentRef: isRefRequired ? gcashRef.trim() || null : null,
        staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (clientId && result.pointsAwarded === null) {
        setPointsWarning(
          "Walk-in logged, pero WALANG POINTS na-award — hindi pa naka-configure ang loyalty formula sa Settings."
        );
        return;
      }

      onCreated();
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
              onCreated();
            }}
            className="w-full rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Quick Walk-in</h2>
        <p className="mt-1 text-xs text-muted">
          Service, therapist/room (if massage), locker, and payment — all in one step.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs text-muted" htmlFor="wk-client-search">
              Client <span className="opacity-70">(search if they already have an account)</span>
            </label>
            {clientLocked ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-gold/50 bg-gold/5 px-3 py-2">
                <span className="text-sm font-medium text-foreground">
                  {selectedClient?.codename} <span className="text-muted">@{selectedClient?.username}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-gold">Scanned</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setClientLocked(false);
                    setClientId(null);
                  }}
                  className="shrink-0 text-xs text-muted underline hover:text-foreground"
                >
                  Change client
                </button>
              </div>
            ) : (
              <>
                <input
                  id="wk-client-search"
                  type="text"
                  placeholder="Search by name or username…"
                  value={clientId ? `${selectedClient?.codename}` : clientQuery}
                  onChange={(e) => {
                    setClientId(null);
                    setClientQuery(e.target.value);
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                {!clientId && clientQuery && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background">
                    {filteredClients.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted">No matching clients.</p>
                    ) : (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setClientId(c.id);
                            setClientQuery("");
                          }}
                          className="block min-h-[44px] sm:min-h-0 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-gold/10"
                        >
                          {c.codename} <span className="text-muted">@{c.username}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {clientId && (
                  <button
                    type="button"
                    onClick={() => setClientId(null)}
                    className="mt-1 text-xs text-muted underline hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </>
            )}
          </div>

          {!clientId && (
            <div>
              <label className="text-xs text-muted" htmlFor="wk-guest-name">
                Name <span className="opacity-70">(if not found above — walk-in, no account)</span>
              </label>
              <input
                id="wk-guest-name"
                type="text"
                placeholder="e.g. Guest at door"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="wk-service">
                Service
              </label>
              <select
                id="wk-service"
                value={serviceId}
                onChange={(e) => onServiceChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.duration_minutes}min
                  </option>
                ))}
              </select>
            </div>
            {isMassageService && (
              <div>
                <label className="text-xs text-muted" htmlFor="wk-therapist">
                  Therapist
                </label>
                <select
                  id="wk-therapist"
                  value={therapistId}
                  onChange={(e) => {
                    setTherapistId(e.target.value);
                    setRoomNumber("");
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">— select —</option>
                  {therapists.map((t) => {
                    const unavailableReason = unavailableTherapists.get(t.id);
                    const fullyBooked = fullyBookedTherapists.has(t.id);
                    const conflictNow = takenTherapists.has(t.id);
                    const disabled = !!unavailableReason || fullyBooked || conflictNow;
                    return (
                      <option
                        key={t.id}
                        value={t.id}
                        disabled={disabled}
                        className={disabled ? "text-stone-500" : undefined}
                      >
                        {t.name}
                        {unavailableReason
                          ? ` - ${unavailableReason}`
                          : fullyBooked
                          ? " - Fully Booked"
                          : conflictNow
                          ? " (booked)"
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {isMassageService && (
            <>
              <div>
                <label className="text-xs text-muted">Time Slot</label>
                {timeSlots.length === 0 && (
                  <p className="mt-1 text-xs text-muted">
                    No time slots configured yet. Add some in Settings.
                  </p>
                )}
                <div className="mt-1 grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {timeSlots.map((s) => {
                    const taken = takenSlots.has(s);
                    const selected = slotTime === s && !useCustomTime;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={taken || useCustomTime}
                        onClick={() => {
                          setSlotTime(s);
                          setRoomNumber("");
                        }}
                        className={`min-h-[44px] sm:min-h-0 rounded-md border px-2 py-1.5 text-xs transition-all ${
                          taken
                            ? "border-dashed border-border/70 text-red-400/50 line-through opacity-50 cursor-not-allowed bg-transparent"
                            : selected
                            ? "border-gold bg-gradient-to-br from-[#c89b3c] to-[#a97e2e] text-black font-bold shadow-sm"
                            : "border-border bg-background text-foreground hover:border-gold/50"
                        }`}
                      >
                        {fmtTime(s)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={(e) => {
                      setUseCustomTime(e.target.checked);
                      if (e.target.checked) setSlotTime("");
                      setRoomNumber("");
                    }}
                  />
                  Use a custom time instead
                </label>
                {useCustomTime && (
                  <input
                    type="time"
                    step={1800}
                    value={customTime}
                    onChange={(e) => {
                      setCustomTime(e.target.value);
                      setRoomNumber("");
                    }}
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                )}
              </div>

              {time && (
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-room">
                    Room
                  </label>
                  <select
                    id="wk-room"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(Number(e.target.value))}
                    disabled={freeRooms.length === 0}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                  >
                    <option value="">
                      {freeRooms.length === 0 ? "— no rooms free —" : "— select a room —"}
                    </option>
                    {freeRooms.map((r) => (
                      <option key={r} value={r}>
                        Room {r}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted">
                    {freeRooms.length} room{freeRooms.length === 1 ? "" : "s"} free at this time.
                  </p>
                </div>
              )}
            </>
          )}

          <div>
            <label className="text-xs text-muted" htmlFor="wk-locker">
              Assign Locker
            </label>
            <select
              id="wk-locker"
              value={lockerNumber}
              onChange={(e) => setLockerNumber(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">— select a free locker —</option>
              {freeLockers.map((n) => (
                <option key={n} value={n}>
                  Locker {n}
                </option>
              ))}
            </select>
          </div>

          {isMassageService && (
            <div>
              <label className="text-xs text-muted" htmlFor="wk-promo">
                Promo <span className="opacity-70">(optional — one discount at a time)</span>
              </label>
              <select
                id="wk-promo"
                value={promoId}
                onChange={(e) => onPromoChange(e.target.value)}
                disabled={manualDiscountOn}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
              >
                <option value="none">No Promo</option>
                {promos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} (−₱{p.discount})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={manualDiscountOn}
                onChange={(e) => onManualDiscountToggle(e.target.checked)}
                disabled={promoId !== "none"}
              />
              Manual discount (e.g. Senior or PWD)
            </label>
            {manualDiscountOn && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-discount-type">
                    Type
                  </label>
                  <select
                    id="wk-discount-type"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "pct" | "fixed")}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="pct">Percentage</option>
                    <option value="fixed">Fixed ₱</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-discount-value">
                    Value
                  </label>
                  <input
                    id="wk-discount-value"
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          {addons.length > 0 && (
            <div>
              <label className="text-xs text-muted">Add-ons <span className="opacity-70">(optional)</span></label>
              <div className="mt-1 space-y-1">
                {addons.map((a) => (
                  <label key={a.id} className="flex min-h-[44px] sm:min-h-0 items-center justify-between text-sm text-foreground">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.id)}
                        onChange={() => toggleAddon(a.id)}
                      />
                      {a.name}
                    </span>
                    <span className="text-muted">+₱{a.price}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted" htmlFor="wk-payment">
                Payment Method
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isSplitPayment}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsSplitPayment(checked);
                    if (checked) {
                      setSplitAmount1(amount);
                      setSplitAmount2(0);
                      setLastEditedSplitField("amount1");
                    }
                  }}
                  className="accent-gold"
                />
                Split Payment
              </label>
            </div>

            {!isSplitPayment ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-amount">
                    Amount Paid (₱) <span className="opacity-70">(auto)</span>
                  </label>
                  <input
                    id="wk-amount"
                    type="number"
                    value={amount}
                    disabled
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground opacity-70"
                  />
                </div>
                <div>
                  <select
                    id="wk-payment"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Card">Card</option>
                    <option value="Maya">Maya</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-border/80 bg-background/50 p-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Total Required: <strong className="text-gold">₱{amount.toLocaleString()}</strong></span>
                  <span className="text-[10px] uppercase tracking-wide text-gold">Split Active</span>
                </div>

                {/* Method 1 + Amount 1 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted" htmlFor="wk-split-method-1">
                      Method 1
                    </label>
                    <select
                      id="wk-split-method-1"
                      value={splitMethod1}
                      onChange={(e) => setSplitMethod1(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                    >
                      <option value="Cash">Cash</option>
                      <option value="GCash">GCash</option>
                      <option value="Card">Card</option>
                      <option value="Maya">Maya</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted" htmlFor="wk-split-amount-1">
                      Amount 1 (₱)
                    </label>
                    <input
                      id="wk-split-amount-1"
                      type="number"
                      min="0"
                      step="any"
                      value={splitAmount1}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === "") {
                          setSplitAmount1("");
                          setLastEditedSplitField("amount1");
                        } else {
                          const val = parseFloat(valStr);
                          const num = isNaN(val) ? 0 : val;
                          setSplitAmount1(num);
                          setSplitAmount2(Math.max(0, amount - num));
                          setLastEditedSplitField("amount1");
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Method 2 + Amount 2 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted" htmlFor="wk-split-method-2">
                      Method 2
                    </label>
                    <select
                      id="wk-split-method-2"
                      value={splitMethod2}
                      onChange={(e) => setSplitMethod2(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                    >
                      <option value="GCash">GCash</option>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Maya">Maya</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted" htmlFor="wk-split-amount-2">
                      Amount 2 (₱)
                    </label>
                    <input
                      id="wk-split-amount-2"
                      type="number"
                      min="0"
                      step="any"
                      value={splitAmount2}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === "") {
                          setSplitAmount2("");
                          setLastEditedSplitField("amount2");
                        } else {
                          const val = parseFloat(valStr);
                          const num = isNaN(val) ? 0 : val;
                          setSplitAmount2(num);
                          setSplitAmount1(Math.max(0, amount - num));
                          setLastEditedSplitField("amount2");
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none font-mono"
                    />
                  </div>
                </div>

                {!isSplitValid && (
                  <p className="rounded-md border border-red-900/50 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-300 font-medium">
                    ⚠ Sum of Method 1 (₱{numSplit1.toLocaleString()}) and Method 2 (₱{numSplit2.toLocaleString()}) must equal required total (₱{amount.toLocaleString()}).
                  </p>
                )}
              </div>
            )}
          </div>

          {(paymentMethod !== "Cash" || (isSplitPayment && (splitMethod1 !== "Cash" || splitMethod2 !== "Cash"))) && (
            <div>
              <label className="text-xs text-muted" htmlFor="wk-gcash-ref">
                Reference Number <span className="opacity-70">(optional — GCash / Card / Maya)</span>
              </label>
              <input
                id="wk-gcash-ref"
                type="text"
                placeholder="e.g. 1234567890"
                value={gcashRef}
                onChange={(e) => setGcashRef(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}

          <div>
            <div className="text-xs text-muted">Logged by (staff)</div>
            <div className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
              {actor ? `${actor.name} · ${actor.position}` : "—"}
            </div>
          </div>

          {error && (
            <p
              ref={errorRef}
              className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm sm:text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 sm:static mt-6 -mx-4 sm:mx-0 -mb-4 sm:mb-0 flex justify-end gap-3 bg-surface px-4 sm:px-0 py-4 sm:py-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border px-4 py-2.5 sm:py-2 text-sm text-foreground hover:border-gold/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md border border-gold bg-gold/10 px-4 py-2.5 sm:py-2 text-sm font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
