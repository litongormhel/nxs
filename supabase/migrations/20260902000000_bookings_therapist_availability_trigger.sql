-- Reject INSERT/UPDATE of a booking's therapist/date/time when the
-- assigned therapist is on Day Off, Absent, or On Leave for that date.
-- Scoped to the same column set as trg_bookings_set_computed_fields so a
-- bare status transition (Complete/Cancel/No-show) on a pre-existing
-- booking is never re-validated -- only an actual therapist/date/time
-- change triggers the check. Applies to every write path on bookings
-- (New Booking, Quick Walk-in, Change/Reassign Therapist) since it is a
-- table-level trigger, not per-caller.

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

  return new;
end;
$function$;

create trigger trg_bookings_check_therapist_availability
  before insert or update of therapist_id, booking_date, start_time on public.bookings
  for each row execute function public.check_therapist_availability();
