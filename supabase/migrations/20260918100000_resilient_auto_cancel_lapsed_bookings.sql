-- Resilient Auto-cancel lapsed unvisited bookings past 2:00 AM cutoff (ohm#fixautocancelsweepandlogs)

-- 1. Ensure action_logs.staff_id allows NULL for system attribution
alter table public.action_logs alter column staff_id drop not null;

-- 2. Update procedure
create or replace function public.auto_cancel_lapsed_bookings()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now_ph timestamp;
  v_time_ph time;
  v_date_ph date;
  v_cutoff_date date;
  v_rec record;
  v_cancelled_ids uuid[] := array[]::uuid[];
  v_count integer := 0;
begin
  -- 1. Compute current time in Asia/Manila timezone
  v_now_ph := now() at time zone 'Asia/Manila';
  v_date_ph := v_now_ph::date;
  v_time_ph := v_now_ph::time;

  -- 2. Determine target cutoff spa date
  -- If time is >= 02:00 AM Manila time, the cutoff date is yesterday (v_date_ph - 1).
  -- If time is < 02:00 AM Manila time, the cutoff date is 2 days ago (v_date_ph - 2).
  if v_time_ph >= '02:00:00'::time then
    v_cutoff_date := v_date_ph - 1;
  else
    v_cutoff_date := v_date_ph - 2;
  end if;

  -- 3. Find and auto-cancel lapsed bookings
  for v_rec in
    select id, booking_date, start_time, created_by
    from public.bookings
    where booking_date <= v_cutoff_date
      and status in ('Booked', 'Needs Reassignment')
    order by booking_date asc, start_time asc
  loop
    -- Update booking status to Cancelled
    update public.bookings
    set status = 'Cancelled'
    where id = v_rec.id;

    v_cancelled_ids := array_append(v_cancelled_ids, v_rec.id);
    v_count := v_count + 1;

    -- Record action log attributed to System (staff_id = NULL)
    insert into public.action_logs (staff_id, action, detail)
    values (
      null,
      'auto_cancel_lapsed_booking',
      'booking_id=' || v_rec.id || ' date=' || v_rec.booking_date || ' reason=Auto-cancelled by system'
    );
  end loop;

  return jsonb_build_object(
    'cutoff_date', v_cutoff_date,
    'cancelled_count', v_count,
    'cancelled_ids', to_jsonb(v_cancelled_ids)
  );
end;
$$;
