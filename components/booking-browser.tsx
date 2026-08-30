"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateBookingStatus, changeBookingTherapist } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap, compareSlotTimes } from "@/lib/bookings/slots";
import { BookingFormModal } from "@/components/booking-form-modal";
import { QuickWalkinModal } from "@/components/quick-walkin-modal";
import { LogVisitModal } from "@/components/log-visit-modal";
import type { Database } from "@/lib/types/database";

export type Client = { id: string; codename: string; username: string };
export type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  points_earned: number;
};
export type Therapist = { id: string; name: string };
export type Staff = { id: string; name: string; position: string };
export type Promo = { id: string; label: string; discount: number };
export type Addon = { id: string; name: string; price: number };

type LockerOccupancyRow = {
  checked_in_at: string;
  checked_out_at: string | null;
  locker_number: number;
};

type BookingRow = {
  id: string;
  client_id: string | null;
  guest_label: string | null;
  service_id: string;
  therapist_id: string | null;
  room_number: number | null;
  booking_date: string;
  start_time: string;
  duration_minutes: number | null;
  promo_id: string | null;
  status: Database["public"]["Enums"]["booking_status"];
  pax_count: number | null;
  locker_occupancy: LockerOccupancyRow[] | null;
};

const ACTIVE_STATUSES: Database["public"]["Enums"]["booking_status"][] = [
  "Booked",
  "Completed",
  "Needs Reassignment",
  "No-show",
];

type TabKey = "upcoming" | "checkin" | "checkout";

