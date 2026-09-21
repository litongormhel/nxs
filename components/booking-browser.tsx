"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateBookingStatus, changeBookingTherapist, editBooking, cancelBooking } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap, compareSlotTimes, sortSlotTimes } from "@/lib/bookings/slots";
import { BookingFormModal } from "@/components/booking-form-modal";
import { QuickWalkinModal } from "@/components/quick-walkin-modal";
import { LogVisitModal } from "@/components/log-visit-modal";
import { ScanMemberQrModal, type ScannedClient } from "@/components/scan-member-qr-modal";
import type { Database } from "@/lib/types/database";

export type Client = {
  id: string;
  codename: string;
  username: string;
  member_code?: string;
  has_portal_account: boolean;
};
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
  id?: string;
  checked_in_at: string;
  checked_out_at: string | null;
  locker_number: number;
};

// Minimal shape LogVisitModal's `initialBooking` prop needs — a plain
// BookingRow satisfies this structurally, and it's also what a Member QR
// scan's own booking lookup (not the day-view fetch) returns.
type LogVisitInitialBooking = {
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
  notes?: string | null;
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
  notes?: string | null;
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
  if (row.locker_occupancy && row.locker_occupancy.length > 0) {
    return row.locker_occupancy.find((o) => !o.checked_out_at) ?? row.locker_occupancy[0];
  }
  return null;
}

function sortBySpaDay(rows: BookingRow[]): BookingRow[] {
  return [...rows].sort((a, b) => compareSlotTimes(a.start_time, b.start_time));
}

