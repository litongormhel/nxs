-- Ensure lockers 1 to 40 exist and are active in public.lockers (ohm#3b8e1f5a)
--
-- Backfills lockers 1..40 to ensure capacity exists and is active
-- Adds staff_update and staff_insert RLS policies for authenticated staff upserts

insert into public.lockers (number, active, status, is_maintenance)
select n, true, 'available', false
from generate_series(1, 40) as n
on conflict (number) do update
set active = true
where lockers.active = false;

-- Allow authenticated staff to update locker maintenance status/notes
drop policy if exists "staff_update" on public.lockers;
create policy "staff_update" on public.lockers
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- Allow authenticated staff to insert/upsert lockers
drop policy if exists "staff_insert" on public.lockers;
create policy "staff_insert" on public.lockers
  for insert
  with check (public.is_staff());

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
