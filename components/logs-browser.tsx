"use client";

import { useMemo, useState } from "react";
import { useStaffSim } from "@/lib/staff-context";

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

export function LogsBrowser({ initialLogs }: { initialLogs: LogEntry[] }) {
  const { currentRole } = useStaffSim();

  const [actionFilter, setActionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
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
    if (dateFilter && l.created_at.slice(0, 10) !== dateFilter) return false;
    if (staffFilter !== "all" && l.staff_name !== staffFilter) return false;
    return true;
  });

  if (currentRole !== "Owner") {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted max-w-md">
        Activity Logs is Owner-only. Switch to Owner in Settings &rarr;
        Simulate Staff to view this page.
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-2.5">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-border bg-[#1d1610] px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        >
          <option value="all">All Actions</option>
          {distinctActions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-border bg-[#1d1610] px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        />
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="rounded-lg border border-border bg-[#1d1610] px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
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
          filtered.map((l) => (
            <div
              key={l.id}
              className="grid gap-3 border-b border-border px-4 py-3 text-[12px] last:border-b-0"
              style={{ gridTemplateColumns: "1.3fr .9fr 1.1fr 1.7fr" }}
            >
              <div className="text-muted">{fmtWhen(l.created_at)}</div>
              <div className="text-foreground">{l.staff_name}</div>
              <div className="font-semibold text-[#f3d48b]">{l.action}</div>
              <div className="text-muted">{l.detail}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
