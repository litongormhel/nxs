"use client";

import { useMemo, useState, useTransition } from "react";
import { createBooking } from "@/app/bookings/actions";
import type { Client, Service, Staff, Therapist } from "@/components/booking-browser";

function nowIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function QuickWalkinModal({
  clients,
  services,
  therapists,
  rooms,
  staff,
  onClose,
  onCreated,
}: {
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  rooms: number[];
  staff: Staff[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"registered" | "unregistered">("unregistered");
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [guestLabel, setGuestLabel] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [therapistId, setTherapistId] = useState(therapists[0]?.id ?? "");
  const [roomNumber, setRoomNumber] = useState<number | null>(rooms[0] ?? null);
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const canSubmit =
    !isPending &&
    !!serviceId &&
    !!therapistId &&
    roomNumber != null &&
    !!staffId &&
    (mode === "registered" ? !!clientId : guestLabel.trim().length > 0);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createBooking({
        clientId: mode === "registered" ? clientId : null,
        guestLabel: mode === "registered" ? null : guestLabel.trim(),
        serviceId,
        therapistId,
        roomNumber: roomNumber as number,
        bookingDate: nowIsoDate(),
        startTime: nowTime(),
        status: "Completed",
        paxCount: null,
        createdBy: staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onCreated();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          Quick Walk-in
        </h2>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("unregistered")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${
              mode === "unregistered"
                ? "border-gold bg-gold/10 text-gold"
                : "border-border text-foreground"
            }`}
          >
            Walk-in guest
          </button>
          <button
            type="button"
            onClick={() => setMode("registered")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${
              mode === "registered"
                ? "border-gold bg-gold/10 text-gold"
                : "border-border text-foreground"
            }`}
          >
            Registered member
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {mode === "unregistered" ? (
            <div>
              <label className="text-xs text-muted" htmlFor="guest-label">
                Guest label
              </label>
              <input
                id="guest-label"
                type="text"
                placeholder="e.g. Walk-in 1"
                value={guestLabel}
                onChange={(e) => setGuestLabel(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted" htmlFor="walkin-client-search">
                Client
              </label>
              <input
                id="walkin-client-search"
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
          )}

          <div>
            <label className="text-xs text-muted" htmlFor="walkin-service">
              Service
            </label>
            <select
              id="walkin-service"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="walkin-therapist">
                Therapist
              </label>
              <select
                id="walkin-therapist"
                value={therapistId}
                onChange={(e) => setTherapistId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted" htmlFor="walkin-room">
                Room
              </label>
              <select
                id="walkin-room"
                value={roomNumber ?? ""}
                onChange={(e) => setRoomNumber(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {rooms.map((r) => (
                  <option key={r} value={r}>
                    Room {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted" htmlFor="walkin-staff">
              Logged by (staff)
            </label>
            <select
              id="walkin-staff"
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
            {isPending ? "Saving…" : "Complete Walk-in"}
          </button>
        </div>
      </div>
    </div>
  );
}
