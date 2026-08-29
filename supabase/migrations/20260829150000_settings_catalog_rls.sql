-- Staff Auth 6C-4: Settings/Catalog RLS (services, promos, addons, rooms,
-- lockers, weekend_slots). Reuses 6C-2's role helpers (is_staff(),
-- is_supervisor_or_above()). Closes the "app-level-only role gate" gap
-- accepted during Settings persistence (ohm#5x1p8m3v).
--
-- Policy shape: SELECT = any authenticated staff; INSERT/UPDATE =
-- Supervisor or Owner; no DELETE policy (soft-delete/deactivate via UPDATE)
-- except weekend_slots, which uses a real hard DELETE (no FK references it).

-- services
drop policy if exists "public_select" on public.services;
drop policy if exists "public_insert" on public.services;
drop policy if exists "public_update" on public.services;

create policy "staff_select" on public.services
  for select using (is_staff());

create policy "staff_insert" on public.services
  for insert with check (is_supervisor_or_above());

create policy "staff_update" on public.services
  for update using (is_supervisor_or_above()) with check (is_supervisor_or_above());

-- promos
drop policy if exists "public_select" on public.promos;
drop policy if exists "public_insert" on public.promos;
drop policy if exists "public_update" on public.promos;

create policy "staff_select" on public.promos
  for select using (is_staff());

create policy "staff_insert" on public.promos
  for insert with check (is_supervisor_or_above());

create policy "staff_update" on public.promos
  for update using (is_supervisor_or_above()) with check (is_supervisor_or_above());

-- addons
drop policy if exists "public_select" on public.addons;
drop policy if exists "public_insert" on public.addons;
drop policy if exists "public_update" on public.addons;

create policy "staff_select" on public.addons
  for select using (is_staff());

create policy "staff_insert" on public.addons
  for insert with check (is_supervisor_or_above());

create policy "staff_update" on public.addons
  for update using (is_supervisor_or_above()) with check (is_supervisor_or_above());

-- rooms
drop policy if exists "public_select" on public.rooms;
drop policy if exists "public_insert" on public.rooms;
drop policy if exists "public_update" on public.rooms;

create policy "staff_select" on public.rooms
  for select using (is_staff());

create policy "staff_insert" on public.rooms
  for insert with check (is_supervisor_or_above());

create policy "staff_update" on public.rooms
  for update using (is_supervisor_or_above()) with check (is_supervisor_or_above());

-- lockers (insert-only today, no UPDATE policy existed or is needed)
drop policy if exists "public_select" on public.lockers;
drop policy if exists "public_insert" on public.lockers;

create policy "staff_select" on public.lockers
  for select using (is_staff());

create policy "staff_insert" on public.lockers
  for insert with check (is_supervisor_or_above());

-- weekend_slots (real hard DELETE, no FK references it)
drop policy if exists "public_select" on public.weekend_slots;
drop policy if exists "public_insert" on public.weekend_slots;
drop policy if exists "public_delete" on public.weekend_slots;

create policy "staff_select" on public.weekend_slots
  for select using (is_staff());

create policy "staff_insert" on public.weekend_slots
  for insert with check (is_supervisor_or_above());

create policy "staff_delete" on public.weekend_slots
  for delete using (is_supervisor_or_above());
