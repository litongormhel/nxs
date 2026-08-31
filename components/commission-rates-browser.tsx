"use client";

import { useState, useTransition } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { setCommissionRate } from "@/app/(staff)/analytics/actions";

export type CommissionService = {
  id: string;
  name: string;
  currentPercent: number | null;
  effectiveFrom: string | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RateRow({ service }: { service: CommissionService }) {
  const { sessionStaff } = useStaffSim();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(service.currentPercent?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const percent = Number(value);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Enter a percent between 0 and 100");
      return;
    }
    if (!sessionStaff) {
      setError("No active session");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setCommissionRate(service.id, percent, sessionStaff.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 flex-wrap">
      <div className="flex-1 text-[12.5px] font-bold text-foreground min-w-[140px]">
        {service.name}
      </div>

      {!editing && (
        <>
          <div className="text-[12.5px] text-fg min-w-[60px]">
            {service.currentPercent !== null ? (
              `${service.currentPercent}%`
            ) : (
              <span className="text-muted italic">Not set</span>
            )}
          </div>
          <div className="text-[11px] text-muted min-w-[140px]">
            {service.effectiveFrom
              ? `Effective since ${fmtDate(service.effectiveFrom)}`
              : "—"}
          </div>
          <button
            onClick={() => {
              setValue(service.currentPercent?.toString() ?? "");
              setError(null);
              setEditing(true);
            }}
            className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
          >
            Edit
          </button>
        </>
      )}

      {editing && (
        <>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-[80px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold"
            />
            <span className="text-[11px] text-muted">%</span>
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => {
              setError(null);
              setEditing(false);
            }}
            disabled={isPending}
            className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted hover:brightness-125 disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      )}

      {error && <div className="w-full text-[11px] text-accent-red">{error}</div>}
    </div>
  );
}

export function CommissionRatesBrowser({ services }: { services: CommissionService[] }) {
  const { currentRole } = useStaffSim();

  if (currentRole !== "Owner") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted max-w-md">
        Commission is Owner-only. Sign in with an Owner account to view this
        page.
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] text-muted mb-2.5">
        Commission percent per service. Editing a rate takes effect immediately and
        keeps the prior rate on record.
      </div>
      <div className="space-y-2">
        {services.length === 0 && (
          <p className="p-4 text-sm text-muted">No commissionable services found.</p>
        )}
        {services.map((s) => (
          <RateRow key={s.id} service={s} />
        ))}
      </div>
    </div>
  );
}
