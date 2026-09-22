export const STANDARD_SHIFT_SLOTS = [
  "04:00 PM",
  "05:30 PM",
  "07:00 PM",
  "08:30 PM",
  "10:00 PM",
  "11:30 PM",
  "01:00 AM",
] as const;

export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/**
 * Converts a time string (e.g. "16:00", "16:30", "4:00 PM", "04:00 PM")
 * into normalized "hh:mm A" format with zero-padded hour, e.g. "04:00 PM".
 */
export function normalizeSlotTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const trimmed = timeStr.trim();
  if (!trimmed) return "";

  // Check if it already has AM/PM
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hr = parseInt(ampmMatch[1], 10);
    const min = ampmMatch[2];
    const ampm = ampmMatch[3].toUpperCase();
    return `${String(hr).padStart(2, "0")}:${min} ${ampm}`;
  }

  // Check 24-hr format HH:MM
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = match24[2];
    const hr12 = ((h + 11) % 12) + 1;
    const ampm = h < 12 ? "AM" : "PM";
    return `${String(hr12).padStart(2, "0")}:${m} ${ampm}`;
  }

  return trimmed;
}

/**
 * Returns the short 3-letter day ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
 * for a given booking date (YYYY-MM-DD) in Asia/Manila.
 */
export function getBookingDayOfWeek(bookingDate: string | null | undefined): string {
  if (!bookingDate) return "";
  // Safe date parsing without UTC shift
  const [year, month, day] = bookingDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[d.getUTCDay()];
}

export type PromoConstraintProps = {
  applicable_days?: string[] | null;
  applicable_slots?: string[] | null;
  min_pax?: number | null;
};

export type PromoEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

export type PromoValidationResult = PromoEligibilityResult;

/**
 * Validates whether a promo can be applied based on:
 * - bookingDate (YYYY-MM-DD)
 * - slotTime (e.g. "16:00" or "04:00 PM")
 * - paxCount (number of guests, default 1)
 */
export function validatePromoEligibility(
  promo: PromoConstraintProps | null | undefined,
  context: {
    bookingDate?: string | null;
    slotTime?: string | null;
    paxCount?: number | null;
  }
): PromoEligibilityResult {
  if (!promo) return { eligible: true };

  const { applicable_days, applicable_slots, min_pax } = promo;

  // 1. Validate Pax Constraint
  const effectiveMinPax = typeof min_pax === "number" && min_pax > 1 ? min_pax : 1;
  const currentPax = typeof context.paxCount === "number" && context.paxCount > 0 ? context.paxCount : 1;
  if (currentPax < effectiveMinPax) {
    return {
      eligible: false,
      reason: `This promo requires at least ${effectiveMinPax} guest${effectiveMinPax > 1 ? "s" : ""}.`,
    };
  }

  // 2. Validate Day of Week Constraint
  const days = Array.isArray(applicable_days) ? applicable_days.filter(Boolean) : [];
  let dayMatches = true;
  let formattedDayString = "";
  if (days.length > 0) {
    const bookingDay = getBookingDayOfWeek(context.bookingDate);
    if (bookingDay) {
      dayMatches = days.includes(bookingDay);
    }
    // Pre-format day string for friendly message
    const isWeekdays =
      days.length === 5 && ["Mon", "Tue", "Wed", "Thu", "Fri"].every((d) => days.includes(d));
    const isWeekends =
      days.length === 2 && ["Sat", "Sun"].every((d) => days.includes(d));
    if (isWeekdays) {
      formattedDayString = "Mon–Fri";
    } else if (isWeekends) {
      formattedDayString = "Sat–Sun";
    } else {
      formattedDayString = days.join(", ");
    }
  }

  // 3. Validate Timeslot Constraint
  const slots = Array.isArray(applicable_slots) ? applicable_slots.filter(Boolean) : [];
  let slotMatches = true;
  let formattedSlotString = "";
  if (slots.length > 0) {
    const normalizedSelectedSlot = normalizeSlotTime(context.slotTime);
    const normalizedApplicableSlots = slots.map((s) => normalizeSlotTime(s));
    if (normalizedSelectedSlot) {
      slotMatches = normalizedApplicableSlots.includes(normalizedSelectedSlot);
    }
    // Clean display: remove leading zeros for cleaner sentence
    formattedSlotString = slots
      .map((s) => s.replace(/^0/, ""))
      .join(" or ");
  }

  if (!dayMatches && !slotMatches) {
    return {
      eligible: false,
      reason: `This promo is only valid ${formattedDayString} at ${formattedSlotString}.`,
    };
  }

  if (!dayMatches) {
    return {
      eligible: false,
      reason: `This promo is only valid on ${formattedDayString}.`,
    };
  }

  if (!slotMatches) {
    return {
      eligible: false,
      reason: `This promo is only valid at ${formattedSlotString}.`,
    };
  }

  return { eligible: true };
}

/**
 * Returns a human-friendly badges/summary text for promo list items,
 * e.g. "Weekdays · 4:00 PM, 5:30 PM", "Weekends · Min 3 pax", or "Any day · Anytime"
 */
export function formatPromoRuleSummary(promo: PromoConstraintProps | null | undefined): string {
  if (!promo) return "Any day · Anytime";

  const parts: string[] = [];

  // Day part
  const days = Array.isArray(promo.applicable_days) ? promo.applicable_days.filter(Boolean) : [];
  if (days.length === 0 || days.length >= 7) {
    // anytime day
  } else {
    const isWeekdays =
      days.length === 5 && ["Mon", "Tue", "Wed", "Thu", "Fri"].every((d) => days.includes(d));
    const isWeekends =
      days.length === 2 && ["Sat", "Sun"].every((d) => days.includes(d));
    if (isWeekdays) {
      parts.push("Weekdays");
    } else if (isWeekends) {
      parts.push("Weekends");
    } else {
      parts.push(days.join(", "));
    }
  }

  // Slot part
  const slots = Array.isArray(promo.applicable_slots) ? promo.applicable_slots.filter(Boolean) : [];
  if (slots.length > 0) {
    parts.push(slots.map((s) => s.replace(/^0/, "")).join(", "));
  }

  // Pax part
  if (typeof promo.min_pax === "number" && promo.min_pax > 1) {
    parts.push(`Min ${promo.min_pax} pax`);
  }

  if (parts.length === 0) {
    return "Any day · Anytime";
  }

  return parts.join(" · ");
}
