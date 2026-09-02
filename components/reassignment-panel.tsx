"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { changeBookingTherapist, cancelReassignmentBooking } from "@/app/(staff)/bookings/actions";

export type FlaggedBooking = {
  id: string;
  bookingDate: string;
  startTime: string;
  clientLabel: string;
  serviceName: string;
  roomNumber: number | null;
  therapistId: string | null;
  therapistName: string;
};

export type TherapistOption = { id: string; name: string };

function fmtTime(t: string): string {
  if (!t || !t.includes(":")) return t;
  const [h, m] = t.split(":");
  const hr = ((+h + 11) % 12) + 1;
  return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ReassignmentPanel({
  initialFlagged,
  therapists,
}: {
  initialFlagged: FlaggedBooking[];
  therapists: TherapistOption[];
}) {
  const { sessionStaff } = useStaffSim();
  const router = useRouter();

  const [transferBooking, setTransferBooking] = useState<FlaggedBooking | null>(null);
  const [transferTherapistId, setTransferTherapistId] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSaving, setTransferSaving] = useState(false);

  function openTransfer(row: FlaggedBooking) {
    setTransferBooking(row);
    setTransferTherapistId("");
    setTransferError(null);
  }

  const [cancelBooking, setCancelBooking] = useState<FlaggedBooking | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSaving, setCancelSaving] = useState(false);

  function openCancel(row: FlaggedBooking) {
    setCancelBooking(row);
    setCancelError(null);
  }

  async function handleConfirmCancel() {
    if (!cancelBooking || !sessionStaff) return;
    setCancelSaving(true);
    setCancelError(null);
    const res = await cancelReassignmentBooking(cancelBooking.id, sessionStaff.id);
    setCancelSaving(false);
    if (!res.ok) {
      setCancelError(res.error);
      return;
    }
    setCancelBooking(null);
    router.refresh();
  }

  async function handleConfirmTransfer() {
    if (!transferBooking || !transferTherapistId || !sessionStaff) return;
    setTransferSaving(true);
    setTransferError(null);
    const res = await changeBookingTherapist(
      transferBooking.id,
      transferTherapistId,
      sessionStaff.id,
      transferBooking.startTime
    );
    setTransferSaving(false);
    if (!res.ok) {
      setTransferError(res.error);
      return;
    }
    setTransferBooking(null);
    router.refresh();
  }

  if (initialFlagged.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-[#6b4f1f] bg-surface p-5">
      <h2 className="text-sm font-bold text-accent-amber uppercase tracking-wide">
        Needs Reassignment ({initialFlagged.length})
      </h2>
      <div className="mt-3 space-y-2">
        {initialFlagged.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
          >
            <div className="text-xs text-foreground">
              <span className="font-mono text-accent-gold">
                {fmtDate(row.bookingDate)} {fmtTime(row.startTime)}
              </span>{" "}
              · {row.clientLabel} · {row.serviceName}
              {row.roomNumber ? ` · Room ${row.roomNumber}` : ""} ·{" "}
              <span className="text-muted">was {row.therapistName}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openTransfer(row)}
                className="rounded-md border border-[#6b4f1f] bg-surface px-2.5 py-1 text-[10px] font-bold text-accent-amber hover:brightness-125 transition-all"
              >
                Transfer
              </button>
              <button
                type="button"
                onClick={() => openCancel(row)}
                className="rounded-md border border-border bg-surface px-2.5 py-1 text-[10px] font-bold text-muted hover:text-accent-red hover:border-accent-red transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>

      {transferBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Transfer Booking</h3>
            <p className="text-xs text-muted">
              {transferBooking.clientLabel} · {fmtDate(transferBooking.bookingDate)}{" "}
              {fmtTime(transferBooking.startTime)} · was {transferBooking.therapistName}
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted" htmlFor="transfer-therapist">
                New Therapist
              </label>
              <select
                id="transfer-therapist"
                value={transferTherapistId}
                onChange={(e) => setTransferTherapistId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              >
                <option value="" disabled>
                  Select therapist
                </option>
                {therapists
                  .filter((t) => t.id !== transferBooking.therapistId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>

            {transferError && <p className="text-xs text-accent-red">{transferError}</p>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTransferBooking(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!transferTherapistId || transferSaving}
                onClick={handleConfirmTransfer}
                className="flex-1 rounded-lg border border-[#a97e2e] bg-gold/10 py-2 text-xs font-bold text-accent-gold hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {transferSaving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Cancel Booking</h3>
            <p className="text-xs text-muted">
              This will cancel the booking for {cancelBooking.clientLabel} —{" "}
              {cancelBooking.serviceName}
              {cancelBooking.roomNumber ? ` · Room ${cancelBooking.roomNumber}` : ""} ·{" "}
              {fmtDate(cancelBooking.bookingDate)} {fmtTime(cancelBooking.startTime)}. This
              cannot be undone.
            </p>

            {cancelError && <p className="text-xs text-accent-red">{cancelError}</p>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelBooking(null)}
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
