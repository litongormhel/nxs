-- Client Portal 7A-1: allow_receptionist_manual_points setting (ohm#7a1f9c2k)
--
-- No generic "settings" table exists in this schema — Settings persistence
-- (ohm#5x1p8m3v) writes directly to per-domain catalog tables (services,
-- promos, addons, weekend_slots, lockers, rooms). There is nothing to
-- "reuse" structurally for a standalone boolean flag, so this migration
-- creates the smallest reasonable home for it: a singleton settings table,
-- following this repo's RLS/actor-attribution conventions rather than its
-- catalog-table persistence shape.

create table public.app_settings (
  id boolean primary key default true,
  allow_receptionist_manual_points boolean not null default false,
  constraint app_settings_singleton check (id)
);

insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;

create policy app_settings_select on public.app_settings
  for select using (is_staff());

create policy app_settings_update on public.app_settings
  for update using (is_owner()) with check (is_owner());

-- No INSERT/DELETE policy: singleton row is seeded by this migration only.

-- Down migration (rollback):
-- drop policy app_settings_update on public.app_settings;
-- drop policy app_settings_select on public.app_settings;
-- drop table public.app_settings;
