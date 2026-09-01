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
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "GCash">("Cash");
  const [gcashRef, setGcashRef] = useState("");
  const { sessionStaff } = useStaffSim();
  const actor = sessionStaff;
  const staffId = actor?.id ?? "";
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
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

  const freeRooms = useMemo(() => {
    if (!time) return [];
    const taken = new Set<number>();
    for (const row of conflicts) {
      if (row.room_number == null) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? 0)) {
        taken.add(row.room_number);
      }
    }
    return rooms.filter((r) => !taken.has(r));
  }, [conflicts, time, duration, rooms]);

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
    (clientId ? true : guestName.trim().length > 0) &&
    (!isMassageService ||
      (!!therapistId && !!time && !!roomNumber && !takenTherapists.has(therapistId)));

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
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
        paymentMethod,
        paymentRef: paymentMethod === "GCash" ? gcashRef.trim() || null : null,
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
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id} disabled={takenTherapists.has(t.id)}>
                      {t.name} {takenTherapists.has(t.id) ? "(booked)" : ""}
                    </option>
                  ))}
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
                  {timeSlots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={useCustomTime}
                      onClick={() => {
                        setSlotTime(s);
                        setRoomNumber("");
                      }}
                      className={`min-h-[44px] sm:min-h-0 rounded-md border px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                        slotTime === s && !useCustomTime
                          ? "border-gold bg-gold/10 text-gold"
                          : "border-border text-foreground"
                      }`}
                    >
                      {fmtTime(s)}
                    </button>
                  ))}
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
              <label className="text-xs text-muted" htmlFor="wk-payment">
                Payment Method
              </label>
              <select
                id="wk-payment"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as "Cash" | "GCash")}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
              </select>
            </div>
          </div>

          {paymentMethod === "GCash" && (
            <div>
              <label className="text-xs text-muted" htmlFor="wk-gcash-ref">
                GCash Reference Number <span className="opacity-70">(optional)</span>
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
