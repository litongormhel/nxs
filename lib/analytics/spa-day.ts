// Spa-day bucketing (Analytics phase, ohm#7v2q8f5c; updated ohm#spaday8am):
// Starting at 8:00 AM (08:00 PHT), the spa day evaluates to the CURRENT CALENDAR DATE
// so reception can prepare for the upcoming 4:00 PM shift.
// Subtracting 1 day (-1 day) applies ONLY from 12:00 AM to 07:59 AM PHT (00:00 - 07:59 PHT)
// to cover late night operations and early morning turnover up to the 8:00 AM cutoff.
//
// Asia/Manila is a fixed UTC+8 offset with no DST.
//
// This is the one canonical definition — every spa-day-bucketed stat/table in Analytics
// and portal defaults must route through this helper.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function toManilaDateParts(ms: number): { year: number; month: number; day: number } {
  // Convert UTC timestamp to Manila local time (UTC+8)
  const manilaDate = new Date(ms + MANILA_OFFSET_MS);

  // Manila local hour (0 to 23)
  const hour = manilaDate.getUTCHours();

  // If local Manila hour is < 8 (00:00 to 07:59 PHT), it belongs to the previous spa-day.
  // If hour >= 8 (08:00 PHT onwards), it belongs to the current calendar date.
  const targetDate = hour < 8 ? new Date(manilaDate.getTime() - 24 * 60 * 60 * 1000) : manilaDate;

  return {
    year: targetDate.getUTCFullYear(),
    month: targetDate.getUTCMonth() + 1,
    day: targetDate.getUTCDate(),
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

/**
 * Returns UTC ISO bounds for a given spa-day (YYYY-MM-DD).
 * Start: YYYY-MM-DD 08:00:00+08:00 (00:00:00 UTC)
 * End:   (YYYY-MM-DD + 1 day) 02:00:00+08:00 (18:00:00 UTC)
 */
export function getSpaDayBounds(spaDateStr: string): { startIso: string; endIso: string } {
  const [year, month, day] = spaDateStr.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  const endMs = Date.UTC(year, month - 1, day, 18, 0, 0);
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

/** Adds or subtracts days from a spa-day string (YYYY-MM-DD). */
export function shiftSpaDay(spaDateStr: string, days: number): string {
  const [year, month, day] = spaDateStr.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day + days, 12, 0, 0);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

