-- Settings Persistence (ohm#5x1p8m3v)
--
-- Wires the already-built Settings UI to real Supabase persistence via
-- direct writes to the existing catalog tables. No new generic "settings"
-- store — additive RLS on services/promos/addons/rooms/lockers plus one new
-- dedicated table for weekend slots (nothing in the schema modeled these).
--
-- IMPORTANT — app-level-only role gate: these policies grant INSERT/UPDATE
-- capability at the DB level to any anon/authenticated caller. The actual
-- "Front Desk can't edit, Supervisor/Owner can" restriction is enforced
-- ONLY in the UI/server-action layer (via the existing Simulate Staff
-- selection in components/settings-browser.tsx), NOT at the RLS layer.
-- This is the same explicitly-accepted gap as every other phase pending
-- real Staff Auth — see docs/architecture_locks/ADR-001, point 6.
--
-- Deletes for services/promos/addons are soft (active = false via UPDATE),
-- never hard DELETE — all three are FK-referenced by historical
-- sales/bookings/sale_addons rows. No DELETE policy is added for them.

-- Weekend Fixed Time Slots: no existing table models this. Plain slots
-- table, add/delete only, no FK to anything else.
create table if not exists public.weekend_slots (
  id uuid primary key default gen_random_uuid(),
  slot_time time not null unique,
  created_at timestamptz not null default now()
);

alter table public.weekend_slots enable row level security;

create policy public_select on public.weekend_slots
  for select to public
  using (true);

create policy public_insert on public.weekend_slots
  for insert to public
  with check (true);

create policy public_delete on public.weekend_slots
  for delete to public
  using (true);

-- Services: update price/points, soft-delete, add new.
create policy public_insert on public.services
  for insert to public
  with check (true);

create policy public_update on public.services
  for update to public
  using (true)
  with check (true);

-- Promos: add, update discount, soft-delete.
create policy public_insert on public.promos
  for insert to public
  with check (true);

create policy public_update on public.promos
  for update to public
  using (true)
  with check (true);

-- Add-ons: add, update price, soft-delete.
create policy public_insert on public.addons
  for insert to public
  with check (true);

create policy public_update on public.addons
  for update to public
  using (true)
  with check (true);

-- Rooms (Capacity): insert new rows to grow, deactivate (active=false) to
-- shrink — never a hard delete, bookings.room_number FKs to this table.
create policy public_insert on public.rooms
  for insert to public
  with check (true);

create policy public_update on public.rooms
  for update to public
  using (true)
  with check (true);

-- Lockers (Capacity): "+ Add 10 Lockers" only ever inserts new rows.
create policy public_insert on public.lockers
  for insert to public
  with check (true);
