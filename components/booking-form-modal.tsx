"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createBooking } from "@/app/bookings/actions";
import { SLOT_START_TIMES, slotsOverlap } from "@/lib/bookings/slots";
import { SmsPreviewModal } from "@/components/sms-preview-modal";
import type { Client, Service, Staff, Therapist } from "@/components/booking-browser";
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

function weekday(dateIso: string): number {
  return new Date(`${dateIso}T00:00:00`).getDay(); // 0=Sun..6=Sat
}

export function BookingFormModal({
  clients,
  services,
  therapists,
  rooms,
  staff,
  defaultDate,
  onClose,
  onCreated,
}: {
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  rooms: number[];
  staff: Staff[];
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  const [roomNumber, setRoomNumber] = useState<number | null>(rooms[0] ?? null);
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(SLOT_START_TIMES[0]);
  const [isGroupBooking, setIsGroupBooking] = useState(false);
  const [paxCount, setPaxCount] = useState<3 | 4>(3);
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
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

  const selectedService = services.find((s) => s.id === serviceId);
  const duration = selectedService?.duration_minutes ?? 0;

  const conflictingTherapists = useMemo(() => {
    const taken = new Set<string>();
    for (const row of conflicts) {
      if (!row.therapist_id) continue;
      if (slotsOverlap(startTime, duration, row.start_time, row.duration_minutes ?? 0)) {
        taken.add(row.therapist_id);
      }
    }
    return taken;
  }, [conflicts, startTime, duration]);

  const conflictingRooms = useMemo(() => {
    const taken = new Set<number>();
    for (const row of conflicts) {
      if (row.room_number == null) continue;
      if (slotsOverlap(startTime, duration, row.start_time, row.duration_minutes ?? 0)) {
        taken.add(row.room_number);
      }
    }
    return taken;
  }, [conflicts, startTime, duration]);

  const filteredClients = useMemo(() => {
    if (!clientQuery.trim()) return clients.slice(0, 8);
    const q = clientQuery.toLowerCase();
    return clients
      .filter(
        (c) => c.codename.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clients, clientQuery]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const isWeekday = weekday(date) >= 1 && weekday(date) <= 5;

  const canSubmit =
    !isPending &&
    !!clientId &&
    !!serviceId &&
    !!therapistId &&
    roomNumber != null &&
    !!staffId &&
    !!startTime;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createBooking({
        clientId,
        guestLabel: null,
        serviceId,
        therapistId,
        roomNumber: roomNumber as number,
        bookingDate: date,
        startTime,
        status: "Booked",
        paxCount: isGroupBooking ? paxCount : null,
        createdBy: staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (selectedClient && selectedService) {
        setSmsBooking({
          codename: selectedClient.codename,
          price: selectedService.price,
          serviceName: selectedService.name,
          date,
          startTime,
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
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          New Booking
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs text-muted" htmlFor="client-search">
              Client
            </label>
            <input
              id="client-search"
              type="text"
              placeholder="Search codename or username…"
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
                  <p className="px-3 py-2 text-xs text-muted">No matches.</p>
                ) : (
                  filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClientId(c.id);
                        setClientQuery("");
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-gold/10"
                    >
                      {c.codename} <span className="text-muted">@{c.username}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="service">
                Service
              </label>
              <select
                id="service"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.duration_minutes}min
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="date">
                Date
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted" htmlFor="slot">
              Time slot
            </label>
            <select
              id="slot"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {SLOT_START_TIMES.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="therapist">
                Therapist
              </label>
              <select
                id="therapist"
                value={therapistId}
                onChange={(e) => setTherapistId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {therapists.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    disabled={conflictingTherapists.has(t.id)}
                  >
                    {t.name} {conflictingTherapists.has(t.id) ? "(booked)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="room">
                Room
              </label>
              <select
                id="room"
                value={roomNumber ?? ""}
                onChange={(e) => setRoomNumber(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {rooms.map((r) => (
                  <option key={r} value={r} disabled={conflictingRooms.has(r)}>
                    Room {r} {conflictingRooms.has(r) ? "(booked)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isGroupBooking}
              onChange={(e) => setIsGroupBooking(e.target.checked)}
            />
            Squad Goals (group booking)
          </label>

          {isGroupBooking && (
            <div>
              <label className="text-xs text-muted" htmlFor="pax">
                Pax
              </label>
              <select
                id="pax"
                value={paxCount}
                onChange={(e) => setPaxCount(Number(e.target.value) as 3 | 4)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
              {isWeekday && (
                <p className="mt-2 rounded-md border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                  Squad Goals booked on a weekday — heads up, not blocked.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-muted" htmlFor="staff">
              Booked by (staff)
            </label>
            <select
              id="staff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.position}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:border-gold/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md border border-gold bg-gold/10 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Booking…" : "Create Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
