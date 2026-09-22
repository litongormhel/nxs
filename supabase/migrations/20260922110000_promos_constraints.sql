-- Migration: Configurable Day, Timeslot, and Pax Constraints for Promo Codes (ohm#7f1a3c8e)
--
-- Adds nullable/defaulted columns to public.promos:
--   applicable_days text[] null (e.g. ['Mon','Tue','Wed','Thu','Fri'], ['Sat','Sun'], or NULL for anytime)
--   applicable_slots text[] null (e.g. ['04:00 PM', '05:30 PM'], ['01:00 AM'], or NULL for anytime)
--   min_pax integer not null default 1
--
-- Reloads the PostgREST schema cache to ensure columns are immediately accessible.

alter table public.promos
  add column if not exists applicable_days text[] null,
  add column if not exists applicable_slots text[] null,
  add column if not exists min_pax integer not null default 1;

-- Reload schema cache in PostgREST
notify pgrst, 'reload schema';
