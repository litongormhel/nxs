-- Past Walk-in Visit Claims Table and Policies
-- Allows receptionists to request linking unlinked past walk-in visits to members,
-- subject to Owner / Supervisor review, audit trail, and points credit.

create table if not exists public.visit_claims (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade unique,
  target_client_id uuid not null references public.clients(id) on delete cascade,
  requested_by_staff_id uuid not null references public.staff(id),
  reviewed_by_staff_id uuid references public.staff(id),
  points_to_credit integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.visit_claims enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'visit_claims' and policyname = 'visit_claims_staff_select') then
    create policy visit_claims_staff_select on public.visit_claims for select using (is_staff());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'visit_claims' and policyname = 'visit_claims_staff_insert') then
    create policy visit_claims_staff_insert on public.visit_claims for insert with check (is_staff());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'visit_claims' and policyname = 'visit_claims_supervisor_update') then
    create policy visit_claims_supervisor_update on public.visit_claims for update using (is_supervisor_or_above()) with check (is_supervisor_or_above());
  end if;
end $$;

notify pgrst, 'reload schema';
