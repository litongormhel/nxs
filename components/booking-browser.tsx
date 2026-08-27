"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BookingFormModal } from "@/components/booking-form-modal";
import { QuickWalkinModal } from "@/components/quick-walkin-modal";
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
  start_time: string;
  duration_minutes: number | null;
  status: string;
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

export function BookingBrowser({
  clients,
  services,
  therapists,
  rooms,
  staff,
  promos,
  addons,
  lockers,
}: {
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  rooms: number[];
  staff: Staff[];
  promos: Promo[];
  addons: Addon[];
  lockers: number[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayIso());
  const [dayBookings, setDayBookings] = useState<BookingRow[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showWalkin, setShowWalkin] = useState(false);
  const loading = loadedFor !== date;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bookings")
      .select(
        "id, client_id, guest_label, service_id, therapist_id, room_number, start_time, duration_minutes, status, pax_count"
      )
      .eq("booking_date", date)
      .in("status", ACTIVE_STATUSES)
      .order("start_time", { ascending: true })
      .then(({ data }) => {
        setDayBookings(data ?? []);
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
    if (!id) return "Unassigned";
    return therapists.find((t) => t.id === id)?.name ?? "Unknown";
  }

  function clientLabel(row: BookingRow) {
    if (row.client_id) {
      return clients.find((c) => c.id === row.client_id)?.codename ?? "Client";
    }
    return row.guest_label ?? "Walk-in";
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
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowWalkin(true)}
            disabled={services.length === 0 || rooms.length === 0 || staff.length === 0}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          Bookings for {date}
        </h2>
        {loading ? (
          <p className="mt-3 text-xs text-muted">Loading…</p>
        ) : dayBookings.length === 0 ? (
          <p className="mt-3 text-xs text-muted">No bookings for this date.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {dayBookings.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium text-gold">{row.start_time.slice(0, 5)}</span>
                <span className="text-foreground">{clientLabel(row)}</span>
                <span className="text-muted">{serviceName(row.service_id)}</span>
                <span className="text-muted">Room {row.room_number ?? "—"}</span>
                <span className="text-muted">{therapistName(row.therapist_id)}</span>
                {row.pax_count && (
                  <span className="text-muted">· {row.pax_count} pax</span>
                )}
                <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {row.status}
                </span>
              </li>
            ))}
          </ul>
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
          onClose={() => setShowWalkin(false)}
          onCreated={() => {
            setShowWalkin(false);
            reload();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