function sortByLatestCheckin(rows: BookingRow[]): BookingRow[] {
  return [...rows].sort((a, b) => {
    const aTime = occupancyOf(a)?.checked_in_at;
    const bTime = occupancyOf(b)?.checked_in_at;
    const aMs = aTime ? new Date(aTime).getTime() : 0;
    const bMs = bTime ? new Date(bTime).getTime() : 0;
    if (aMs !== bMs && !isNaN(aMs) && !isNaN(bMs)) {
      return bMs - aMs;
    }
    if (!isNaN(bMs) && bMs > 0 && (isNaN(aMs) || aMs === 0)) return 1;
    if (!isNaN(aMs) && aMs > 0 && (isNaN(bMs) || bMs === 0)) return -1;
    return b.id.localeCompare(a.id);
  });
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("all");
  const [dayBookings, setDayBookings] = useState<BookingRow[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showWalkin, setShowWalkin] = useState(false);
  const [walkinInitialClientId, setWalkinInitialClientId] = useState<string | null>(null);
  const [showScanQr, setShowScanQr] = useState(false);
  const [logVisitBooking, setLogVisitBooking] = useState<LogVisitInitialBooking | null>(null);
  const [reassignBooking, setReassignBooking] = useState<BookingRow | null>(null);
  const [editBookingRow, setEditBookingRow] = useState<BookingRow | null>(null);
  const [cancelBookingRow, setCancelBookingRow] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState("Client decided not to reschedule");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [reassignTherapistId, setReassignTherapistId] = useState("");
  const [reassignStartTime, setReassignStartTime] = useState("");
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSaving, setReassignSaving] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const loading = loadedFor !== date;

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      (supabase
        .from("bookings") as any)
        .select(
          "id, client_id, guest_label, service_id, therapist_id, room_number, booking_date, start_time, duration_minutes, promo_id, status, pax_count, notes, locker_occupancy(id, checked_in_at, checked_out_at, locker_number)"
        )
        .eq("booking_date", date)
        .in("status", ACTIVE_STATUSES)
        .order("start_time", { ascending: true }),
      supabase
        .from("locker_occupancy")
        .select("id, booking_id, client_id, guest_label, locker_number, checked_in_at, checked_out_at")
        .order("checked_in_at", { ascending: false }),
    ]).then(([{ data: bookingsData }, { data: occupanciesData }]) => {
      const rawBookings = (bookingsData as unknown as BookingRow[]) ?? [];
      const occupancies = occupanciesData ?? [];

      const mappedBookings = rawBookings.map((b) => {
        let occList = b.locker_occupancy ?? [];
        if (occList.length === 0) {
          const match = occupancies.find((o) => {
            if (o.booking_id && o.booking_id === b.id) return true;
            if (b.client_id && o.client_id === b.client_id) return true;
            if (b.guest_label && o.guest_label === b.guest_label) return true;
            return false;
          });
          if (match) {
            occList = [
              {
                id: match.id,
                checked_in_at: match.checked_in_at,
                checked_out_at: match.checked_out_at,
                locker_number: match.locker_number,
              },
            ];
          }
        }
        return {
          ...b,
          locker_occupancy: occList,
        };
      });

      setDayBookings(mappedBookings);
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
      sortByLatestCheckin(
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

  // Filter pills reflect only configured timeSlots (from weekend_slots in Settings).
  // Booking start_time values are intentionally excluded — merging them caused stray
  // pills for any booking whose start_time falls outside the configured slot grid
  // (e.g. legacy rows with 11:00 AM).
  const availableSlots = useMemo(() => {
    return sortSlotTimes(timeSlots.filter(Boolean).map((s) => s.slice(0, 5)));
  }, [timeSlots]);

  const rowsForTab = tab === "upcoming" ? upcomingRows : tab === "checkin" ? checkinRows : checkoutRows;

  const filteredRows = useMemo(() => {
    return rowsForTab.filter((row) => {
      if (selectedTimeSlot !== "all") {
        if (row.start_time.slice(0, 5) !== selectedTimeSlot.slice(0, 5)) {
          return false;
        }
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.trim().toLowerCase();
        const label = clientLabel(row).toLowerCase();
        const occ = occupancyOf(row);
        const lockerStr = occ?.locker_number != null ? String(occ.locker_number) : "";
        const nameMatch = label.includes(q);
        const lockerMatch = lockerStr.includes(q);
        if (!nameMatch && !lockerMatch) {
          return false;
        }
      }
      return true;
    });
  }, [rowsForTab, selectedTimeSlot, searchQuery, clients]);

  async function handleSetStatus(id: string, status: Database["public"]["Enums"]["booking_status"]) {
    await updateBookingStatus(id, status);
    reload();
    router.refresh();
  }

  // Scanning a Member QR resolves a client, then hands off into whichever of
  // the existing Log Visit / Quick Walk-in flows fits: Log Visit if the
  // client has an open (Booked/Needs Reassignment) booking to complete,
  // Quick Walk-in otherwise. No new write path — same as clicking either
  // trigger manually, just pre-filled.
  async function handleScanResolved(client: ScannedClient) {
    setShowScanQr(false);
    const supabase = createClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "id, client_id, guest_label, service_id, therapist_id, room_number, booking_date, start_time, promo_id, status"
      )
      .eq("client_id", client.id)
      .in("status", ["Booked", "Needs Reassignment"])
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (booking) {
      setLogVisitBooking(booking as LogVisitInitialBooking);
    } else {
      setWalkinInitialClientId(client.id);
      setShowWalkin(true);
    }
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

  function openCancel(row: BookingRow) {
    setCancelBookingRow(row);
    setCancelReason("Client decided not to reschedule");
    setCancelError(null);
  }

  async function handleConfirmCancel() {
    if (!cancelBookingRow) return;
    setCancelSaving(true);
    setCancelError(null);
    const res = await cancelBooking(cancelBookingRow.id, sessionStaff?.id, cancelReason);
    setCancelSaving(false);
    if (!res.ok) {
      setCancelError(res.error);
      return;
    }
    setCancelBookingRow(null);
    reload();
    router.refresh();
  }

  function renderActions(row: BookingRow) {
    const canEarnRedeem =
      !row.client_id || (clients.find((c) => c.id === row.client_id)?.has_portal_account ?? false);
    return (
      <div className="flex items-center gap-1.5">
        {row.status === "Booked" && (
          <>
            <button
              type="button"
              onClick={() => setLogVisitBooking(row)}
              disabled={!canEarnRedeem}
              title={canEarnRedeem ? undefined : "Walang portal account — hindi pa mag-eearn/redeem ng points."}
              className="rounded-md border border-[#a97e2e] bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-accent-gold hover:brightness-125 transition-all disabled:cursor-not-allowed disabled:opacity-50"
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
          <>
            <button
              type="button"
              onClick={() => openReassign(row)}
              className="rounded-md border border-[#6b4f1f] bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-accent-amber hover:brightness-125 transition-all"
            >
              Reassign
            </button>
            <button
              type="button"
              onClick={() => openCancel(row)}
              className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
            >
              Cancel
            </button>
          </>
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
      <span className="text-muted">{row.room_number}</span>
    ) : (
      <span className="text-muted">—</span>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const d = new Date(`${date}T00:00:00`);
              d.setDate(d.getDate() - 1);
              setDate(d.toISOString().slice(0, 10));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-sm text-muted hover:border-gold hover:text-foreground transition-all"
            title="Previous day"
          >
            ‹
          </button>
          <input
            id="booking-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
          />
          <button
            type="button"
            onClick={() => {
              const d = new Date(`${date}T00:00:00`);
              d.setDate(d.getDate() + 1);
              setDate(d.toISOString().slice(0, 10));
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-sm text-muted hover:border-gold hover:text-foreground transition-all"
            title="Next day"
          >
            ›
          </button>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowScanQr(true)}
            disabled={services.length === 0 || rooms.length === 0 || staff.length === 0}
            className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-foreground hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Scan Member QR
          </button>
          <button
            type="button"
            onClick={() => {
              setWalkinInitialClientId(null);
              setShowWalkin(true);
            }}
            disabled={services.length === 0 || rooms.length === 0 || staff.length === 0}
            className="rounded-md border border-accent-green bg-accent-green/10 px-4 py-2 text-sm font-medium text-accent-green hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Filter Bar Controls */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        {/* Inline row: search + slot pills */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Search Input */}
          <div className="relative w-80 max-w-xs shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client codename or locker # (e.g. KD, 23)"
              className="w-full rounded-md border border-border bg-background py-2 pl-3 pr-8 text-xs text-foreground placeholder:text-stone-500 focus:border-gold outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-foreground text-xs font-bold"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Time Slot Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedTimeSlot("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                selectedTimeSlot === "all"
                  ? "bg-gold text-black font-semibold"
                  : "bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200"
              }`}
            >
              All
            </button>
            {availableSlots.map((slot) => {
              const active = selectedTimeSlot.slice(0, 5) === slot.slice(0, 5);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedTimeSlot(slot)}
                  className={`rounded-full px-3 py-1 text-xs transition-all ${
                    active
                      ? "bg-gold text-black font-semibold"
                      : "bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {fmtTime(slot)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Record Counter */}
        <div className="text-xs font-medium text-stone-400 text-right">
          {searchQuery.trim() !== "" || selectedTimeSlot !== "all" ? (
            <span>
              Showing <strong className="text-foreground">{filteredRows.length}</strong> of{" "}
              <strong className="text-foreground">{rowsForTab.length}</strong> bookings
            </span>
          ) : (
            <span>
              Showing <strong className="text-foreground">{rowsForTab.length}</strong> bookings
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="py-6 text-center text-xs text-muted">Loading…</p>
        ) : rowsForTab.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted">
            No bookings for this date.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted">
            No bookings match your search or filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border text-[9.5px] font-semibold uppercase tracking-wider text-muted">
                  {tab === "checkin" && <th className="px-3.5 py-2.5 w-12 text-center">Edit</th>}
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
                {filteredRows.map((row) => {
                  const flagged = row.status === "Needs Reassignment";
                  const occ = occupancyOf(row);
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 ${
                        flagged ? "bg-gradient-to-r from-red-950/20 to-surface" : ""
                      }`}
                    >
                      {tab === "checkin" && (
                        <td className="px-3.5 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setEditBookingRow(row)}
                            title="Edit booking"
                            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] font-bold text-foreground hover:border-gold hover:text-accent-gold transition-all"
                          >
                            Edit
                          </button>
                        </td>
                      )}
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
                        {row.notes && row.notes.trim() !== "" && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-accent-gold/90 bg-accent-gold/10 border border-accent-gold/20 rounded px-1.5 py-0.5 max-w-fit">🚗 {row.notes}</div>
                        )}
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
          initialClientId={walkinInitialClientId}
          onClose={() => {
            setShowWalkin(false);
            setWalkinInitialClientId(null);
          }}
          onCreated={() => {
            setShowWalkin(false);
            setWalkinInitialClientId(null);
            reload();
            router.refresh();
          }}
        />
      )}

      {showScanQr && (
        <ScanMemberQrModal onClose={() => setShowScanQr(false)} onResolved={handleScanResolved} />
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

      {editBookingRow && (
        <EditBookingModal
          booking={editBookingRow}
          clients={clients}
          services={services}
          therapists={therapists}
          rooms={rooms}
          lockers={lockers}
          timeSlots={timeSlots}
          initialOccupancy={occupancyOf(editBookingRow)}
          onClose={() => setEditBookingRow(null)}
          onSaved={() => {
            setEditBookingRow(null);
            reload();
            router.refresh();
          }}
        />
      )}

      {cancelBookingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Cancel Booking</h3>
            <p className="text-xs text-muted">
              This will cancel the booking for{" "}
              <strong className="text-foreground">{clientLabel(cancelBookingRow)}</strong> —{" "}
              {serviceName(cancelBookingRow.service_id)}
              {cancelBookingRow.room_number ? ` · Room ${cancelBookingRow.room_number}` : ""} ·{" "}
              {cancelBookingRow.booking_date} {fmtTime(cancelBookingRow.start_time)}. This cannot be undone.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted" htmlFor="cancel-reason">
                Cancellation Reason
              </label>
              <input
                id="cancel-reason"
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              />
            </div>

            {cancelError && <p className="text-xs text-accent-red">{cancelError}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelBookingRow(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Back
              </button>
              <button
                type="button"
                disabled={cancelSaving}
                onClick={handleConfirmCancel}
                className="flex-1 rounded-lg border border-accent-red bg-accent-red/10 py-2 text-xs font-bold text-accent-red hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelSaving ? "Cancelling…" : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditBookingModal({
  booking,
  clients,
  services,
  therapists,
  rooms,
  lockers,
  timeSlots,
  initialOccupancy,
  onClose,
  onSaved,
}: {
  booking: BookingRow;
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  rooms: number[];
  lockers: number[];
  timeSlots: string[];
  initialOccupancy: LockerOccupancyRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { sessionStaff } = useStaffSim();
  const [serviceId, setServiceId] = useState(booking.service_id);
  const [therapistId, setTherapistId] = useState(booking.therapist_id ?? "");
  const [roomNumber, setRoomNumber] = useState<number | "">(booking.room_number ?? "");
  const [startTime, setStartTime] = useState(booking.start_time);
  const [lockerNumber, setLockerNumber] = useState<number | "">(
    initialOccupancy?.locker_number ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [unavailableTherapists, setUnavailableTherapists] = useState<Map<string, string>>(new Map());
  const [occupiedLockers, setOccupiedLockers] = useState<Set<number>>(new Set());
  const [maintenanceLockers, setMaintenanceLockers] = useState<Map<number, string | null>>(new Map());
  const [occupiedRooms, setOccupiedRooms] = useState<Set<number>>(new Set());
  const [salePaidAmount, setSalePaidAmount] = useState<number | null>(null);

  const currentService = useMemo(
    () => services.find((s) => s.id === booking.service_id),
    [services, booking.service_id]
  );
  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  );
  const isMassageService = selectedService?.name !== "Wet Area";
  const effectiveRooms = useMemo(
    () => (rooms && rooms.length > 0 ? rooms : Array.from({ length: 18 }, (_, i) => i + 1)),
    [rooms]
  );

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("sales")
      .select("amount")
      .eq("booking_id", booking.id)
      .eq("voided", false)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSalePaidAmount(data.amount);
        }
      });
  }, [booking.id]);

  useEffect(() => {
    const supabase = createClient();

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
      .select("id, locker_number, booking_id")
      .is("checked_out_at", null)
      .then(({ data }) => {
        const occSet = new Set<number>();
        for (const row of data ?? []) {
          const isSelf =
            row.booking_id === booking.id ||
            (initialOccupancy?.id && row.id === initialOccupancy.id) ||
            (initialOccupancy?.locker_number && row.locker_number === initialOccupancy.locker_number);
          if (!isSelf) {
            occSet.add(row.locker_number);
          }
        }
        setOccupiedLockers(occSet);
      });
  }, [booking.id, initialOccupancy]);

  useEffect(() => {
    if (!isMassageService) {
      setOccupiedRooms(new Set());
      return;
    }
    const supabase = createClient();
    const duration = selectedService?.duration_minutes ?? 60;
    supabase
      .from("bookings")
      .select("id, room_number, start_time, duration_minutes")
      .eq("booking_date", booking.booking_date)
      .in("status", ["Booked", "Completed", "Needs Reassignment"])
      .neq("id", booking.id)
      .then(({ data }) => {
        const occSet = new Set<number>();
        for (const b of data ?? []) {
          if (b.room_number != null) {
            if (slotsOverlap(startTime, duration, b.start_time, b.duration_minutes ?? 60)) {
              occSet.add(b.room_number);
            }
          }
        }
        setOccupiedRooms(occSet);
      });
  }, [booking.id, booking.booking_date, startTime, isMassageService, selectedService]);

  useEffect(() => {
    const supabase = createClient();
    const date = booking.booking_date;
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
  }, [booking.booking_date]);

  useEffect(() => {
    if (!therapistId || !isMassageService) {
      setAvailabilityMap({});
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
        .eq("booking_date", booking.booking_date)
        .eq("therapist_id", therapistId)
        .in("status", ["Booked", "Completed", "Needs Reassignment"])
        .neq("id", booking.id);

      if (cancelled) return;
      const duration = selectedService?.duration_minutes ?? 60;
      const map: Record<string, boolean> = {};

      for (const slot of timeSlots) {
        const conflict = (sameDayBookings ?? []).some((b) =>
          slotsOverlap(slot, duration, b.start_time, b.duration_minutes ?? 60)
        );
        map[slot] = !conflict;
      }
      setAvailabilityMap(map);
      setAvailabilityLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [booking.id, booking.booking_date, therapistId, serviceId, timeSlots, isMassageService, selectedService]);

  function handleServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    const nextService = services.find((s) => s.id === nextServiceId);
    const isNextMassage = nextService?.name !== "Wet Area";
    if (!isNextMassage) {
      setTherapistId("");
      setRoomNumber("");
    } else {
      if (roomNumber === "") {
        const freeRoom = effectiveRooms.find((r) => !occupiedRooms.has(r)) ?? effectiveRooms[0] ?? "";
        setRoomNumber(freeRoom);
      }
    }
  }

  async function handleConfirmSave() {
    if (!sessionStaff) return;
    setError(null);

    if (isMassageService) {
      if (!therapistId) {
        setError("Please select a therapist for massage service.");
        return;
      }
      if (roomNumber === "" || (typeof roomNumber === "number" && occupiedRooms.has(roomNumber) && roomNumber !== booking.room_number)) {
        setError("Please select an available room for massage service.");
        return;
      }
    }

    if (typeof lockerNumber === "number" && maintenanceLockers.has(lockerNumber)) {
      const note = maintenanceLockers.get(lockerNumber);
      setError(`Locker #${lockerNumber} is out of order${note ? ` (${note})` : ""}.`);
      return;
    }

    setSaving(true);

    const res = await editBooking({
      bookingId: booking.id,
      serviceId,
      therapistId: isMassageService && therapistId ? therapistId : null,
      roomNumber: isMassageService && roomNumber !== "" ? Number(roomNumber) : null,
      startTime: isMassageService ? startTime : null,
      lockerNumber: lockerNumber === "" ? null : Number(lockerNumber),
      staffId: sessionStaff.id,
    });

    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    onSaved();
  }

  const clientName = booking.client_id
    ? clients.find((c) => c.id === booking.client_id)?.codename ?? "Client"
    : booking.guest_label ?? "Walk-in";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Edit Booking</h3>
            <p className="text-xs text-muted">
              {clientName} · Room {booking.room_number ?? "—"} · {booking.booking_date}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Price Difference & Remittance Banner */}
        {currentService && selectedService && (
          <div className="rounded-lg border border-border bg-background/60 p-3 text-xs space-y-1">
            <div className="flex justify-between text-muted">
              <span>Original: {currentService.name} (₱{currentService.price.toLocaleString()})</span>
              {salePaidAmount !== null && <span>Paid: ₱{salePaidAmount.toLocaleString()}</span>}
            </div>
            <div className="flex justify-between font-medium text-foreground">
              <span>New: {selectedService.name} (₱{selectedService.price.toLocaleString()})</span>
              {(() => {
                const diff = selectedService.price - currentService.price;
                return (
                  <span
                    className={
                      diff > 0
                        ? "text-accent-gold font-bold"
                        : diff < 0
                        ? "text-accent-green font-bold"
                        : "text-muted"
                    }
                  >
                    {diff > 0
                      ? `+₱${diff.toLocaleString()} (Upgrade)`
                      : diff < 0
                      ? `-₱${Math.abs(diff).toLocaleString()} (Downgrade)`
                      : "No Price Change"}
                  </span>
                );
              })()}
            </div>
            {salePaidAmount !== null && selectedService.price !== currentService.price && (
              <p className="text-[10.5px] text-muted border-t border-border/50 pt-1 mt-1">
                Updated sales remittance total: ₱
                {Math.max(0, salePaidAmount + (selectedService.price - currentService.price)).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Service */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted" htmlFor="edit-service">
            Service
          </label>
          <select
            id="edit-service"
            value={serviceId}
            onChange={(e) => handleServiceChange(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.duration_minutes}m - ₱{s.price.toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        {/* Assign Room */}
        {isMassageService ? (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted" htmlFor="edit-room">
              Assign Room
            </label>
            <select
              id="edit-room"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            >
              <option value="">— Select Room —</option>
              {effectiveRooms.map((num) => {
                const occupied = occupiedRooms.has(num);
                const isCurrent = booking.room_number === num;
                const disabled = occupied && !isCurrent;
                return (
                  <option
                    key={num}
                    value={num}
                    disabled={disabled}
                    className={disabled ? "text-muted" : undefined}
                  >
                    Room {num}{isCurrent ? " (Current)" : occupied ? " — Occupied" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        ) : (
          <div className="rounded-md border border-border/60 bg-background/30 p-2.5 text-xs text-muted">
            Room & Therapist assignment not required for Wet Area.
          </div>
        )}

        {/* Therapist */}
        {isMassageService && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted" htmlFor="edit-therapist">
              Therapist
            </label>
            <select
              id="edit-therapist"
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            >
              <option value="">— Select Therapist —</option>
              {therapists.map((t) => {
                const unavailableReason = unavailableTherapists.get(t.id);
                const isAssigned = booking.therapist_id === t.id;
                const disabled = !!unavailableReason && !isAssigned;
                return (
                  <option
                    key={t.id}
                    value={t.id}
                    disabled={disabled}
                    className={disabled ? "text-stone-500" : undefined}
                  >
                    {t.name}{unavailableReason ? ` - ${unavailableReason}` : ""}
                  </option>
                );
              })}
            </select>
            {availabilityLoading && (
              <p className="text-[10px] text-muted">Checking availability…</p>
            )}
          </div>
        )}

        {/* Massage Time / Schedule */}
        {isMassageService && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Massage Time / Schedule</label>
            {timeSlots.length === 0 ? (
              <p className="text-xs text-muted">No time slots available.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1 border border-border/50 rounded-lg">
                {timeSlots.map((s) => {
                  const available = therapistId && isMassageService ? (availabilityMap[s] ?? true) : true;
                  const selected = startTime === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!available}
                      onClick={() => setStartTime(s)}
                      className={`rounded-md border px-2 py-1.5 font-mono text-xs transition-all ${
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

        {/* Locker # */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted" htmlFor="edit-locker">
            Locker #
          </label>
          <select
            id="edit-locker"
            value={lockerNumber}
            onChange={(e) => setLockerNumber(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
          >
            <option value="">— Unassigned —</option>
            {lockers.map((num) => {
              const occupied = occupiedLockers.has(num);
              const isCurrent = initialOccupancy?.locker_number === num;
              const isMaintenance = maintenanceLockers.has(num);
              const maintenanceNote = maintenanceLockers.get(num);
              const disabled = (occupied && !isCurrent) || isMaintenance;
              return (
                <option key={num} value={num} disabled={disabled}>
                  Locker #{num}
                  {isMaintenance
                    ? ` — Out of Order${maintenanceNote ? ` (${maintenanceNote})` : ""}`
                    : isCurrent
                    ? " (Current)"
                    : occupied
                    ? " (Occupied)"
                    : ""}
                </option>
              );
            })}
          </select>
        </div>

        {error && <p className="text-xs text-accent-red font-medium">{error}</p>}

        <div className="flex gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleConfirmSave}
            className="flex-1 rounded-lg border border-gold bg-gold/10 py-2 text-xs font-bold text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
