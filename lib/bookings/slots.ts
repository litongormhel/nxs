// Operating hours confirmed 2026-08-27 (Bookings phase, ohm#9k4p7w2z): open 4:30 PM,
// hourly slot grid, last call 1:00 AM. The final slot (00:30-01:00) is shorter than an
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
