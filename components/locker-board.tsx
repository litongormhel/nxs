"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { CheckoutConfirmModal, type CheckoutTarget } from "@/components/checkout-confirm-modal";
import { BulkCheckoutModal } from "@/components/bulk-checkout-modal";
import { toggleLockerMaintenance } from "@/app/(staff)/lockers/actions";

type Occupancy = {
  occupancyId: string;
  label: string;
  checkedInAt: string;
  stale: boolean;
  clientCodename?: string;
  roomNumber?: number | null;
  serviceName?: string;
  startTime?: string | null;
  durationMinutes?: number | null;
  therapistName?: string | null;
};

export type LockerItem = {
  number: number;
  status?: string;
  isMaintenance?: boolean;
  maintenanceNote?: string | null;
};

export function LockerBoard({
  lockerNumbers,
  occupancy,
  lockers,
}: {
  lockerNumbers: number[];
  occupancy: Record<number, Occupancy>;
  lockers?: LockerItem[];
}) {
  const router = useRouter();
  const { sessionStaff } = useStaffSim();
  const [occ, setOcc] = useState(occupancy);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [busyLocker, setBusyLocker] = useState<number | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Maintenance state
  const [maintenanceMap, setMaintenanceMap] = useState<Record<number, { note: string | null }>>(() => {
    const map: Record<number, { note: string | null }> = {};
    for (const l of lockers ?? []) {
      if (l.isMaintenance || l.status === "out_of_order" || l.status === "maintenance") {
        map[l.number] = { note: l.maintenanceNote ?? null };
      }
    }
    return map;
  });

  useEffect(() => {
    const map: Record<number, { note: string | null }> = {};
    for (const l of lockers ?? []) {
      if (l.isMaintenance || l.status === "out_of_order" || l.status === "maintenance") {
        map[l.number] = { note: l.maintenanceNote ?? null };
      }
    }
    setMaintenanceMap(map);
  }, [lockers]);

  // Modal states for Free / Maintenance lockers
  const [selectedFreeLocker, setSelectedFreeLocker] = useState<number | null>(null);
  const [freeLockerNote, setFreeLockerNote] = useState("");
  const [selectedMaintenanceLocker, setSelectedMaintenanceLocker] = useState<{
    number: number;
    note: string | null;
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<any>(null);

  const occupiedCount = Object.keys(occ).length;
  const maintenanceCount = Object.keys(maintenanceMap).length;
  const workingCount = Math.max(0, lockerNumbers.length - maintenanceCount);

  const staleCount = Object.values(occ).filter((o) => o.stale).length;
  const staleLockerNumbers = Object.entries(occ)
    .filter(([_, entry]) => entry.stale)
    .map(([numStr]) => Number(numStr))
    .sort((a, b) => a - b);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2800);
  };

  async function handleMarkOutOfOrder(num: number, note: string) {
    setActionPending(true);
    setActionError(null);
    try {
      const res = await toggleLockerMaintenance(num, true, note, sessionStaff?.id);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setMaintenanceMap((prev) => ({
        ...prev,
        [num]: { note: note.trim() || null },
      }));
      setSelectedFreeLocker(null);
      setFreeLockerNote("");
      showToast(`Locker ${num} marked out of order`);
      router.refresh();
    } catch (err: any) {
      setActionError(err?.message || (typeof err === "string" ? err : String(err)));
    } finally {
      setActionPending(false);
    }
  }

  async function handleClearMaintenance(num: number) {
    setActionPending(true);
    setActionError(null);
    try {
      const res = await toggleLockerMaintenance(num, false, null, sessionStaff?.id);
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setMaintenanceMap((prev) => {
        const next = { ...prev };
        delete next[num];
        return next;
      });
      setSelectedMaintenanceLocker(null);
      showToast(`Locker ${num} marked as available`);
      router.refresh();
    } catch (err: any) {
      setActionError(err?.message || (typeof err === "string" ? err : String(err)));
    } finally {
      setActionPending(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Locker Board
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {maintenanceCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-900/60 bg-red-950/40 px-2.5 py-1 text-[9.5px] font-bold text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {maintenanceCount} out of order
            </span>
          )}
          {staleCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                className="rounded-lg border border-[#5e3c3c] bg-surface-2 px-2.5 py-1 text-[9.5px] font-bold text-accent-red hover:bg-[#5e3c3c]/30 transition-all"
              >
                Check Out Overdue ({staleCount})
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5e3c3c] bg-surface-2 px-2.5 py-1 text-[9.5px] font-bold text-accent-red">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-red" />
                {staleCount} locker{staleCount === 1 ? "" : "s"} need checkout
              </span>
            </>
          )}
          <span className="text-[10.5px] text-muted">
            {occupiedCount} / {workingCount} occupied ({lockerNumbers.length} total)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-8 md:grid-cols-10">
        {lockerNumbers.map((num) => {
          const entry = occ[num];
          const isMaint = Boolean(maintenanceMap[num]);
          const maintInfo = maintenanceMap[num];

          if (entry) {
            return (
              <div
                key={num}
                className={`flex flex-col items-center justify-between rounded-lg border px-1.5 py-2.5 text-center ${
                  entry.stale
                    ? "border-dashed border-[#a45a3f] bg-surface-2"
                    : "border-[#a97e2e] bg-surface-accent"
                }`}
              >
                <div className="text-[13px] font-bold text-foreground">{num}</div>
                <div
                  className={`mt-1 truncate w-full text-[9.5px] font-semibold ${
                    entry.stale ? "text-accent-red" : "text-accent-gold"
                  }`}
                >
                  {entry.label}
                </div>
                {entry.stale && (
                  <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-accent-red">
                    Since yesterday
                  </div>
                )}
                <button
                  disabled={busyLocker === num}
                  onClick={() =>
                    setCheckoutTarget({
                      occupancyId: entry.occupancyId,
                      clientCodename: entry.clientCodename ?? entry.label,
                      lockerNumber: num,
                      roomNumber: entry.roomNumber,
                      serviceName: entry.serviceName ?? "Service",
                      startTime: entry.startTime,
                      durationMinutes: entry.durationMinutes,
                      therapistName: entry.therapistName,
                      checkedInAt: entry.checkedInAt,
                      isWetArea: entry.serviceName === "Wet Area",
                    })
                  }
                  className="mt-1.5 w-full rounded border border-[#a97e2e] py-1 text-[9px] font-bold text-accent-gold hover:bg-[#c89b3c]/10 disabled:opacity-50"
                >
                  Check Out
                </button>
              </div>
            );
          }

          if (isMaint) {
            return (
              <div
                key={num}
                onClick={() => {
                  setSelectedMaintenanceLocker({
                    number: num,
                    note: maintInfo?.note ?? null,
                  });
                  setActionError(null);
                }}
                className="flex flex-col items-center justify-between rounded-lg border border-dashed border-red-500/60 bg-red-950/20 px-1.5 py-2.5 text-center cursor-pointer hover:border-red-400 hover:bg-red-950/35 transition-all group"
                title={maintInfo?.note ? `Out of order: ${maintInfo.note}` : "Out of order"}
              >
                <div className="text-[13px] font-bold text-red-200">{num}</div>
                <div className="mt-1 flex flex-col items-center w-full px-0.5">
                  <span className="inline-flex items-center rounded bg-red-950/70 px-1 py-0.5 text-[8px] font-bold text-red-400 border border-red-800/50 uppercase tracking-tight">
                    Out of Order
                  </span>
                  {maintInfo?.note && (
                    <span className="mt-0.5 truncate w-full text-[8px] text-red-300/80 font-medium">
                      {maintInfo.note}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMaintenanceLocker({
                      number: num,
                      note: maintInfo?.note ?? null,
                    });
                    setActionError(null);
                  }}
                  className="mt-1.5 w-full rounded border border-red-800/50 bg-red-950/40 py-1 text-[8.5px] font-bold text-red-300 hover:bg-red-900/60 transition-colors"
                >
                  Manage
                </button>
              </div>
            );
          }

          return (
            <div
              key={num}
              onClick={() => {
                setSelectedFreeLocker(num);
                setFreeLockerNote("");
                setActionError(null);
              }}
              className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-1.5 py-2.5 text-center cursor-pointer hover:border-gold/50 hover:bg-surface-accent/20 transition-all group min-h-[72px]"
            >
              <div className="text-[13px] font-bold text-foreground group-hover:text-gold transition-colors">
                {num}
              </div>
              <div className="mt-1 text-[9.5px] text-muted opacity-60 group-hover:opacity-100 group-hover:text-gold transition-opacity">
                Free
              </div>
            </div>
          );
        })}
      </div>

      {/* Free Locker Options Modal */}
      {selectedFreeLocker !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  Locker #{selectedFreeLocker}
                </h3>
                <span className="text-muted text-xs">•</span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Available
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFreeLocker(null);
                  setActionError(null);
                }}
                className="text-muted hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-500/30 p-2.5 rounded-lg">
                ⚠️ {typeof actionError === "string" ? actionError : actionError.message || "Failed to update locker status"}
              </div>
            )}

            {/* Mark Out of Order Section */}
            <div className="rounded-lg border border-red-950 bg-red-950/20 p-3.5 space-y-3">
              <div>
                <div className="text-xs font-semibold text-red-300">Mark Out of Order</div>
                <p className="text-[11px] text-muted mt-0.5">
                  Prevent this locker from being selected during check-in.
                </p>
              </div>
              <div>
                <label className="text-[10.5px] font-medium text-muted block mb-1">
                  Maintenance Note (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Broken key, handle loose, lock jammed"
                  value={freeLockerNote}
                  onChange={(e) => setFreeLockerNote(e.target.value)}
                  disabled={actionPending}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted/60 focus:border-red-500/70 outline-none disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => handleMarkOutOfOrder(selectedFreeLocker, freeLockerNote)}
                className="w-full rounded-md border border-red-800/80 bg-red-950/50 py-2 text-xs font-bold text-red-300 hover:bg-red-900/60 disabled:opacity-50 transition-all"
              >
                {actionPending ? "Updating…" : "Mark Out of Order"}
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedFreeLocker(null);
                  setActionError(null);
                }}
                disabled={actionPending}
                className="text-xs text-muted hover:text-foreground font-medium py-1 px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Locker Modal */}
      {selectedMaintenanceLocker !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-red-900/70 bg-surface p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Locker #{selectedMaintenanceLocker.number}
                </h3>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Out of Order
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMaintenanceLocker(null);
                  setActionError(null);
                }}
                className="text-muted hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-500/30 p-2.5 rounded-lg">
                ⚠️ {typeof actionError === "string" ? actionError : actionError.message || "Failed to update locker status"}
              </div>
            )}

            <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 space-y-1.5">
              <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
                Maintenance Note
              </div>
              <p className="text-xs text-foreground italic">
                {selectedMaintenanceLocker.note
                  ? `"${selectedMaintenanceLocker.note}"`
                  : "No maintenance note provided."}
              </p>
            </div>

            <p className="text-xs text-muted">
              Clearing maintenance will mark this locker as available again for customer check-in.
            </p>

            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setSelectedMaintenanceLocker(null);
                  setActionError(null);
                }}
                disabled={actionPending}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => handleClearMaintenance(selectedMaintenanceLocker.number)}
                className="flex-1 rounded-lg border border-emerald-700 bg-emerald-950/40 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50 transition-all"
              >
                {actionPending ? "Updating…" : "Mark as Available"}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutTarget && (
        <CheckoutConfirmModal
          target={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
          onSuccess={() => {
            const num = checkoutTarget.lockerNumber;
            setOcc((prev) => {
              const next = { ...prev };
              delete next[num];
              return next;
            });
            showToast(`Locker ${num} checked out — now available`);
            router.refresh();
          }}
        />
      )}

      {showBulkModal && (
        <BulkCheckoutModal
          overdueCount={staleCount}
          overdueLockerNumbers={staleLockerNumbers}
          onClose={() => setShowBulkModal(false)}
          onSuccess={(count) => {
            setOcc((prev) => {
              const next = { ...prev };
              for (const [key, val] of Object.entries(next)) {
                if (val.stale) {
                  delete next[Number(key)];
                }
              }
              return next;
            });
            showToast(`Bulk checked out ${count} overdue locker${count === 1 ? "" : "s"} — now available`);
            router.refresh();
          }}
        />
      )}

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-surface-2 px-5 py-2.5 font-mono text-xs font-semibold text-accent-gold shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
