"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { createClient } from "@/lib/supabase/client";
import { changeBookingTherapist, cancelReassignmentBooking } from "@/app/(staff)/bookings/actions";

export type FlaggedBooking = {
  id: string;
  bookingDate: string;
  startTime: string;
  durationMinutes?: number | null;
  clientLabel: string;
  serviceName: string;
  roomNumber: number | null;
  therapistId: string | null;
  therapistName: string;
};

export type TherapistOption = { id: string; name: string };
export type DayOffRecord = { therapist_id: string; weekday: number };
export type AbsenceRecord = { therapist_id: string; absent_date: string };
export type LeaveRecord = { therapist_id: string; start_date: string; end_date: string };
export type SameDayBooking = {
  id: string;
  therapist_id: string | null;
  booking_date: string;
  start_time: string;
  duration_minutes?: number | null;
  status: string;
};

const DEFAULT_STANDARD_SLOTS = [
  "16:00",
  "17:30",
  "19:00",
  "20:30",
  "22:00",
  "23:30",
  "01:00",
];

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

function timeToSpaMinutes(t: string): number {
  if (!t || !t.includes(":")) return 0;
  const [h, m] = t.split(":").map(Number);
  const mins = h * 60 + m;
  // Times before 8:00 AM (00:xx - 07:xx) belong to late-night turnover of the spa operating day
  return mins < 8 * 60 ? mins + 24 * 60 : mins;
}

function checkOverlap(
  startA: string,
  durA: number,
  startB: string,
  durB: number
): boolean {
  const aStart = timeToSpaMinutes(startA);
  const aEnd = aStart + durA;
  const bStart = timeToSpaMinutes(startB);
  const bEnd = bStart + durB;
  return aStart < bEnd && bStart < aEnd;
}

function spaSortTimes(times: string[]): string[] {
  return [...times].sort((a, b) => timeToSpaMinutes(a) - timeToSpaMinutes(b));
}

