-- Therapist Roster fix (ohm#9q4x1mwr): therapist_services has RLS enabled
-- (baseline snapshot) but has never had any policy — SELECT, INSERT, or
-- DELETE — added for it. Any read/write from the app's authenticated client
-- has always been silently blocked (26 pre-seeded rows were unreadable).
-- No new column/table needed — this is purely the missing RLS grant,
-- matching the identity-keyed pattern from
-- 20260830000000_therapist_day_off_rls.sql (staff read, supervisor+ write).
-- No UPDATE policy — pure join table (PK is (therapist_id, service_id)),
-- toggling is always a plain insert/delete of a row, never an in-place
-- update.

create policy "staff_select" on public.therapist_services
  for select using (is_staff());

create policy "staff_insert" on public.therapist_services
  for insert with check (is_supervisor_or_above());

create policy "staff_delete" on public.therapist_services
  for delete using (is_supervisor_or_above());
