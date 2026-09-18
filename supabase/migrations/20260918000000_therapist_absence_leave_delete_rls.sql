-- ohm#fixmarkpresentpersistence: therapist_absence and therapist_leave were
-- created as append-only in 20260830024144_therapist_absence_leave_rls.sql
-- (no DELETE policy added by design). That assumption broke when "Mark Present
-- Today" was introduced -- the server action's .delete() call is silently
-- blocked by RLS, returns {error:null, count:0}, and the row stays in the DB
-- causing the UI to revert on hard refresh.
--
-- Fix: add DELETE policies for is_supervisor_or_above() on both tables,
-- matching the identical pattern already in place for therapist_day_off
-- (20260830000000_therapist_day_off_rls.sql) and therapist_services
-- (20260901210000_therapist_services_rls.sql).

create policy "staff_delete" on public.therapist_absence
  for delete using (is_supervisor_or_above());

create policy "staff_delete" on public.therapist_leave
  for delete using (is_supervisor_or_above());
