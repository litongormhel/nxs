-- ============================================================================
-- BASELINE SNAPSHOT — retroactive migration (ohm#2m6x9j5f)
-- ============================================================================
-- This file is a SNAPSHOT of the live Supabase schema (project
-- zqwiqrvqyinacjozubtc) as pulled directly from the database on 2026-08-27.
-- It is NOT a migration to run against that project — everything here is
-- already applied live, having accumulated across migrations 01-12 plus the
-- Core Loop and Bookings phases (see .ai/briefing.md, .ai/handoff.md).
--
-- DO NOT run this against the live project. It exists so:
--   1. `supabase db diff` / `db pull` (once this project is CLI-linked) has a
--      true starting point to diff against, instead of nothing.
--   2. A fresh environment could be provisioned from scratch if ever needed.
--
-- Going forward, every DB-layer change ships as its own migration file in
-- supabase/migrations/, committed in the same commit as the app code that
-- depends on it — see docs/architecture/workflow.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "btree_gist" with schema extensions;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type public.staff_position as enum ('Receptionist', 'Attendant', 'Supervisor', 'Owner', 'Others');
create type public.booking_status as enum ('Booked', 'Completed', 'No-show', 'Cancelled', 'Needs Reassignment');
create type public.ledger_entry_type as enum ('EARN', 'REDEEM', 'ADJUSTMENT');
create type public.ledger_source as enum ('STAFF_MANUAL', 'QR_SCAN', 'ADJUSTMENT');

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  "position" public.staff_position not null,
  comment text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  codename text not null,
  password_hash text,
  phone text,
  email text,
  birth_month smallint check (birth_month >= 1 and birth_month <= 12),
  birth_day smallint check (birth_day >= 1 and birth_day <= 31),
  member_code text not null unique,
  investor boolean not null default false,
  since_date date not null default current_date,
  privacy_consent boolean not null default false,
  qr_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  points_balance integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric not null,
  points_earned integer not null default 0,
  duration_minutes integer not null default 90,
  active boolean not null default true
);

create table public.promos (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  discount numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null,
  active boolean not null default true
);

create table public.therapists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false,
  archived_reason text,
  archived_by uuid references public.staff(id),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.therapist_services (
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (therapist_id, service_id)
);

create table public.therapist_day_off (
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  primary key (therapist_id, weekday)
);

create table public.therapist_leave (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.therapist_absence (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  absent_date date not null,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  unique (therapist_id, absent_date)
);

create table public.rooms (
  number integer primary key,
  active boolean not null default true
);

create table public.lockers (
  number integer primary key,
  active boolean not null default true
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  guest_label text,
  service_id uuid not null references public.services(id),
  therapist_id uuid references public.therapists(id),
  room_number integer references public.rooms(number),
  promo_id uuid references public.promos(id),
  booking_date date not null,
  start_time time not null,
  status public.booking_status not null default 'Booked',
  group_id uuid,
  duration_minutes integer,
  start_ts timestamp,
  end_ts timestamp,
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  pax_count smallint check (pax_count is null or pax_count = any (array[3, 4])),
  check (client_id is not null or guest_label is not null)
);

create table public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  booking_id uuid references public.bookings(id),
  sale_id uuid,
  entry_type public.ledger_entry_type not null,
  points_delta integer not null,
  source public.ledger_source not null,
  processed_by uuid not null references public.staff(id),
  notes text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  check (entry_type <> 'ADJUSTMENT' or notes is not null)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  guest_label text,
  booking_id uuid references public.bookings(id),
  service_id uuid not null references public.services(id),
  therapist_id uuid references public.therapists(id),
  amount numeric not null default 0,
  payment_method text not null check (payment_method = any (array['Cash', 'GCash', 'Card', 'Points'])),
  payment_ref text,
  promo_id uuid references public.promos(id),
  manual_discount_type text check (manual_discount_type = any (array['pct', 'fixed'])),
  manual_discount_value numeric,
  voided boolean not null default false,
  voided_by uuid references public.staff(id),
  voided_at timestamptz,
  edited_by uuid references public.staff(id),
  edited_at timestamptz,
  processed_by uuid not null references public.staff(id),
  created_at timestamptz not null default now(),
  check (client_id is not null or guest_label is not null)
);

