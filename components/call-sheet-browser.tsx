"use client";

import { useMemo, useRef, useState } from "react";

type Entry = {
  id: string;
  locker_number: number;
  room_number: number | null;
  service_name: string;
  slot_time: string | null;
};

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function drawCallSheetJpeg(rows: Entry[], label: string): string {
  const rowHeight = 42;
  const headerHeight = 120;
  const footerHeight = 50;
  const width = 900;
  const height = headerHeight + Math.max(rows.length, 1) * rowHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const background = "#0a0705";
  const surface = "#14100c";
  const border = "#2a2218";
  const foreground = "#f2ece1";
  const muted = "#a89a84";
  const gold = "#c89b3c";
  const accentGold = "#f3d48b";

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = gold;
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText("Call Sheet", 32, 48);

  ctx.fillStyle = muted;
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillText(label.toUpperCase(), 32, 72);

  const tableTop = 96;
  const tableLeft = 32;
  const tableWidth = width - 64;
  const colX = [tableLeft + 20, tableLeft + 220, tableLeft + 400];

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(tableLeft, tableTop, tableWidth, Math.max(rows.length, 1) * rowHeight + 40);

  ctx.fillStyle = surface;
  ctx.fillRect(tableLeft, tableTop, tableWidth, 40);

  ctx.fillStyle = muted;
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.fillText("LOCKER", colX[0], tableTop + 25);
  ctx.fillText("ROOM", colX[1], tableTop + 25);
  ctx.fillText("SERVICE", colX[2], tableTop + 25);

  ctx.strokeStyle = border;
  ctx.beginPath();
  ctx.moveTo(tableLeft, tableTop + 40);
  ctx.lineTo(tableLeft + tableWidth, tableTop + 40);
  ctx.stroke();

  rows.forEach((row, idx) => {
    const y = tableTop + 40 + idx * rowHeight;
    ctx.fillStyle = idx % 2 === 0 ? "#0d0a08" : surface;
    ctx.fillRect(tableLeft, y, tableWidth, rowHeight);

    ctx.fillStyle = foreground;
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(String(row.locker_number), colX[0], y + 27);

    ctx.fillStyle = muted;
    ctx.fillText(row.room_number != null ? String(row.room_number) : "—", colX[1], y + 27);

    ctx.fillStyle = accentGold;
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(row.service_name, colX[2], y + 27);

    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(tableLeft, y + rowHeight);
    ctx.lineTo(tableLeft + tableWidth, y + rowHeight);
    ctx.stroke();
  });

  ctx.fillStyle = muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(
    `Total: ${rows.length} massage${rows.length === 1 ? "" : "s"}`,
    tableLeft,
    tableTop + Math.max(rows.length, 1) * rowHeight + 40 + 26
  );

  return canvas.toDataURL("image/jpeg", 0.92);
}

export function CallSheetBrowser({
  entries,
  availableSlots,
}: {
  entries: Entry[];
  availableSlots: string[];
}) {
  const [timeFilter, setTimeFilter] = useState("all");
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const filtered = useMemo(
    () => entries.filter((e) => timeFilter === "all" || e.slot_time === timeFilter),
    [entries, timeFilter]
  );

  const handleDownload = () => {
    const label = timeFilter === "all" ? "All Times" : fmtTime(timeFilter);
    const dataUrl = drawCallSheetJpeg(filtered, label);
    const link = downloadRef.current;
    if (!link) return;
    link.href = dataUrl;
    link.download = `call-sheet-${timeFilter === "all" ? "all" : timeFilter.replace(":", "")}.jpg`;
    link.click();
  };

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
          {availableSlots.map((t) => (
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

      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <div className="text-[10.5px] text-muted">
          Total: {filtered.length} massage{filtered.length === 1 ? "" : "s"}
          {timeFilter === "all" ? " in progress" : ` at ${fmtTime(timeFilter)}`}
        </div>
        {timeFilter !== "all" && (
          <button
            onClick={handleDownload}
            className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
          >
            Download JPEG
          </button>
        )}
      </div>
      {/* Hidden anchor used to trigger the JPEG download */}
      <a ref={downloadRef} className="hidden" />
    </div>
  );
}
