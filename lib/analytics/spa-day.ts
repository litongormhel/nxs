// Spa-day bucketing (Analytics phase, ohm#7v2q8f5c): the spa runs from open
// (4:30 PM, matching the operating hours already established in
// lib/bookings/slots.ts) through last call (1:00 AM) — it does NOT reset at
// midnight. A timestamp between 12:00 AM and the next opening belongs to the
// PREVIOUS spa-day.
//
// Asia/Manila is a fixed UTC+8 offset with no DST, so "spa-day of a UTC
// timestamp" reduces to: shift back 8 hours to get Manila local time, then
// shift back another 8 hours (16 total) so the 12:00 AM–3:59 PM window rolls
// onto the prior calendar date, then read off the UTC calendar date of the
// result. Net effect: subtract 8 hours from the original UTC instant.
//
// This is the one canonical definition — no separate "operating day" concept
// existed anywhere in the codebase before this (checked ADR-001 and
// lib/bookings/slots.ts, which only defines the intra-day slot grid, not a
// day-bucketing rule). Every spa-day-bucketed stat/table in Analytics must
// route through this function rather than reimplementing the offset.
const SPA_DAY_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaDateParts(ms: number): { year: number; month: number; day: number } {
  const shifted = new Date(ms - SPA_DAY_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Returns the spa-day bucket (YYYY-MM-DD, Asia/Manila) for a UTC timestamp. */
export function toSpaDay(timestamp: string | Date): string {
  const ms = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp.getTime();
  const { year, month, day } = toManilaDateParts(ms);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Returns the spa-day-month bucket (YYYY-MM, Asia/Manila) for a UTC timestamp. */
export function toSpaMonth(timestamp: string | Date): string {
  const ms = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp.getTime();
  const { year, month } = toManilaDateParts(ms);
  return `${year}-${pad(month)}`;
}

/** Today's spa-day bucket (YYYY-MM-DD, Asia/Manila), based on the real current time. */
export function spaDayNow(): string {
  return toSpaDay(new Date());
}

/** This calendar month's spa-month bucket (YYYY-MM, Asia/Manila). */
export function spaMonthNow(): string {
  return toSpaMonth(new Date());
}

/** The set of the last `days` spa-day buckets, including today. */
export function lastSpaDays(days: number): Set<string> {
  const today = toManilaDateParts(Date.now());
  // Build from a UTC noon anchor on today's spa-day date to avoid DST-less
  // but still fiddly local-date arithmetic when stepping backwards by day.
  const anchor = Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0);
  const out = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(anchor - i * 24 * 60 * 60 * 1000);
    out.add(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
  }
  return out;
}
