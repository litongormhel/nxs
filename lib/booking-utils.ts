import {
  SLOT_START_TIMES,
  toMinutesSinceOpen,
  sortSlotTimes,
  compareSlotTimes,
  getSlotStartMs,
  isSlotPastGracePeriod,
  slotsOverlap,
} from "./bookings/slots";

export {
  SLOT_START_TIMES,
  toMinutesSinceOpen,
  sortSlotTimes,
  compareSlotTimes,
  getSlotStartMs,
  isSlotPastGracePeriod,
  slotsOverlap,
};

export const STANDARD_MASSAGE_DURATION_MINUTES = 80;
