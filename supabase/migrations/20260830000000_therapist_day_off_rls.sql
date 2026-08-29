-- Therapist Roster fix (ohm#7k2m9x4p): therapist_day_off has RLS enabled
-- (baseline snapshot) but has never had any policy — SELECT, INSERT, or
-- DELETE — added for it. Any read/write from the app's anon/authenticated
-- client has always been silently blocked, which is the actual root cause
-- of the Weekly Day(s) Off toggle not persisting. No new column/table
-- needed — this is purely the missing RLS grant, matching the identity-keyed
-- pattern from 20260829150000_settings_catalog_rls.sql (staff read,
-- supervisor+ write).

create policy "staff_select" on public.therapist_day_off
  for select using (is_staff());

create policy "staff_insert" on public.therapist_day_off
  for insert with check (is_supervisor_or_above());

create policy "staff_delete" on public.therapist_day_off
  for delete using (is_supervisor_or_above());
