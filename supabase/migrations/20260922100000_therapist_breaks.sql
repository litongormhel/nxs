-- Therapist Break Time Slot Management (ohm#9c4e2b7a)
-- Enables scheduling daily/recurring break time slots per therapist per shift date
-- and enforces database-level gating so bookings cannot be scheduled on break slots.

create table if not exists public.therapist_breaks (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  break_date date not null,
  slot_time text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff(id),
  constraint therapist_breaks_unique_slot unique (therapist_id, break_date, slot_time)
);

-- Enable Row Level Security
alter table public.therapist_breaks enable row level security;

-- Policies: all staff can view break slots; staff can insert and remove breaks
create policy "staff_select" on public.therapist_breaks
  for select using (is_staff());

create policy "staff_insert" on public.therapist_breaks
  for insert with check (is_staff());

create policy "staff_delete" on public.therapist_breaks
  for delete using (is_staff());

-- Update check_therapist_availability() to also guard against break slots
create or replace function public.check_therapist_availability()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_weekday smallint;
begin
  if new.therapist_id is null then
    return new;
  end if;

  if exists (
    select 1 from therapist_absence
    where therapist_id = new.therapist_id and absent_date = new.booking_date
  ) then
    raise exception 'THERAPIST_UNAVAILABLE: Absent';
  end if;

  if exists (
    select 1 from therapist_leave
    where therapist_id = new.therapist_id
      and new.booking_date between start_date and end_date
  ) then
    raise exception 'THERAPIST_UNAVAILABLE: On Leave';
  end if;

  v_weekday := extract(dow from new.booking_date);
  if exists (
    select 1 from therapist_day_off
    where therapist_id = new.therapist_id and weekday = v_weekday
  ) then
    raise exception 'THERAPIST_UNAVAILABLE: Day Off';
  end if;

  if exists (
    select 1 from therapist_breaks
    where therapist_id = new.therapist_id
      and break_date = new.booking_date
      and slot_time = substring(new.start_time from 1 for 5)
  ) then
    raise exception 'THERAPIST_UNAVAILABLE: Break';
  end if;

  return new;
end;
$function$;
