"use client";

import { useMemo, useRef, useState } from "react";

type Entry = {
  id: string;
  locker_number: number;
  room_number: number | null;
  service_name: string;
  slot_time: string | null;
  therapist_name: string | null;
};

type NeedsCheckoutEntry = {
  id: string;
  locker_number: number;
  room_number: number | null;
  service_name: string;
  guest_or_client: string;
  checked_in_at: string;
};

function fmtCheckedInAt(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  const colX = [tableLeft + 20, tableLeft + 220, tableLeft + 400, tableLeft + 680];

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
  ctx.fillText("THERA", colX[3], tableTop + 25);

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

    ctx.fillStyle = muted;
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(row.therapist_name ?? "—", colX[3], y + 27);

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

function toMinutesSinceOpen(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const minutes = h * 60 + m;
  return minutes < 16 * 60 ? minutes + 24 * 60 : minutes;
}

function nearestUpcomingSlot(slots: string[]): string {
  const now = new Date();
  const nowMinutes = toMinutesSinceOpen(
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  );
  const upcoming = slots.find((s) => toMinutesSinceOpen(s) >= nowMinutes);
  return upcoming ?? slots[0];
}

export function CallSheetBrowser({
  inProgress,
  needsCheckout,
  availableSlots,
}: {
  inProgress: Entry[];
  needsCheckout: NeedsCheckoutEntry[];
  availableSlots: string[];
}) {
  const [timeFilter, setTimeFilter] = useState<string>(() => nearestUpcomingSlot(availableSlots));
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const filtered = useMemo(
    () => (timeFilter === "all" ? inProgress : inProgress.filter((e) => e.slot_time === timeFilter)),
    [inProgress, timeFilter]
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
    <div className="max-w-5xl space-y-6">
      <div className="mb-2">
        <div className="text-sm font-bold tracking-[0.13em] uppercase text-muted mb-3">
          Call Sheet — Locker / Room / Service / Thera
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTimeFilter("all")}
            className={
              "shrink-0 rounded-lg border px-5 py-2.5 text-base font-bold transition " +
              (timeFilter === "all"
                ? "border-[#a97e2e] bg-[#c89b3c]/15 text-accent-gold"
                : "border-border bg-surface-2 text-muted hover:text-foreground")
            }
          >
            All
          </button>
          <div className="flex gap-2 flex-wrap">
            {availableSlots.map((t) => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={
                  "shrink-0 rounded-lg border px-5 py-2.5 text-base font-bold transition " +
                  (t === timeFilter
                    ? "border-[#a97e2e] bg-[#c89b3c]/15 text-accent-gold"
                    : "border-border bg-surface-2 text-muted hover:text-foreground")
                }
              >
                {fmtTime(t)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div
          className="grid gap-4 border-b border-border px-6 py-4 text-sm font-bold tracking-wider uppercase text-muted"
          style={{ gridTemplateColumns: "1fr 1fr 1.6fr 1fr" }}
        >
          <div>Locker</div>
          <div>Room</div>
          <div>Service</div>
          <div>Thera</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-6 py-8 text-lg text-muted">No massages match this time.</div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className="grid gap-4 border-b border-border px-6 py-5 text-lg last:border-b-0"
              style={{ gridTemplateColumns: "1fr 1fr 1.6fr 1fr" }}
            >
              <div className="text-foreground">{e.locker_number}</div>
              <div className="text-muted">{e.room_number ?? "—"}</div>
              <div className="font-semibold text-accent-gold">{e.service_name}</div>
              <div className="text-muted">{e.therapist_name ?? "—"}</div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-base text-muted">
          Total: {filtered.length} massage{filtered.length === 1 ? "" : "s"}
          {timeFilter === "all" ? " in progress" : ` at ${fmtTime(timeFilter)}`}
        </div>
        {timeFilter !== "all" && (
          <button
            onClick={handleDownload}
            className="rounded-lg border border-[#a97e2e] bg-surface px-5 py-2.5 text-base font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
          >
            Download JPEG
          </button>
        )}
      </div>
      {/* Hidden anchor used to trigger the JPEG download */}
      <a ref={downloadRef} className="hidden" />

      {needsCheckout.length > 0 && (
        <div className="rounded-xl border border-[#5e3c3c] bg-surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[#5e3c3c] bg-surface-2 px-6 py-3.5">
            <span className="h-2 w-2 rounded-full bg-accent-red" />
            <span className="text-sm font-bold text-accent-red">
              Needs checkout — {needsCheckout.length} from a prior spa-day
            </span>
          </div>
          <div
            className="grid gap-4 border-b border-border px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-muted"
            style={{ gridTemplateColumns: "0.8fr 0.8fr 1.3fr 1.4fr 1.2fr" }}
          >
            <div>Locker</div>
            <div>Room</div>
            <div>Service</div>
            <div>Guest / Client</div>
            <div>Checked in</div>
          </div>
          {needsCheckout.map((e) => (
            <div
              key={e.id}
              className="grid gap-4 border-b border-border px-6 py-4 text-sm last:border-b-0"
              style={{ gridTemplateColumns: "0.8fr 0.8fr 1.3fr 1.4fr 1.2fr" }}
            >
              <div className="text-foreground">{e.locker_number}</div>
              <div className="text-muted">{e.room_number ?? "—"}</div>
              <div className="font-semibold text-accent-gold">{e.service_name}</div>
              <div className="text-foreground">{e.guest_or_client}</div>
              <div className="font-mono text-xs text-muted">{fmtCheckedInAt(e.checked_in_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
