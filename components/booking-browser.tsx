"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateBookingStatus } from "@/app/(staff)/bookings/actions";
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
};

const ACTIVE_STATUSES: Database["public"]["Enums"]["booking_status"][] = [
  "Booked",
  "Completed",
  "Needs Reassignment",
];

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
  const [date, setDate] = useState(todayIso());
  const [dayBookings, setDayBookings] = useState<BookingRow[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showWalkin, setShowWalkin] = useState(false);
  const [logVisitBooking, setLogVisitBooking] = useState<BookingRow | null>(null);
  const loading = loadedFor !== date;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bookings")
      .select(
        "id, client_id, guest_label, service_id, therapist_id, room_number, booking_date, start_time, duration_minutes, promo_id, status, pax_count"
      )
      .eq("booking_date", date)
      .in("status", ACTIVE_STATUSES)
      .order("start_time", { ascending: true })
      .then(({ data }) => {
        setDayBookings((data as BookingRow[]) ?? []);
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

  async function handleSetStatus(id: string, status: Database["public"]["Enums"]["booking_status"]) {
    await updateBookingStatus(id, status);
    reload();
    router.refresh();
  }

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

      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Upcoming & Recent Bookings
        </h2>
        {loading ? (
          <p className="py-6 text-center text-xs text-muted">Loading…</p>
        ) : dayBookings.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted">
            No bookings for this date.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {dayBookings.map((row) => {
              const flagged = row.status === "Needs Reassignment";
              return (
                <div
                  key={row.id}
                  className={`flex flex-wrap items-center gap-3.5 rounded-xl border p-3.5 transition-colors ${
                    flagged
                      ? "border-red-900/60 bg-gradient-to-r from-red-950/20 to-surface"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="min-w-[128px] font-mono">
                    <div className="text-[12.5px] font-medium text-accent-gold">
                      {fmtDate(row.booking_date)}
                    </div>
                    <div className="text-[9.5px] text-muted">{fmtTime(row.start_time)}</div>
                  </div>

                  <div className="min-w-[170px] flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-foreground">
                      <span>{clientLabel(row)}</span>
                      {row.room_number && (
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[8.5px] font-extrabold text-accent-gold">
                          Room {row.room_number}
                        </span>
                      )}
                      {row.pax_count && (
                        <span className="rounded-full border border-amber-800 bg-amber-950/40 px-2 py-0.5 text-[8px] font-extrabold tracking-wider text-amber-400 uppercase">
                          SQUAD ×{row.pax_count}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {serviceName(row.service_id)} · Therapist: {therapistName(row.therapist_id)}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider ${
                      row.status === "Booked"
                        ? "border border-[#a97e2e] bg-[#c89b3c]/15 text-accent-gold"
                        : row.status === "Completed"
                        ? "border border-[#4e5941] bg-[#8a9a76]/15 text-accent-green"
                        : row.status === "Needs Reassignment"
                        ? "border border-[#6b4f1f] bg-[#d9a441]/15 text-accent-amber"
                        : "border border-[#5e3c3c] bg-[#d18b8b]/15 text-accent-red"
                    }`}
                  >
                    {row.status}
                  </span>

                  {(row.status === "Booked" || row.status === "Needs Reassignment") && (
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
                          className="rounded-md border border-[#6b4f1f] bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-accent-amber hover:brightness-125 transition-all"
                        >
                          Reassign
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
          promos={promos}
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
    </div>
  );
}
