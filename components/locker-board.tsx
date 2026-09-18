"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { CheckoutConfirmModal, type CheckoutTarget } from "@/components/checkout-confirm-modal";
import { BulkCheckoutModal } from "@/components/bulk-checkout-modal";

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

export function LockerBoard({
  lockerNumbers,
  occupancy,
}: {
  lockerNumbers: number[];
  occupancy: Record<number, Occupancy>;
}) {
  const router = useRouter();
  const { sessionStaff } = useStaffSim();
  const [occ, setOcc] = useState(occupancy);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [busyLocker, setBusyLocker] = useState<number | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const occupiedCount = Object.keys(occ).length;
  const staleCount = Object.values(occ).filter((o) => o.stale).length;
  const staleLockerNumbers = Object.entries(occ)
    .filter(([_, entry]) => entry.stale)
    .map(([numStr]) => Number(numStr))
    .sort((a, b) => a - b);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Locker Board
        </div>
        <div className="flex items-center gap-2.5">
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
            {occupiedCount} / {lockerNumbers.length} occupied
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-8 md:grid-cols-10">
        {lockerNumbers.map((num) => {
          const entry = occ[num];
          return (
            <div
              key={num}
              className={`flex flex-col items-center justify-between rounded-lg border px-1.5 py-2.5 text-center ${
                entry
                  ? entry.stale
                    ? "border-dashed border-[#a45a3f] bg-surface-2"
                    : "border-[#a97e2e] bg-surface-accent"
                  : "border-border bg-surface"
              }`}
            >
              <div className="text-[13px] font-bold text-foreground">{num}</div>
              {entry ? (
                <>
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
                </>
              ) : (
                <div className="mt-1 text-[9.5px] text-muted opacity-60">Free</div>
              )}
            </div>
          );
        })}
      </div>

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