export function ReassignmentPanel({
  bookings,
  initialFlagged,
  therapists = [],
  daysOff,
  absences,
  leaves,
  allBookings,
  standardSlots,
}: {
  bookings?: FlaggedBooking[];
  initialFlagged?: FlaggedBooking[];
  therapists?: TherapistOption[];
  daysOff?: DayOffRecord[];
  absences?: AbsenceRecord[];
  leaves?: LeaveRecord[];
  allBookings?: SameDayBooking[];
  standardSlots?: string[];
}) {
  const flagged = bookings ?? initialFlagged ?? [];
  const { sessionStaff } = useStaffSim();
  const router = useRouter();

  const [targetBookings, setTargetBookings] = useState<SameDayBooking[]>(allBookings ?? []);
  const [targetAbsences, setTargetAbsences] = useState<AbsenceRecord[]>(absences ?? []);
  const [targetLeaves, setTargetLeaves] = useState<LeaveRecord[]>(leaves ?? []);
  const [targetDaysOff, setTargetDaysOff] = useState<DayOffRecord[]>(daysOff ?? []);
  const [targetSlots, setTargetSlots] = useState<string[]>(
    standardSlots && standardSlots.length > 0 ? standardSlots : DEFAULT_STANDARD_SLOTS
  );

  useEffect(() => {
    if (allBookings) setTargetBookings(allBookings);
  }, [allBookings]);
  useEffect(() => {
    if (absences) setTargetAbsences(absences);
  }, [absences]);
  useEffect(() => {
    if (leaves) setTargetLeaves(leaves);
  }, [leaves]);
  useEffect(() => {
    if (daysOff) setTargetDaysOff(daysOff);
  }, [daysOff]);
  useEffect(() => {
    if (standardSlots && standardSlots.length > 0) setTargetSlots(standardSlots);
  }, [standardSlots]);

  const [transferBooking, setTransferBooking] = useState<FlaggedBooking | null>(null);
  const [transferTherapistId, setTransferTherapistId] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSaving, setTransferSaving] = useState(false);

  // Client-side fresh verification for the target session date
  useEffect(() => {
    if (!transferBooking) return;
    const date = transferBooking.bookingDate;
    const supabase = createClient();
    const weekday = new Date(`${date}T00:00:00`).getDay();

    Promise.all([
      supabase
        .from("bookings")
        .select("id, therapist_id, booking_date, start_time, duration_minutes, status")
        .eq("booking_date", date)
        .neq("status", "Cancelled"),
      supabase
        .from("therapist_absence")
        .select("therapist_id, absent_date")
        .eq("absent_date", date),
      supabase
        .from("therapist_leave")
        .select("therapist_id, start_date, end_date")
        .lte("start_date", date)
        .gte("end_date", date),
      supabase
        .from("therapist_day_off")
        .select("therapist_id, weekday")
        .eq("weekday", weekday),
      supabase
        .from("weekend_slots")
        .select("slot_time"),
    ])
      .then(([bRes, aRes, lRes, dRes, sRes]) => {
        if (bRes.data) {
          setTargetBookings((prev) => {
            const otherDateBookings = prev.filter((b) => b.booking_date !== date);
            return [...otherDateBookings, ...bRes.data];
          });
        }
        if (aRes.data) {
          setTargetAbsences((prev) => {
            const otherDateAbsences = prev.filter((a) => a.absent_date !== date);
            return [...otherDateAbsences, ...aRes.data];
          });
        }
        if (lRes.data) {
          setTargetLeaves((prev) => {
            const ids = new Set(lRes.data.map((l) => l.therapist_id));
            return [...prev.filter((l) => !ids.has(l.therapist_id)), ...lRes.data];
          });
        }
        if (dRes.data) {
          setTargetDaysOff((prev) => {
            const ids = new Set(dRes.data.map((d) => d.therapist_id));
            return [
              ...prev.filter((d) => !(ids.has(d.therapist_id) && d.weekday === weekday)),
              ...dRes.data,
            ];
          });
        }
        if (sRes.data && sRes.data.length > 0) {
          setTargetSlots(spaSortTimes(sRes.data.map((s) => s.slot_time.slice(0, 5))));
        }
      })
      .catch((err) => {
        console.error("Failed to fetch fresh target date therapist status:", err);
      });
  }, [transferBooking?.bookingDate]);

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

  const targetDate = transferBooking?.bookingDate ?? "";
  const targetTime = transferBooking ? transferBooking.startTime.slice(0, 5) : "";
  const targetDuration = transferBooking?.durationMinutes ?? 90;
  const targetWeekday = targetDate ? new Date(`${targetDate}T00:00:00`).getDay() : -1;

  type CandidateStatus = "available" | "Day Off" | "Absent" | "On Leave" | "Booked";

  const therapistCandidates = useMemo(() => {
    if (!transferBooking) return [];

    const normId = (id: string | null | undefined) => String(id || "").trim().toLowerCase();
    const currentTherapistId = normId(transferBooking.therapistId);

    const absenceSet = new Set(
      targetAbsences
        .filter((a) => a.absent_date?.slice(0, 10) === targetDate)
        .map((a) => normId(a.therapist_id))
    );

    const leaveSet = new Set(
      targetLeaves
        .filter(
          (l) =>
            l.start_date?.slice(0, 10) <= targetDate &&
            l.end_date?.slice(0, 10) >= targetDate
        )
        .map((l) => normId(l.therapist_id))
    );

    const dayOffSet = new Set(
      targetDaysOff
        .filter((d) => d.weekday === targetWeekday)
        .map((d) => normId(d.therapist_id))
    );

    const relevantBookings = targetBookings.filter(
      (b) =>
        b.booking_date?.slice(0, 10) === targetDate &&
        b.status !== "Cancelled" &&
        b.id !== transferBooking.id &&
        !!b.therapist_id
    );

    const candidates = therapists
      .filter((t) => normId(t.id) !== currentTherapistId)
      .map((t) => {
        const nid = normId(t.id);

        let status: CandidateStatus = "available";
        let label = t.name;
        let disabled = false;

        if (absenceSet.has(nid)) {
          status = "Absent";
          label = `${t.name} — Absent`;
          disabled = true;
        } else if (leaveSet.has(nid)) {
          status = "On Leave";
          label = `${t.name} — On Leave`;
          disabled = true;
        } else if (dayOffSet.has(nid)) {
          status = "Day Off";
          label = `${t.name} — Day Off`;
          disabled = true;
        } else {
          const hasConflict = relevantBookings.some(
            (b) =>
              normId(b.therapist_id) === nid &&
              checkOverlap(
                targetTime,
                targetDuration,
                b.start_time.slice(0, 5),
                b.duration_minutes ?? 90
              )
          );

          if (hasConflict) {
            status = "Booked";
            label = `${t.name} — Booked at ${fmtTime(targetTime)}`;
            disabled = true;
          }
        }

        return {
          id: t.id,
          name: t.name,
          status,
          label,
          disabled,
        };
      });

    // Automatically sort available candidates to the top of the list
    return candidates.sort((a, b) => {
      const aAvailable = a.status === "available";
      const bAvailable = b.status === "available";
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [
    transferBooking,
    therapists,
    targetDate,
    targetTime,
    targetDuration,
    targetWeekday,
    targetAbsences,
    targetLeaves,
    targetDaysOff,
    targetBookings,
  ]);

  const selectedCandidate = useMemo(() => {
    if (!transferTherapistId) return null;
    return therapistCandidates.find((t) => t.id === transferTherapistId) ?? null;
  }, [transferTherapistId, therapistCandidates]);

  const schedulePreview = useMemo(() => {
    if (!transferBooking || !transferTherapistId || !selectedCandidate) return null;

    const normId = (id: string | null | undefined) => String(id || "").trim().toLowerCase();
    const selId = normId(transferTherapistId);

    const therapistBookingsToday = targetBookings.filter(
      (b) =>
        b.booking_date?.slice(0, 10) === targetDate &&
        normId(b.therapist_id) === selId &&
        b.status !== "Cancelled" &&
        b.id !== transferBooking.id
    );

    const isFreeAtTarget =
      selectedCandidate.status === "available" &&
      !therapistBookingsToday.some((b) =>
        checkOverlap(
          targetTime,
          targetDuration,
          b.start_time.slice(0, 5),
          b.duration_minutes ?? 90
        )
      );

    const bookedSlotTimes = spaSortTimes(
      Array.from(new Set(therapistBookingsToday.map((b) => b.start_time.slice(0, 5))))
    );

    let availableSlotsToday: string[] = [];
    if (
      selectedCandidate.status !== "Day Off" &&
      selectedCandidate.status !== "Absent" &&
      selectedCandidate.status !== "On Leave"
    ) {
      availableSlotsToday = targetSlots.filter((slot) => {
        return !therapistBookingsToday.some((b) =>
          checkOverlap(slot, 90, b.start_time.slice(0, 5), b.duration_minutes ?? 90)
        );
      });
    }

    return {
      isFreeAtTarget,
      bookedSlotTimes,
      availableSlotsToday,
    };
  }, [
    transferBooking,
    transferTherapistId,
    selectedCandidate,
    targetBookings,
    targetDate,
    targetTime,
    targetDuration,
    targetSlots,
  ]);

  if (flagged.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-[#6b4f1f] bg-surface p-5">
      <h2 className="text-sm font-bold text-accent-amber uppercase tracking-wide">
        Needs Reassignment ({flagged.length})
      </h2>
      <div className="mt-3 space-y-2">
        {flagged.map((row) => (
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
                Reassign Therapist
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
            <h3 className="text-base font-bold text-foreground">Reassign Therapist</h3>
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
                {therapistCandidates.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    disabled={t.disabled}
                    className={t.disabled ? "text-muted" : undefined}
                  >
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {selectedCandidate && schedulePreview && (
              <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Schedule Preview</span>
                  {schedulePreview.isFreeAtTarget ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent-green/30 bg-accent-green/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent-green">
                      ✓ Free at {fmtTime(targetTime)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent-red/30 bg-accent-red/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent-red">
                      ✕ Occupied at {fmtTime(targetTime)}
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-medium text-muted mb-1">
                    Available Slots Today:
                  </div>
                  {schedulePreview.availableSlotsToday.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {schedulePreview.availableSlotsToday.map((s) => (
                        <span
                          key={s}
                          className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground"
                        >
                          {fmtTime(s)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted italic">No available slots today</span>
                  )}
                </div>

                <div className="text-[11px] text-muted">
                  <span className="font-medium text-foreground">Booked Slots Today: </span>
                  {schedulePreview.bookedSlotTimes.length > 0 ? (
                    <span className="font-mono text-accent-gold">
                      Booked: {schedulePreview.bookedSlotTimes.map((s) => fmtTime(s)).join(", ")}
                    </span>
                  ) : (
                    <span className="italic">None</span>
                  )}
                </div>
              </div>
            )}

            {selectedCandidate && schedulePreview && !schedulePreview.isFreeAtTarget && (
              <p className="text-xs font-medium text-accent-red">
                Therapist is already booked at {fmtTime(targetTime)}. Please select another therapist.
              </p>
            )}

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
                disabled={
                  !transferTherapistId ||
                  transferSaving ||
                  (schedulePreview !== null && !schedulePreview.isFreeAtTarget)
                }
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

