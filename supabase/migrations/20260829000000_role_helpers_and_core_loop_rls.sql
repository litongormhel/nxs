-- Staff Auth 6C-2: role helper functions + Core Loop RLS (clients, point_transactions, sales)
-- Replaces the narrow-additive USING(true)/WITH CHECK(true) policies on these three tables
-- with real role checks derived from auth.uid() -> staff.user_id -> staff.position.

-- 1. Role helper functions (foundational, reused by 6C-3 through 6C-5)

create or replace function public.current_staff_position()
returns public.staff_position
language sql
stable
security definer
set search_path = public
as $$
  select s.position
  from public.staff s
  where s.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select public.current_staff_position() is not null;
$$;

create or replace function public.is_supervisor_or_above()
returns boolean
language sql
stable
as $$
  select public.current_staff_position() in ('Supervisor', 'Owner');
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select public.current_staff_position() = 'Owner';
$$;

-- 2. clients

drop policy if exists public_select on public.clients;

create policy staff_select on public.clients
  for select
  using (public.is_staff());

create policy staff_insert on public.clients
  for insert
  with check (public.is_staff());

-- No UPDATE policy: points_balance is ledger-trigger-only (SECURITY DEFINER
-- apply_points_delta()), and no other client field has an editable path in
-- the app. No DELETE policy.

-- 3. point_transactions

drop policy if exists public_select on public.point_transactions;
drop policy if exists public_insert on public.point_transactions;

create policy staff_select on public.point_transactions
  for select
  using (public.is_staff());

create policy staff_insert on public.point_transactions
  for insert
  with check (public.is_staff());

-- No UPDATE/DELETE policy: trg_block_ledger_update / trg_block_ledger_delete
-- already reject those outright at the trigger level.

-- 4. sales

drop policy if exists public_select on public.sales;
drop policy if exists public_insert on public.sales;
drop policy if exists public_update on public.sales;

create policy staff_select on public.sales
  for select
  using (public.is_staff());

create policy staff_insert on public.sales
  for insert
  with check (public.is_staff());

-- Baseline UPDATE floor: Supervisor or Owner may edit a sale at all.
create policy staff_update on public.sales
  for update
  using (public.is_supervisor_or_above())
  with check (public.is_supervisor_or_above());

-- Void-specific restriction: only Owner may flip `voided`. RLS WITH CHECK
-- can't diff NEW against OLD, so this is enforced by a trigger layered on
-- top of the RLS floor above.
create or replace function public.block_void_by_non_owner()
returns trigger
language plpgsql
as $$
begin
  if new.voided is distinct from old.voided and not public.is_owner() then
    raise exception 'Only Owner may void or unvoid a sale';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_void_by_non_owner on public.sales;

create trigger trg_block_void_by_non_owner
  before update on public.sales
  for each row
  execute function public.block_void_by_non_owner();

-- No DELETE policy: sales are never hard-deleted, only voided.
