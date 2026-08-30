-- Dashboard reassignment trigger (ohm#3f8q1w6z): therapist_absence and
-- therapist_leave both have RLS enabled (baseline snapshot) but have never
-- had any policy — SELECT or INSERT — so Mark Absent Today / Mark On Leave
-- have had no path to persist even after being wired to real Supabase calls.
-- Same gap and same fix as 20260830000000_therapist_day_off_rls.sql: staff
-- read, supervisor+ write. No UPDATE/DELETE policy — these are append-only
-- records for this phase, matching the fact that unmarking absence/leave is
-- out of scope.

create policy "staff_select" on public.therapist_absence
  for select using (is_staff());

create policy "staff_insert" on public.therapist_absence
  for insert with check (is_supervisor_or_above());

create policy "staff_select" on public.therapist_leave
  for select using (is_staff());

create policy "staff_insert" on public.therapist_leave
  for insert with check (is_supervisor_or_above());