alter table public.point_transactions
  add constraint fk_point_transactions_sale foreign key (sale_id) references public.sales(id);

create table public.sale_addons (
  sale_id uuid not null references public.sales(id) on delete cascade,
  addon_id uuid not null references public.addons(id),
  price_at_sale numeric not null,
  primary key (sale_id, addon_id)
);

create table public.locker_occupancy (
  id uuid primary key default gen_random_uuid(),
  locker_number integer not null references public.lockers(number),
  client_id uuid references public.clients(id),
  guest_label text,
  room_number integer references public.rooms(number),
  service_id uuid references public.services(id),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  checked_in_by uuid references public.staff(id),
  checked_out_by uuid references public.staff(id)
);

create unique index one_active_occupant_per_locker on public.locker_occupancy (locker_number) where (checked_out_at is null);
create unique index one_active_occupant_per_room on public.locker_occupancy (room_number) where (checked_out_at is null and room_number is not null);

create table public.action_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Bookings: GiST exclusion constraints (no-double-booking, DB-enforced)
-- ----------------------------------------------------------------------------

alter table public.bookings
  add constraint no_double_book_room
  exclude using gist (room_number with =, tsrange(start_ts, end_ts) with &&)
  where (status = any (array['Booked'::public.booking_status, 'Completed'::public.booking_status, 'Needs Reassignment'::public.booking_status]) and room_number is not null);

alter table public.bookings
  add constraint no_double_book_therapist
  exclude using gist (therapist_id with =, tsrange(start_ts, end_ts) with &&)
  where (status = any (array['Booked'::public.booking_status, 'Completed'::public.booking_status, 'Needs Reassignment'::public.booking_status]) and therapist_id is not null);

-- ----------------------------------------------------------------------------
-- View
-- ----------------------------------------------------------------------------

create view public.loginable_staff as
select id, user_id, name, "position", comment, active, created_at
from public.staff
where "position" = any (array['Receptionist'::public.staff_position, 'Supervisor'::public.staff_position, 'Owner'::public.staff_position])
  and active;

-- ----------------------------------------------------------------------------
-- Functions
-- ----------------------------------------------------------------------------

create or replace function public.block_ledger_mutation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
    raise exception 'point_transactions is append-only. Insert a new ADJUSTMENT row instead of updating/deleting id %', old.id;
end;
$function$;

create or replace function public.apply_points_delta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
    update clients set points_balance = points_balance + new.points_delta where id = new.client_id;
    return new;
end;
$function$;

create or replace function public.bookings_set_computed_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
    select duration_minutes into new.duration_minutes from services where id = new.service_id;
    new.start_ts := (new.booking_date + new.start_time)::timestamp;
    new.end_ts := new.start_ts + make_interval(mins => coalesce(new.duration_minutes, 0));
    return new;
end;
$function$;

create or replace function public.log_visit(
  p_client_id uuid,
  p_service_id uuid,
  p_staff_id uuid,
  p_is_redemption boolean,
  p_payment_method text,
  p_amount numeric,
  p_payment_ref text default null
)
returns table(ledger_id uuid, sale_id uuid)
language plpgsql
set search_path to ''
as $function$
declare
  v_points_earned int;
  v_service_name text;
  v_points_delta int;
  v_entry_type public.ledger_entry_type;
  v_balance int;
  v_sale_id uuid;
  v_ledger_id uuid;
