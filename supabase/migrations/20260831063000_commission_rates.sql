-- Commission Module 1/2: schema (ohm#4k8t2wq9).
--
-- services.requires_therapist: no existing field/relationship structurally
-- distinguished "requires a therapist" vs "facility/room-only" services
-- (verified against baseline_snapshot.sql before writing this migration —
-- bookings.therapist_id is nullable, but that's a per-booking runtime fact,
-- not a queryable service-level property). Wet Area was previously
-- distinguished only by a hardcoded name string match in the booking form
-- and Call Sheet — this column replaces that need for the commission
-- module without changing either of those (out of scope for this prompt).
alter table public.services
  add column requires_therapist boolean not null default true;

update public.services
  set requires_therapist = false
  where name = 'Wet Area';

-- commission_rates: effective-dated, append-only (same philosophy as
-- point_transactions — editing a rate closes the current row via
-- effective_to/is_active and inserts a new one; never update percent
-- in place).
create table public.commission_rates (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  percent numeric not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now()
);

alter table public.commission_rates enable row level security;

-- Owner-only feature end to end: no Supervisor/Front Desk read or write.
create policy "owner_select" on public.commission_rates
  for select using (public.is_owner());

create policy "owner_insert" on public.commission_rates
  for insert with check (public.is_owner());

-- Update is restricted to closing a rate out (effective_to/is_active) via
-- the app's setCommissionRate action, gated the same way; no policy allows
-- changing percent in place.
create policy "owner_update" on public.commission_rates
  for update using (public.is_owner()) with check (public.is_owner());
