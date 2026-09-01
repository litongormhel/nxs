-- Promo Codes — Owner-only enforcement (ohm#3n7x9kwp)
-- Was is_supervisor_or_above() for INSERT/UPDATE since 6C-4 (20260829150000);
-- tightened to is_owner() to match the app-level gate narrowing from
-- Supervisor/Owner to Owner-only. staff_select stays is_staff() (unchanged) —
-- read access for all roles is not part of this change.

drop policy if exists "staff_insert" on public.promos;
drop policy if exists "staff_update" on public.promos;

create policy "staff_insert" on public.promos
  for insert with check (is_owner());

create policy "staff_update" on public.promos
  for update using (is_owner()) with check (is_owner());
