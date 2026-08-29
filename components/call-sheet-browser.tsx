"use client";

import { useMemo, useState } from "react";

type Entry = {
  id: string;
  locker_number: number;
  room_number: number | null;
  service_name: string;
  checked_in_at: string;
};

function timeKey(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function CallSheetBrowser({ entries }: { entries: Entry[] }) {
  const [timeFilter, setTimeFilter] = useState("all");

  const distinctTimes = useMemo(
    () => [...new Set(entries.map((e) => timeKey(e.checked_in_at)))].sort(),
    [entries]
  );

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => timeFilter === "all" || timeKey(e.checked_in_at) === timeFilter)
        .sort((a, b) => timeKey(a.checked_in_at).localeCompare(timeKey(b.checked_in_at))),
    [entries, timeFilter]
  );

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Call Sheet — Locker / Room / Service
        </div>
        <select
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        >
          <option value="all">All Times</option>
          {distinctTimes.map((t) => (
            <option key={t} value={t}>
              {fmtTime(t)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div
          className="grid gap-3 border-b border-border px-4 py-2.5 text-[10px] font-bold tracking-wider uppercase text-muted"
          style={{ gridTemplateColumns: "1fr 1fr 1.6fr" }}
        >
          <div>Locker</div>
          <div>Room</div>
          <div>Service</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted">No massages match this time.</div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className="grid gap-3 border-b border-border px-4 py-3 text-[12px] last:border-b-0"
              style={{ gridTemplateColumns: "1fr 1fr 1.6fr" }}
            >
              <div className="text-foreground">{e.locker_number}</div>
              <div className="text-muted">{e.room_number ?? "—"}</div>
              <div className="font-semibold text-accent-gold">{e.service_name}</div>
            </div>
          ))
        )}
      </div>

      <div className="text-[10.5px] text-muted">
        Total: {filtered.length} massage{filtered.length === 1 ? "" : "s"}
        {timeFilter === "all" ? " in progress" : ` at ${fmtTime(timeFilter)}`}
      </div>
    </div>
  );
}
