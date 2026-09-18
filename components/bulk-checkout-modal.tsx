"use client";

import { useState } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { checkOutOverdueLockers } from "@/app/(staff)/lockers/actions";

export function BulkCheckoutModal({
  overdueCount,
  overdueLockerNumbers,
  onClose,
  onSuccess,
}: {
  overdueCount: number;
  overdueLockerNumbers: number[];
  onClose: () => void;
  onSuccess: (count: number) => void;
}) {
  const { sessionStaff } = useStaffSim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await checkOutOverdueLockers(sessionStaff?.id ?? "");
      if (!res.ok) {
        setError(res.error);
      } else {
        onSuccess(res.count);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const sortedNumbers = [...overdueLockerNumbers].sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-base font-bold text-foreground">Confirm Bulk Checkout</h3>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="text-muted hover:text-foreground text-sm font-bold disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-muted leading-relaxed">
          Check out all <span className="font-bold text-foreground">{overdueCount}</span> overdue lockers from previous shifts?
        </p>

        <div className="rounded-xl border border-border bg-background/60 p-4 space-y-1.5 text-xs">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted">
            Affected Lockers
          </div>
          <div className="font-mono text-stone-300 font-medium break-words leading-relaxed">
            Lockers: {sortedNumbers.join(", ")}
          </div>
        </div>

        {error && <p className="text-xs text-accent-red font-medium">{error}</p>}

        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2.5 text-xs font-bold text-muted hover:text-foreground transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="flex-1 rounded-lg border border-[#5e3c3c] bg-accent-red/20 py-2.5 text-xs font-bold text-accent-red hover:bg-accent-red/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-red border-t-transparent" />
                Checking Out All…
              </>
            ) : (
              "Confirm Check Out All"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
