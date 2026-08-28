-- Seeds weekend_slots with the exact default times the Settings UI already
-- displayed as local-only state (ohm#6j2v9s4k), so switching to real
-- persistence (ohm#5x1p8m3v) doesn't visually wipe the list users already see.
insert into public.weekend_slots (slot_time) values
  ('16:00'), ('17:30'), ('19:00'), ('20:30'), ('22:00'), ('23:30'), ('01:00')
on conflict (slot_time) do nothing;
