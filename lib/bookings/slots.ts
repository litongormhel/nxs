import { spaDayNow, shiftSpaDay } from "@/lib/analytics/spa-day";

// Operating hours confirmed 2026-08-27 (Bookings phase, ohm#9k4p7w2z): open 4:30 PM,
// hourly slot grid, last call 1:00 AM. The final slot (00:30-01:00) is shorter than an
// hour so that 1:00 AM stays selectable as the last start time.
// hour so that 1:00 AM stays selectable as the last start time.
export const SLOT_START_TIMES: string[] = (() => {
  const slots: string[] = [];
  let minutes = 16 * 60 + 30; // 16:30
  const lastCall = 25 * 60; // 01:00 next day, expressed on a 16:30-start clock
  while (minutes <= lastCall) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    minutes += 60;
  }
  if (slots[slots.length - 1] !== "01:00") {
    slots.push("01:00");
  }
  return slots;
})();

function toMinutesSinceOpen(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const minutes = h * 60 + m;
  // times after midnight (00:xx, 01:xx) are the tail end of the same operating day
  return minutes < 16 * 60 ? minutes + 24 * 60 : minutes;
}

// Sorts HH:MM times in operating-day order (4:30 PM open through 1:00 AM last call)
// rather than plain string/24-hr order, so slots configured in Settings display and
// populate the booking pickers in the order they actually occur during the shift.
export function sortSlotTimes(times: string[]): string[] {
  return [...times].sort((a, b) => toMinutesSinceOpen(a) - toMinutesSinceOpen(b));
}

export function compareSlotTimes(a: string, b: string): number {
  return toMinutesSinceOpen(a) - toMinutesSinceOpen(b);
}

export function slotsOverlap(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number
): boolean {
  const aStart = toMinutesSinceOpen(startA);
  const aEnd = aStart + durationA;
  const bStart = toMinutesSinceOpen(startB);
  const bEnd = bStart + durationB;
  return aStart < bEnd && bStart < aEnd;
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Returns UTC epoch milliseconds corresponding to the start of a slot
 * on a given spa operational day (YYYY-MM-DD).
 *
 * Slots with hour < 8 (e.g. 00:00, 00:30, 01:00) represent the post-midnight
 * extension of the shift and occur on the calendar date following the spa day.
 */
export function getSlotStartMs(bookingSpaDay: string, slotTime: string): number {
  const [h, m] = slotTime.split(":").map(Number);
  const calendarDate = h < 8 ? shiftSpaDay(bookingSpaDay, 1) : bookingSpaDay;
  const [year, month, day] = calendarDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day, h, m, 0) - MANILA_OFFSET_MS;
}

/**
 * Checks if a slot time has passed for a given booking date,
 * respecting the current Spa Day operational window and a 20-minute grace period.
 *
 * - Future dates (bookingDate > spaDayNow()): never past (returns false).
 * - Past dates (bookingDate < spaDayNow()): all past (returns true).
 * - Current spa day (bookingDate === spaDayNow()): remains selectable up to 20 minutes
 *   past its scheduled start (e.g., 5:30 PM slot stays open until 5:50 PM; at 5:51 PM, it is disabled).
 */
export function isSlotPastGracePeriod(
  slotTime: string,
  bookingDate: string,
  now: Date = new Date(),
  gracePeriodMinutes: number = 20
): boolean {
  if (!slotTime || !bookingDate) return false;
  const currentSpa = spaDayNow();
  if (bookingDate > currentSpa) {
    return false;
  }
  if (bookingDate < currentSpa) {
    return true;
  }
  const slotStartMs = getSlotStartMs(bookingDate, slotTime);
  const cutoffMs = slotStartMs + gracePeriodMinutes * 60 * 1000;
  return now.getTime() > cutoffMs;
}

