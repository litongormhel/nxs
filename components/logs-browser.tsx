"use client";

import { useMemo, useState } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { formatLogDetail, formatActionLabel, type Lookups } from "@/lib/logs/format-detail";
import { spaDayNow, toSpaDay } from "@/lib/analytics/spa-day";

export type LogEntry = {
  id: string;
  action: string;
  detail: string | null;
  created_at: string;
  staff_name: string;
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString(
    "en-US",
    { hour: "numeric", minute: "2-digit" }
  )}`;
}

export function LogsBrowser({
  initialLogs,
  lookups,
}: {
  initialLogs: LogEntry[];
  lookups: Lookups;
}) {
  const { currentRole } = useStaffSim();

  const [actionFilter, setActionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(() => spaDayNow());
  const [staffFilter, setStaffFilter] = useState("all");

  const distinctActions = useMemo(
    () => [...new Set(initialLogs.map((l) => l.action))].sort(),
    [initialLogs]
  );
  const distinctStaff = useMemo(
    () => [...new Set(initialLogs.map((l) => l.staff_name))].sort(),
    [initialLogs]
  );

  const filtered = initialLogs.filter((l) => {
    if (actionFilter !== "all" && l.action !== actionFilter) return false;
    if (dateFilter && toSpaDay(l.created_at) !== dateFilter) return false;
    if (staffFilter !== "all" && l.staff_name !== staffFilter) return false;
    return true;
  });

  if (currentRole !== "Owner") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted max-w-md">
        Activity Logs is Owner-only. Sign in with an Owner account to view
        this page.
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        >
          <option value="all">All Actions</option>
          {distinctActions.map((a) => (
            <option key={a} value={a}>
              {formatActionLabel(a)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
          />
          {dateFilter ? (
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-xs text-muted hover:text-foreground hover:border-gold transition-colors"
              title="Show all dates"
            >
              All Dates
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDateFilter(spaDayNow())}
              className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-xs text-muted hover:text-foreground hover:border-gold transition-colors"
              title="Show today's logs"
            >
              Today
            </button>
          )}
        </div>
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        >
          <option value="all">All Staff</option>
          {distinctStaff.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div
          className="grid gap-3 border-b border-border px-4 py-2.5 text-[10px] font-bold tracking-wider uppercase text-muted"
          style={{ gridTemplateColumns: "1.3fr .9fr 1.1fr 1.7fr" }}
        >
          <div>When</div>
          <div>Staff</div>
          <div>Action</div>
          <div>Detail</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted">No matching log entries.</div>
        ) : (
          filtered.map((l) => {
            const { sentence, technicalIds } = formatLogDetail(l.action, l.detail, lookups);
            return (
              <div
                key={l.id}
                className="grid gap-3 border-b border-border px-4 py-3 text-[12px] last:border-b-0"
                style={{ gridTemplateColumns: "1.3fr .9fr 1.1fr 1.7fr" }}
              >
                <div className="text-muted">{fmtWhen(l.created_at)}</div>
                <div className="text-foreground">{l.staff_name}</div>
                <div>
                  <span className="inline-flex items-center rounded-md bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-accent-gold ring-1 ring-inset ring-gold/20">
                    {formatActionLabel(l.action)}
                  </span>
                </div>
                <div>
                  <div className="text-foreground text-[12px]">{sentence}</div>
                  {technicalIds.length > 0 && (
                    <div className="mt-0.5 font-mono text-[10px] text-muted/60">
                      {technicalIds.join(" ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
