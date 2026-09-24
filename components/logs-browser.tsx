"use client";

import { useEffect, useMemo, useState } from "react";
import { useStaffSim } from "@/lib/staff-context";
import { formatActionLog, formatActionLabel, type Lookups } from "@/lib/logs";
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

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset currentPage to 1 whenever filters or pageSize change
  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, dateFilter, staffFilter, pageSize]);

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

  const totalLogs = filtered.length;
  const totalPages = Math.ceil(totalLogs / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedLogs = useMemo(() => {
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [filtered, startIndex, pageSize]);

  if (currentRole !== "Owner" && currentRole !== "Developer" && currentRole !== "developer") {
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
          paginatedLogs.map((l) => {
            const { actionLabel, details } = formatActionLog(l, lookups);
            return (
              <div
                key={l.id}
                className="grid gap-3 border-b border-border px-4 py-3 text-[12px] last:border-b-0"
                style={{ gridTemplateColumns: "1.3fr .9fr 1.1fr 1.7fr" }}
              >
                <div className="text-muted">{fmtWhen(l.created_at)}</div>
                <div>
                  {l.staff_name === "System" ? (
                    <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-inset ring-border">
                      System
                    </span>
                  ) : (
                    <div className="text-foreground">{l.staff_name}</div>
                  )}
                </div>
                <div>
                  <span className="inline-flex items-center rounded-md bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-accent-gold ring-1 ring-inset ring-gold/20">
                    {actionLabel}
                  </span>
                </div>
                <div>
                  <div className="text-foreground text-[12px] leading-relaxed">{details}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 text-sm">
          {/* Left side: status indicator */}
          <div className="text-xs text-muted">
            Showing <span className="font-medium text-foreground">{startIndex + 1}</span>–
            <span className="font-medium text-foreground">
              {Math.min(startIndex + pageSize, totalLogs)}
            </span>{" "}
            of <span className="font-medium text-foreground">{totalLogs}</span> log entries
          </div>

          {/* Right side: controls */}
          <div className="flex flex-wrap items-center gap-6">
            {/* Rows per page selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md border border-[#292524] bg-[#141210] px-2.5 py-1 text-xs text-[#f5f5f4] focus:border-gold/50 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-muted">
                Page <span className="font-medium text-foreground">{currentPage}</span> of{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
