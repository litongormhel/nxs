"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import { checkOutLocker } from "@/app/lockers/actions";

type Occupancy = {
  occupancyId: string;
  label: string;
  checkedInAt: string;
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

  const occupiedCount = Object.keys(occ).length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  const handleCheckOut = async (num: number) => {
    const entry = occ[num];
    if (!entry) return;
    setBusyLocker(num);
    const res = await checkOutLocker(entry.occupancyId, sessionStaff?.id ?? "");
    setBusyLocker(null);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    setOcc((prev) => {
      const next = { ...prev };
      delete next[num];
      return next;
    });
    showToast(`Locker ${num} checked out — now available`);
    router.refresh();
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Locker Board
        </div>
        <span className="text-[10.5px] text-muted">
          {occupiedCount} / {lockerNumbers.length} occupied
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-8 md:grid-cols-10">
        {lockerNumbers.map((num) => {
          const entry = occ[num];
          return (
            <div
              key={num}
              className={`flex flex-col items-center justify-between rounded-lg border px-1.5 py-2.5 text-center ${
                entry
                  ? "border-[#a97e2e] bg-[#2a1f14]"
                  : "border-border bg-surface"
              }`}
            >
              <div className="text-[13px] font-bold text-foreground">{num}</div>
              {entry ? (
                <>
                  <div className="mt-1 truncate w-full text-[9.5px] font-semibold text-[#f3d48b]">
                    {entry.label}
                  </div>
                  <button
                    disabled={busyLocker === num}
                    onClick={() => handleCheckOut(num)}
                    className="mt-1.5 w-full rounded border border-[#a97e2e] py-1 text-[9px] font-bold text-[#f3d48b] hover:bg-[#c89b3c]/10 disabled:opacity-50"
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

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-[#1d1610] px-5 py-2.5 font-mono text-xs font-semibold text-[#f3d48b] shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