begin
  select points_earned, name into v_points_earned, v_service_name
  from public.services where id = p_service_id;

  if v_service_name is null then
    raise exception 'Service not found: %', p_service_id;
  end if;

  if p_is_redemption then
    select points_balance into v_balance from public.clients where id = p_client_id;
    if v_balance is null then
      raise exception 'Client not found: %', p_client_id;
    end if;
    if v_balance < 100 then
      raise exception 'Insufficient points balance for redemption (has %, needs 100)', v_balance;
    end if;
    v_points_delta := -100;
    v_entry_type := 'REDEEM';
  else
    v_points_delta := v_points_earned;
    v_entry_type := 'EARN';
  end if;

  if p_amount > 0 then
    v_sale_id := gen_random_uuid();
    insert into public.sales (id, client_id, service_id, amount, payment_method, processed_by, payment_ref)
    values (v_sale_id, p_client_id, p_service_id, p_amount, p_payment_method, p_staff_id, p_payment_ref);
  end if;

  v_ledger_id := gen_random_uuid();
  insert into public.point_transactions
    (id, client_id, points_delta, entry_type, source, processed_by, sale_id, notes)
  values (
    v_ledger_id,
    p_client_id,
    v_points_delta,
    v_entry_type,
    'STAFF_MANUAL',
    p_staff_id,
    v_sale_id,
    case when p_is_redemption
      then 'Redemption: ' || v_service_name
      else 'Visit: ' || v_service_name
    end
  );

  insert into public.action_logs (staff_id, action, detail)
  values (
    p_staff_id,
    'log_visit',
    format('client=%s service=%s redemption=%s amount=%s sale_id=%s',
      p_client_id, v_service_name, p_is_redemption, p_amount, v_sale_id)
  );

  return query select v_ledger_id, v_sale_id;
end;
$function$;

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

create trigger trg_block_ledger_update
  before update on public.point_transactions
  for each row execute function public.block_ledger_mutation();

create trigger trg_block_ledger_delete
  before delete on public.point_transactions
  for each row execute function public.block_ledger_mutation();

create trigger trg_apply_points_delta
  after insert on public.point_transactions
  for each row execute function public.apply_points_delta();

create trigger trg_bookings_set_computed_fields
  before insert or update on public.bookings
  for each row execute function public.bookings_set_computed_fields();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.staff enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.promos enable row level security;
alter table public.addons enable row level security;
alter table public.therapists enable row level security;
alter table public.therapist_services enable row level security;
alter table public.therapist_day_off enable row level security;
alter table public.therapist_leave enable row level security;
alter table public.therapist_absence enable row level security;
alter table public.rooms enable row level security;
alter table public.lockers enable row level security;
alter table public.bookings enable row level security;
alter table public.point_transactions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_addons enable row level security;
alter table public.locker_occupancy enable row level security;
alter table public.action_logs enable row level security;

-- Pre-existing public SELECT policies (catalog/roster/capacity tables)
create policy public_select on public.lockers for select using (true);
create policy public_select on public.rooms for select using (true);
create policy public_select on public.services for select using (true);
create policy public_select on public.therapists for select using (true);

-- Core Loop additive policies (ohm#7f3k9d2m) — narrow, scoped to exactly
-- what Core Loop's read/write paths needed. clients/staff/point_transactions
-- SELECT, point_transactions/sales/action_logs INSERT.
create policy public_select on public.clients for select using (true);
create policy public_select on public.staff for select using (true);
create policy public_select on public.point_transactions for select using (true);
create policy public_insert on public.point_transactions for insert with check (true);
create policy public_insert on public.sales for insert with check (true);
create policy public_insert on public.action_logs for insert with check (true);

-- Bookings phase additive policies (ohm#9k4p7w2z) — SELECT/INSERT only, no
-- UPDATE/DELETE (status transitions intentionally out of scope).
create policy public_select on public.bookings for select using (true);
create policy public_insert on public.bookings for insert with check (true);

-- Every other table (promos, addons, sale_addons, locker_occupancy, the
-- therapist_* auxiliary tables) has RLS enabled with NO policies — default
-- deny for anon/authenticated. This is intentional, not an oversight.