const TABS: { key: TabKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "checkin", label: "Check-in" },
  { key: "checkout", label: "Check-out" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(t: string): string {
  if (!t || !t.includes(":")) return t;
  const [h, m] = t.split(":");
  const hr = ((+h + 11) % 12) + 1;
  return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
}

function fmtTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function occupancyOf(row: BookingRow): LockerOccupancyRow | null {
  return row.locker_occupancy?.[0] ?? null;
}

function sortBySpaDay(rows: BookingRow[]): BookingRow[] {
  return [...rows].sort((a, b) => compareSlotTimes(a.start_time, b.start_time));
}

export function BookingBrowser({
  clients,
  services,
  therapists,
  rooms,
  staff,
  promos,
  addons,
  lockers,
  timeSlots,
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
}) {
  const router = useRouter();
  const { sessionStaff } = useStaffSim();
  const [date, setDate] = useState(todayIso());
  const [tab, setTab] = useState<TabKey>("upcoming");
  const [dayBookings, setDayBookings] = useState<BookingRow[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showWalkin, setShowWalkin] = useState(false);
  const [logVisitBooking, setLogVisitBooking] = useState<BookingRow | null>(null);
  const [reassignBooking, setReassignBooking] = useState<BookingRow | null>(null);
  const [reassignTherapistId, setReassignTherapistId] = useState("");
  const [reassignStartTime, setReassignStartTime] = useState("");
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSaving, setReassignSaving] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const loading = loadedFor !== date;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bookings")
      .select(
        "id, client_id, guest_label, service_id, therapist_id, room_number, booking_date, start_time, duration_minutes, promo_id, status, pax_count, locker_occupancy(checked_in_at, checked_out_at, locker_number)"
      )
      .eq("booking_date", date)
      .in("status", ACTIVE_STATUSES)
      .order("start_time", { ascending: true })
      .then(({ data }) => {
        setDayBookings((data as unknown as BookingRow[]) ?? []);
        setLoadedFor(date);
      });
  }, [date, reloadToken]);

  function reload() {
    setReloadToken((t) => t + 1);
  }

  function serviceName(id: string) {
    return services.find((s) => s.id === id)?.name ?? "Unknown service";
  }

  function therapistName(id: string | null) {
    if (!id) return "—";
    return therapists.find((t) => t.id === id)?.name ?? "—";
  }

  function clientLabel(row: BookingRow) {
    if (row.client_id) {
      return clients.find((c) => c.id === row.client_id)?.codename ?? "Client";
    }
    return row.guest_label ?? "Walk-in";
  }

  const upcomingRows = useMemo(
    () =>
      sortBySpaDay(
        dayBookings.filter(
          (r) => r.status === "Booked" || r.status === "Needs Reassignment" || r.status === "No-show"
        )
      ),
    [dayBookings]
  );
  const checkinRows = useMemo(
    () =>
      sortBySpaDay(
        dayBookings.filter((r) => r.status === "Completed" && !occupancyOf(r)?.checked_out_at)
      ),
    [dayBookings]
  );
  const checkoutRows = useMemo(
    () =>
      sortBySpaDay(
        dayBookings.filter((r) => r.status === "Completed" && !!occupancyOf(r)?.checked_out_at)
      ),
    [dayBookings]
  );

  async function handleSetStatus(id: string, status: Database["public"]["Enums"]["booking_status"]) {
    await updateBookingStatus(id, status);
    reload();
    router.refresh();
  }

  function openReassign(row: BookingRow) {
    setReassignBooking(row);
    setReassignTherapistId("");
    setReassignStartTime("");
    setReassignError(null);
    setAvailabilityMap({});
  }

  // Live slot availability — re-runs whenever a therapist is selected.
  // Queries same-day bookings for that therapist and marks each slot as
  // free or busy using slotsOverlap(). Debounced 300 ms.
  useEffect(() => {
    if (!reassignBooking || !reassignTherapistId) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      setAvailabilityLoading(true);
      const supabase = createClient();
      const { data: sameDayBookings } = await supabase
        .from("bookings")
        .select("therapist_id, start_time, duration_minutes, status")
        .eq("booking_date", reassignBooking.booking_date)
        .eq("therapist_id", reassignTherapistId)
        .in("status", ["Booked", "Completed", "Needs Reassignment"])
        .neq("id", reassignBooking.id);

      if (cancelled) return;
      const map: Record<string, boolean> = {};
      for (const slot of timeSlots) {
        const conflict = (sameDayBookings ?? []).some((b) =>
          slotsOverlap(
            slot,
            reassignBooking.duration_minutes ?? 60,
            b.start_time,
            b.duration_minutes ?? 60
          )
        );
        map[slot] = !conflict; // true = available
      }
      setAvailabilityMap(map);
      setAvailabilityLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reassignBooking, reassignTherapistId, timeSlots]);

  async function handleConfirmReassign() {
    if (!reassignBooking || !reassignTherapistId || !reassignStartTime || !sessionStaff) return;
    setReassignSaving(true);
    setReassignError(null);
    const res = await changeBookingTherapist(
      reassignBooking.id,
      reassignTherapistId,
      sessionStaff.id,
      reassignStartTime
    );
    setReassignSaving(false);
    if (!res.ok) {
      setReassignError(res.error);
      return;
    }
    setReassignBooking(null);
    reload();
    router.refresh();
  }

  function renderActions(row: BookingRow) {
    return (
      <div className="flex items-center gap-1.5">
        {row.status === "Booked" && (
          <>
            <button
              type="button"
              onClick={() => setLogVisitBooking(row)}
              className="rounded-md border border-[#a97e2e] bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-accent-gold hover:brightness-125 transition-all"
            >
              Log Visit
            </button>
            <button
              type="button"
              onClick={() => handleSetStatus(row.id, "No-show")}
              className="rounded-md border border-[#5e3c3c] bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-accent-red hover:brightness-125 transition-all"
            >
              No-show
            </button>
            <button
              type="button"
              onClick={() => handleSetStatus(row.id, "Cancelled")}
              className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted hover:brightness-125 transition-all"
            >
              Cancel
            </button>
          </>
        )}
        {row.status === "Needs Reassignment" && (
          <button
            type="button"
            onClick={() => openReassign(row)}
            className="rounded-md border border-[#6b4f1f] bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-accent-amber hover:brightness-125 transition-all"
          >
            Reassign
          </button>
        )}
        {(row.status === "Booked" || row.status === "No-show") && (
          <button
            type="button"
            onClick={() => openReassign(row)}
            className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted hover:brightness-125 transition-all"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  function renderRoomPill(row: BookingRow) {
    return row.room_number ? (
      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[8.5px] font-extrabold text-accent-gold">
        Room {row.room_number}
      </span>
    ) : (
      <span className="text-muted">—</span>
    );
  }

  const rowsForTab = tab === "upcoming" ? upcomingRows : tab === "checkin" ? checkinRows : checkoutRows;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted" htmlFor="booking-date">
            Date
          </label>
          <input
            id="booking-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowWalkin(true)}
            disabled={services.length === 0 || rooms.length === 0 || staff.length === 0}
            className="rounded-md border border-emerald-800/60 bg-emerald-950/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:border-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quick Walk-in
          </button>
          <button
            type="button"
            onClick={() => setShowNewBooking(true)}
            disabled={services.length === 0 || rooms.length === 0 || staff.length === 0}
            className="rounded-md border border-gold bg-gold/10 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            New Booking
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => {
          const count =
            t.key === "upcoming" ? upcomingRows.length : t.key === "checkin" ? checkinRows.length : checkoutRows.length;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                active
                  ? "border-gold text-accent-gold"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="py-6 text-center text-xs text-muted">Loading…</p>
        ) : rowsForTab.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted">
            No bookings for this date.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border text-[9.5px] font-semibold uppercase tracking-wider text-muted">
                  <th className="px-3.5 py-2.5">Massage Time</th>
                  <th className="px-3.5 py-2.5">Client</th>
                  <th className="px-3.5 py-2.5">Service</th>
                  <th className="px-3.5 py-2.5">Room</th>
                  <th className="px-3.5 py-2.5">Therapist</th>
                  {tab !== "upcoming" && <th className="px-3.5 py-2.5">Check-in Time</th>}
                  {tab !== "upcoming" && <th className="px-3.5 py-2.5">Locker #</th>}
                  {tab === "checkout" && <th className="px-3.5 py-2.5">Check-out Time</th>}
                  {tab === "upcoming" && <th className="px-3.5 py-2.5">Action</th>}
                </tr>
              </thead>
              <tbody>
                {rowsForTab.map((row) => {
                  const flagged = row.status === "Needs Reassignment";
                  const occ = occupancyOf(row);
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 ${
                        flagged ? "bg-gradient-to-r from-red-950/20 to-surface" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-3.5 py-3 font-mono text-[10.5px] text-muted">
                        {fmtTime(row.start_time)}
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-foreground">
                          <span>{clientLabel(row)}</span>
                          {row.pax_count && (
                            <span className="rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-[8px] font-extrabold tracking-wider text-amber-400 uppercase">
                              SQUAD ×{row.pax_count}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-muted">{serviceName(row.service_id)}</td>
                      <td className="px-3.5 py-3">{renderRoomPill(row)}</td>
                      <td className="px-3.5 py-3 text-muted">{therapistName(row.therapist_id)}</td>
                      {tab !== "upcoming" && (
                        <td className="px-3.5 py-3 font-mono text-[10.5px] text-muted">
                          {fmtTimestamp(occ?.checked_in_at)}
                        </td>
                      )}
                      {tab !== "upcoming" && (
                        <td className="px-3.5 py-3 text-muted">{occ?.locker_number ?? "—"}</td>
                      )}
                      {tab === "checkout" && (
                        <td className="px-3.5 py-3 font-mono text-[10.5px] text-muted">
                          {fmtTimestamp(occ?.checked_out_at)}
                        </td>
                      )}
                      {tab === "upcoming" && <td className="px-3.5 py-3">{renderActions(row)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewBooking && (
        <BookingFormModal
          clients={clients}
          services={services}
          therapists={therapists}
          rooms={rooms}
          staff={staff}
          timeSlots={timeSlots}
          defaultDate={date}
          onClose={() => setShowNewBooking(false)}
          onCreated={() => {
            setShowNewBooking(false);
            reload();
            router.refresh();
          }}
        />
      )}

      {showWalkin && (
        <QuickWalkinModal
          clients={clients}
          services={services}
          therapists={therapists}
          rooms={rooms}
          staff={staff}
          promos={promos}
          addons={addons}
          lockers={lockers}
          timeSlots={timeSlots}
          onClose={() => setShowWalkin(false)}
          onCreated={() => {
            setShowWalkin(false);
            reload();
            router.refresh();
          }}
        />
      )}

      {logVisitBooking && (
        <LogVisitModal
          clients={clients}
          services={services}
          therapists={therapists}
          staff={staff}
          promos={promos}
          addons={addons}
          lockers={lockers}
          initialBooking={logVisitBooking}
          onClose={() => setLogVisitBooking(null)}
          onLogged={() => {
            setLogVisitBooking(null);
            reload();
            router.refresh();
          }}
        />
      )}

      {reassignBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Change</h3>
            <p className="text-xs text-muted">
              {clientLabel(reassignBooking)} · Currently: {fmtTime(reassignBooking.start_time)} ·{" "}
              {therapistName(reassignBooking.therapist_id)}
            </p>

            {/* Step 1 — Therapist */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted" htmlFor="change-therapist">
                Therapist
              </label>
              <select
                id="change-therapist"
                value={reassignTherapistId}
                onChange={(e) => {
                  setReassignTherapistId(e.target.value);
                  setReassignStartTime("");
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              >
                <option value="" disabled>Select therapist</option>
                {therapists
                  .filter((t) => t.id !== reassignBooking.therapist_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
              {availabilityLoading && (
                <p className="text-[10px] text-muted">Checking availability…</p>
              )}
            </div>

            {/* Step 2 — Time Slot (only shown once a therapist is selected) */}
            {reassignTherapistId && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted">Time Slot</label>
                {timeSlots.length === 0 ? (
                  <p className="text-xs text-muted">No time slots configured. Add some in Settings.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {timeSlots.map((s) => {
                      const available = availabilityMap[s] ?? true;
                      const selected = reassignStartTime === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={!available}
                          onClick={() => setReassignStartTime(s)}
                          className={`rounded-md border px-2 py-2 font-mono text-xs transition-all ${
                            !available
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
                )}
              </div>
            )}

            {reassignError && <p className="text-xs text-accent-red">{reassignError}</p>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReassignBooking(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reassignTherapistId || !reassignStartTime || reassignSaving}
                onClick={handleConfirmReassign}
                className="flex-1 rounded-lg border border-[#a97e2e] bg-gold/10 py-2 text-xs font-bold text-accent-gold hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reassignSaving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
