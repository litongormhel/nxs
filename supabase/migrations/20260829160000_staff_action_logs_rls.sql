-- Staff Auth 6C-5: role-based RLS for staff and action_logs.
-- Replaces the public_select/public_insert (USING/WITH CHECK (true)) policies
-- from Core Loop / staff_directory_and_logs_rls with role-keyed policies,
-- reusing 6C-2's is_staff()/is_owner() helpers. No new UPDATE/DELETE
-- policies on either table: staff has no edit UI, and action_logs must stay
-- append-only (audit trail).

drop policy if exists public_select on public.staff;
drop policy if exists public_insert on public.staff;

create policy staff_select on public.staff
  for select
  using (public.is_staff());

create policy staff_insert on public.staff
  for insert
  with check (public.is_owner());

drop policy if exists public_select on public.action_logs;
drop policy if exists public_insert on public.action_logs;

create policy action_logs_select on public.action_logs
  for select
  using (public.is_owner());

create policy action_logs_insert on public.action_logs
  for insert
  with check (public.is_staff());
