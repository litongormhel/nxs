-- Drop unique index one_active_occupant_per_room to decouple 90-min room sessions from all-day locker stays
-- Room availability is strictly enforced by booking time-slot exclusion constraints on `bookings`
DROP INDEX IF EXISTS public.one_active_occupant_per_room;
