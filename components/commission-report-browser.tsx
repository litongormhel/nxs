"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { getCommissionReport, type CommissionReportRow } from "@/app/(staff)/analytics/actions";
import { spaDayNow, spaMonthNow } from "@/lib/analytics/spa-day";

function peso(n: number): string {
  return `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

type Preset = "1-15" | "16-eom" | "custom";

function monthBounds(spaMonth: string): { first: string; last: string } {
  const [y, m] = spaMonth.split("-").map(Number);
  const first = `${spaMonth}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${spaMonth}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

function presetRange(preset: Preset): { start: string; end: string } {
  const spaMonth = spaMonthNow();
  const { first, last } = monthBounds(spaMonth);
  if (preset === "1-15") return { start: first, end: `${spaMonth}-15` };
  if (preset === "16-eom") return { start: `${spaMonth}-16`, end: last };
  return { start: spaDayNow(), end: spaDayNow() };
}

export function CommissionReportBrowser({
  filterTherapist,
  onClearFilter,
}: {
  filterTherapist?: { id: string; name: string } | null;
  onClearFilter?: () => void;
} = {}) {
  const { currentRole } = useStaffSim();
  const [preset, setPreset] = useState<Preset>("1-15");
  const [range, setRange] = useState(() => presetRange("1-15"));
  const [rows, setRows] = useState<CommissionReportRow[] | null>(null);
  const [grand, setGrand] = useState<{ total: number; commission: number; bookings: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePreset(p: Preset) {
    setPreset(p);
    setRange(presetRange(p));
  }

  const handleGenerate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await getCommissionReport(range.start, range.end);
      if (!result.ok) {
        setError(result.error);
        setRows(null);
        setGrand(null);
        return;
      }
      setRows(result.rows);
      setGrand({ total: result.grandTotal, commission: result.grandCommission, bookings: result.grandBookings });
    });
  }, [range.start, range.end]);

  useEffect(() => {
    if (!filterTherapist) return;
    const timer = setTimeout(handleGenerate, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTherapist?.id]);

  const displayRows = filterTherapist
    ? (rows ?? []).filter((r) => r.therapistId === filterTherapist.id)
    : rows;
  const displayGrand =
    filterTherapist && rows
      ? (() => {
          const filtered = rows.filter((r) => r.therapistId === filterTherapist.id);
          return {
            total: filtered.reduce((s, r) => s + r.total, 0),
            commission: filtered.reduce((s, r) => s + r.commission, 0),
            bookings: filtered.reduce((s, r) => s + r.bookingsCount, 0),
          };
        })()
      : grand;

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
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(["1-15", "16-eom", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePreset(p)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
              preset === p
                ? "border border-[#a97e2e] bg-surface text-accent-gold"
                : "border border-border text-muted hover:text-fg"
            }`}
          >
            {p === "1-15" ? "1–15" : p === "16-eom" ? "16–EOM" : "Custom"}
          </button>
        ))}

        <input
          type="date"
          value={range.start}
          onChange={(e) => {
            setPreset("custom");
            setRange((r) => ({ ...r, start: e.target.value }));
          }}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold"
        />
        <span className="text-[11px] text-muted">to</span>
        <input
          type="date"
          value={range.end}
          onChange={(e) => {
            setPreset("custom");
            setRange((r) => ({ ...r, end: e.target.value }));
          }}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold"
        />

        <button
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10 disabled:opacity-50"
        >
          {isPending ? "Generating..." : "Generate"}
        </button>
      </div>

      {filterTherapist && (
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold">
            Filtering: {filterTherapist.name}
            <button
              onClick={onClearFilter}
              className="ml-2 text-muted hover:text-fg"
              aria-label="Clear therapist filter"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {error && <div className="mb-4 text-[11px] text-accent-red">{error}</div>}

      {displayRows && displayGrand && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted">
                <th className="px-4 py-3 font-bold">Therapist</th>
                <th className="px-4 py-3 font-bold">Bookings</th>
                <th className="px-4 py-3 font-bold">Breakdown</th>
                <th className="px-4 py-3 font-bold">Total</th>
                <th className="px-4 py-3 font-bold">Commission</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No bookings in this range.
                  </td>
                </tr>
              )}
              {displayRows.map((row) => (
                <tr key={row.therapistId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-bold text-foreground">
                    {row.therapistName}
                    {row.therapistArchived && (
                      <span className="ml-1 text-muted font-normal">(Archived)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.bookingsCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {row.lines.map((line) => (
                        <span
                          key={line.serviceId}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
                          title={line.rateNotSet ? "No commission rate configured for this service" : undefined}
                        >
                          {line.serviceName} ×{line.count}
                          {line.rateNotSet && (
                            <span className="ml-1 italic text-muted">(Not set)</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{peso(row.total)}</td>
                  <td className="px-4 py-3 text-accent-gold font-bold">{peso(row.commission)}</td>
                </tr>
              ))}
            </tbody>
            {displayRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-border font-bold">
                  <td className="px-4 py-3 text-foreground">Grand Total</td>
                  <td className="px-4 py-3">{displayGrand.bookings}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3">{peso(displayGrand.total)}</td>
                  <td className="px-4 py-3 text-accent-gold">{peso(displayGrand.commission)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
