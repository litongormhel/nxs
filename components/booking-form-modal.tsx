"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createBooking } from "@/app/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap } from "@/lib/bookings/slots";
import { SmsPreviewModal } from "@/components/sms-preview-modal";
import type { Client, Promo, Service, Staff, Therapist } from "@/components/booking-browser";
import type { Database } from "@/lib/types/database";

const SQUAD_PAX_PATTERN = /^Squad Goals (\d)pax$/i;

function squadPaxFromPromo(promo: Promo | undefined): 3 | 4 | null {
  const match = promo?.label.match(SQUAD_PAX_PATTERN);
  if (!match) return null;
  const pax = Number(match[1]);
  return pax === 3 || pax === 4 ? pax : null;
}

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

function weekday(dateIso: string): number {
  return new Date(`${dateIso}T00:00:00`).getDay(); // 0=Sun..6=Sat
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

export function BookingFormModal({
  clients,
  services,
  therapists,
  rooms,
  staff,
  promos,
  timeSlots,
  defaultDate,
  onClose,
  onCreated,
}: {
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  rooms: number[];
  staff: Staff[];
  promos: Promo[];
  timeSlots: string[];
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clientSelectValue, setClientSelectValue] = useState<string>("__walkin__");
  const [walkinName, setWalkinName] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  const [promoId, setPromoId] = useState<string>("none");
  const [date, setDate] = useState(defaultDate || todayIso());
  const [slotTime, setSlotTime] = useState<string>("");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState(roundedNowTime());
  const [roomMode, setRoomMode] = useState<"auto" | "manual">("auto");
  const [manualRoomNumber, setManualRoomNumber] = useState<number | null>(null);
  const { sessionStaff } = useStaffSim();
  const [staffId, setStaffId] = useState(sessionStaff?.id ?? staff[0]?.id ?? "");
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [smsBooking, setSmsBooking] = useState<{
    codename: string;
    price: number;
    serviceName: string;
    date: string;
    startTime: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bookings")
      .select("therapist_id, room_number, start_time, duration_minutes")
      .eq("booking_date", date)
      .in("status", ACTIVE_STATUSES)
      .then(({ data }) => setConflicts(data ?? []));
  }, [date]);

  const isWalkIn = clientSelectValue === "__walkin__";
  const selectedClient = isWalkIn ? null : clients.find((c) => c.id === clientSelectValue);
  const selectedService = services.find((s) => s.id === serviceId);
  const duration = selectedService?.duration_minutes ?? 0;
  const isMassageService = selectedService?.name !== "Wet Area";
  const selectedPromo = promos.find((p) => p.id === promoId);
  const squadPax = isMassageService ? squadPaxFromPromo(selectedPromo) : null;
  const isWeekday = weekday(date) >= 1 && weekday(date) <= 5;
  const isPastDate = date < todayIso();
  const time = useCustomTime ? customTime : slotTime;

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
      const freeRoomCount = rooms.filter((r) => !takenRooms.has(r)).length;

      if (therapistBusy || freeRoomCount === 0) {
        taken.add(slot);
      }
    }
    return taken;
  }, [conflicts, therapistId, duration, rooms, timeSlots]);

  // Conflicting therapists at current time
  const conflictingTherapists = useMemo(() => {
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

  // Free rooms at current time
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

  // Effective room number derived from assignment mode and free rooms
  const roomNumber = useMemo(() => {
    if (!isMassageService) return null;
    if (roomMode === "auto") return freeRooms[0] ?? null;
    if (manualRoomNumber != null && freeRooms.includes(manualRoomNumber)) {
      return manualRoomNumber;
    }
    return freeRooms[0] ?? null;
  }, [isMassageService, roomMode, freeRooms, manualRoomNumber]);

  function onServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    const nextService = services.find((s) => s.id === nextServiceId);
    if (nextService?.name === "Wet Area") {
      setPromoId("none");
    }
  }

  function onCustomTimeToggle(checked: boolean) {
    setUseCustomTime(checked);
    if (checked) {
      setSlotTime("");
    }
    setError(null);
  }

  const therapistOk = !!therapistId && !conflictingTherapists.has(therapistId);
  const selectedTherapist = therapists.find((t) => t.id === therapistId);

  const canSubmit =
    !isPending &&
    !isPastDate &&
    (isWalkIn ? walkinName.trim().length > 0 : !!clientSelectValue) &&
    !!serviceId &&
    !!staffId &&
    (!isMassageService ||
      (!!therapistId &&
        therapistOk &&
        !!time &&
        roomNumber != null &&
        freeRooms.includes(roomNumber)));

  function handleSubmit() {
    setError(null);
    if (isPastDate) {
      setError("Cannot book a date in the past.");
      return;
    }
    if (isMassageService && !time) {
      setError("Please select an available time slot, or use a custom time.");
      return;
    }
    if (isMassageService && (!therapistId || !therapistOk)) {
      setError("Please select a therapist who is available at this time.");
      return;
    }
    if (isMassageService && (roomNumber == null || !freeRooms.includes(roomNumber))) {
      setError("Please select an available room.");
      return;
    }

    startTransition(async () => {
      const result = await createBooking({
        clientId: isWalkIn ? null : clientSelectValue,
        guestLabel: isWalkIn ? walkinName.trim() : null,
        serviceId,
        therapistId: isMassageService ? therapistId : null,
        roomNumber: isMassageService ? roomNumber : null,
        bookingDate: date,
        startTime: isMassageService ? time : roundedNowTime(),
        status: "Booked",
        paxCount: squadPax,
        promoId: promoId === "none" ? null : promoId,
        createdBy: staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (!isWalkIn && selectedClient && selectedService) {
        setSmsBooking({
          codename: selectedClient.codename,
          price: selectedService.price,
          serviceName: selectedService.name,
          date,
          startTime: time,
        });
        return;
      }

      onCreated();
    });
  }

  if (smsBooking) {
    return (
      <SmsPreviewModal
        booking={smsBooking}
        onClose={() => {
          setSmsBooking(null);
          onCreated();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-foreground">New Booking</h2>
        <p className="mt-0.5 text-xs text-muted">
          Room assigns automatically — override manually if needed.
        </p>

        <div className="mt-5 space-y-4">
          {/* Client Select */}
          <div>
            <label className="text-xs text-muted" htmlFor="bClient">
              Client
            </label>
            <select
              id="bClient"
              value={clientSelectValue}
              onChange={(e) => {
                setClientSelectValue(e.target.value);
                setError(null);
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            >
              <option value="__walkin__">— Walk-in / No account —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codename} (@{c.username})
                </option>
              ))}
            </select>
          </div>

          {/* Walk-in Name field */}
          {isWalkIn && (
            <div id="bWalkinNameField">
              <label className="text-xs text-muted" htmlFor="bWalkinName">
                Client Name <span className="opacity-70">(walk-in / no account)</span>
              </label>
              <input
                id="bWalkinName"
                type="text"
                placeholder="e.g. Guest of Ohm"
                value={walkinName}
                onChange={(e) => setWalkinName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              />
            </div>
          )}

          {/* Service & Therapist */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="bService">
                Service
              </label>
              <select
                id="bService"
                value={serviceId}
                onChange={(e) => onServiceChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.duration_minutes}min
                  </option>
                ))}
              </select>
            </div>
            {isMassageService && (
              <div id="bTherapistField">
                <label className="text-xs text-muted" htmlFor="bTherapist">
                  Therapist
                </label>
                <select
                  id="bTherapist"
                  value={therapistId}
                  onChange={(e) => setTherapistId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                >
                  <option value="">— select —</option>
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id} disabled={conflictingTherapists.has(t.id)}>
                      {t.name} {conflictingTherapists.has(t.id) ? "(booked)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Promo */}
          {isMassageService && (
            <div id="bPromoField">
              <label className="text-xs text-muted" htmlFor="bPromo">
                Promo <span className="opacity-70">(optional — massage services only)</span>
              </label>
              <select
                id="bPromo"
                value={promoId}
                onChange={(e) => setPromoId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              >
                <option value="none">No Promo</option>
                {promos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} (−₱{p.discount})
                  </option>
                ))}
              </select>
              {squadPax != null && isWeekday && (
                <p className="mt-2 rounded-md border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                  Squad Goals is normally weekend-only. This booking will still save — just
                  confirm the discount with the client before applying it.
                </p>
              )}
            </div>
          )}

          {/* Date */}
          <div>
            <label className="text-xs text-muted" htmlFor="bDate">
              Date
            </label>
            <input
              id="bDate"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setError(null);
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            />
            {isPastDate && (
              <p className="mt-1 text-xs text-red-400" id="pastDateError">
                Cannot book a date in the past.
              </p>
            )}
          </div>

          {/* Time Slot Grid */}
          {isMassageService && (
            <div id="bSlotField">
              <label className="text-xs text-muted">Time Slot</label>
              {timeSlots.length === 0 && (
                <p className="mt-1.5 text-xs text-muted">
                  No time slots configured yet. Add some in Settings.
                </p>
              )}
              <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-4 gap-2" id="slotGrid">
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
                        setError(null);
                      }}
                      className={`rounded-md border px-2 py-2 font-mono text-xs transition-all ${
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
              <p className="mt-1.5 text-[11px] text-muted">
                Struck-through slots have no free therapist or room.
              </p>
            </div>
          )}

          {/* Custom Time Toggle */}
          {isMassageService && (
            <div id="bCustomTimeField">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  id="bCustomTimeToggle"
                  checked={useCustomTime}
                  onChange={(e) => onCustomTimeToggle(e.target.checked)}
                  className="accent-gold"
                />
                Use a custom time instead
              </label>
              {useCustomTime && (
                <div id="customTimeSub" className="mt-2 space-y-1.5">
                  <input
                    type="time"
                    id="bTimeFlex"
                    step={1800}
                    value={customTime}
                    onChange={(e) => {
                      setCustomTime(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                  />
                  <p className="text-xs text-muted" id="weekdayAvailText">
                    {selectedTherapist?.name ?? "(select a therapist)"}:{" "}
                    <span className={therapistOk ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                      {therapistId ? (therapistOk ? "available" : "not available") : "—"}
                    </span>
                    {" · "}Rooms free:{" "}
                    <span className={freeRooms.length > 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                      {freeRooms.length} of {rooms.length}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Room & Assignment Mode */}
          {isMassageService && (
            <div className="grid grid-cols-2 gap-3" id="roomField">
              <div>
                <label className="text-xs text-muted" htmlFor="bRoom">
                  Room
                </label>
                <select
                  id="bRoom"
                  value={roomNumber ?? ""}
                  onChange={(e) => {
                    setManualRoomNumber(e.target.value ? Number(e.target.value) : null);
                    setRoomMode("manual");
                    setError(null);
                  }}
                  disabled={!time || freeRooms.length === 0}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none disabled:opacity-50"
                >
                  {!time ? (
                    <option value="">— pick a time first —</option>
                  ) : freeRooms.length === 0 ? (
                    <option value="">No rooms free at this time</option>
                  ) : (
                    freeRooms.map((r) => (
                      <option key={r} value={r}>
                        Room {r}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted" htmlFor="bRoomMode">
                  Assignment
                </label>
                <select
                  id="bRoomMode"
                  value={roomMode}
                  onChange={(e) => {
                    const nextMode = e.target.value as "auto" | "manual";
                    setRoomMode(nextMode);
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                >
                  <option value="auto">Auto (recommended)</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>
          )}

          {/* Booked by (staff) */}
          <div>
            <label className="text-xs text-muted" htmlFor="bStaff">
              Booked by (staff)
            </label>
            <select
              id="bStaff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            >
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.position}
                </option>
              ))}
            </select>
          </div>

          {/* Error Message */}
          {error && (
            <p
              id="bookingError"
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-[1.4] rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
