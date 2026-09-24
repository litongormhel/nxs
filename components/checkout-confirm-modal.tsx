"use client";

import { useState } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { checkOutLocker } from "@/app/(staff)/lockers/actions";
import { getSlotStatus, fmtTime } from "@/components/call-sheet-browser";

export type CheckoutTarget = {
  occupancyId: string;
  clientCodename: string;
  lockerNumber: number;
  roomNumber?: number | null;
  serviceName: string;
  startTime?: string | null;
  durationMinutes?: number | null;
  therapistName?: string | null;
  checkedInAt?: string | null;
  isWetArea?: boolean;
};

export function CheckoutConfirmModal({
  target,
  onClose,
  onSuccess,
}: {
  target: CheckoutTarget;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { sessionStaff } = useStaffSim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWetArea = target.isWetArea ?? target.serviceName === "Wet Area";
  const slotStatus = isWetArea
    ? "done"
    : getSlotStatus(
        target.startTime ?? null,
        target.durationMinutes ?? 90,
        target.checkedInAt ?? undefined
      );

  const isEarlyOrPreMassage = !isWetArea && (slotStatus === "upcoming" || slotStatus === "ongoing");

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await checkOutLocker(target.occupancyId, sessionStaff?.id ?? "");
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to check out locker.");
      setLoading(false);
    }
  };

  const formattedStartTime = target.startTime ? fmtTime(target.startTime) : "scheduled time";
  const therapistDisplay = target.therapistName ?? "assigned therapist";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-base font-bold text-foreground">Confirm Check-Out</h3>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (loading) return;
              onClose();
            }}
            className="text-muted hover:text-foreground text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Client & Locker Information Summary */}
        <div className="rounded-xl border border-border bg-background/60 p-4 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted uppercase font-bold text-[10px] tracking-wider">Client Codename</span>
            <span className="font-extrabold text-foreground text-sm">{target.clientCodename}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted uppercase font-bold text-[10px] tracking-wider">Assigned Locker</span>
            <span className="font-bold text-accent-gold">Locker {target.lockerNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted uppercase font-bold text-[10px] tracking-wider">Room & Service</span>
            <span className="font-medium text-stone-300">
              {target.roomNumber != null ? `Room ${target.roomNumber}` : "No Room"} · {target.serviceName}
            </span>
          </div>
        </div>

        {/* Pre-Massage / Incomplete Session Amber Warning Box */}
        {isEarlyOrPreMassage ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-300 leading-relaxed font-medium space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-400 text-sm">
              <span>⚠ Scheduled Massage Alert</span>
            </div>
            <p>
              Client has a massage scheduled for <span className="font-bold text-amber-200">{formattedStartTime}</span> with{" "}
              <span className="font-bold text-amber-200">{therapistDisplay}</span>. Are you sure you want to check them out early?
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted leading-relaxed">
            Are you sure you want to check out this client and free up <span className="font-bold text-foreground">Locker {target.lockerNumber}</span>?
          </p>
        )}

        {error && <p className="text-xs text-accent-red font-medium">{error}</p>}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (loading) return;
              onClose();
            }}
            className="flex-1 rounded-lg border border-border py-2.5 text-xs font-bold text-muted hover:text-foreground transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="flex-1 rounded-lg border border-[#5e3c3c] bg-accent-red/20 py-2.5 text-xs font-bold text-accent-red hover:bg-accent-red/30 transition-all disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-red border-t-transparent" />
                Checking Out…
              </>
            ) : (
              "Yes, Check Out"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
