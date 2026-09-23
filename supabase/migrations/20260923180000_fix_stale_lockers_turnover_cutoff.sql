-- Fix Premature Locker Auto-Checkout Cutoff and Secure Auto-Cancel Cron Execution (ohm#6c1f4e9a)

-- 1. Update public.auto_checkout_stale_lockers()
-- Aligns cutoff to 8:00 AM turnover and prevents premature checkouts of guests checked in 4:30 PM - 11:59 PM
create or replace function public.auto_checkout_stale_lockers()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_now_ph timestamp;
  v_time_ph time;
  v_date_ph date;
  v_cutoff_ts timestamptz;
  v_staff_id uuid;
  v_rec record;
  v_checked_out_ids uuid[] := array[]::uuid[];
  v_count integer := 0;
begin
  -- 1. Compute current time in Asia/Manila timezone
  v_now_ph := now() at time zone 'Asia/Manila';
  v_date_ph := v_now_ph::date;
  v_time_ph := v_now_ph::time;

  -- 2. Determine target cutoff timestamp aligned to yesterday's 08:00 AM turnover
  v_cutoff_ts := ((v_date_ph - 1) + time '08:00:00') at time zone 'Asia/Manila';

  -- 3. Determine fallback staff_id for checked_out_by
  select id into v_staff_id
  from public.staff
  where position in ('Owner', 'Supervisor')
    and archived_at is null
  order by created_at asc
  limit 1;

  if v_staff_id is null then
    select id into v_staff_id
    from public.staff
    order by created_at asc
    limit 1;
  end if;

  -- 4. Find and auto check-out stale locker occupancies where checked_in_at occurred
  -- before yesterday's 08:00 AM PHT turnover (or guest has exceeded 18+ hours without checkout)
  for v_rec in
    select id, locker_number, client_id, guest_label, checked_in_at
    from public.locker_occupancy
    where checked_out_at is null
      and (checked_in_at < v_cutoff_ts or checked_in_at < (now() - interval '18 hours'))
  loop
    update public.locker_occupancy
    set checked_out_at = now(),
        checked_out_by = v_staff_id
    where id = v_rec.id;

    v_checked_out_ids := array_append(v_checked_out_ids, v_rec.id);
    v_count := v_count + 1;

    insert into public.action_logs (staff_id, action, detail)
    values (
      v_staff_id,
      'auto_checkout_stale_locker',
      'occupancy_id=' || v_rec.id || ' locker=' || v_rec.locker_number || ' client=' || coalesce(v_rec.client_id::text, v_rec.guest_label, 'unknown') || ' reason=Auto checked-out past 8:00 AM turnover cutoff'
    );
  end loop;

  return jsonb_build_object(
    'cutoff_ts', v_cutoff_ts,
    'cutoff_date', (v_cutoff_ts at time zone 'Asia/Manila')::date,
    'checked_out_count', v_count,
    'checked_out_ids', to_jsonb(v_checked_out_ids)
  );
end;
$$;

revoke execute on function public.auto_checkout_stale_lockers() from public, anon;
grant execute on function public.auto_checkout_stale_lockers() to authenticated, service_role;


-- 2. Update public.auto_cancel_lapsed_bookings()
-- Declare explicit search_path and secure RPC permissions
create or replace function public.auto_cancel_lapsed_bookings()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
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

revoke execute on function public.auto_cancel_lapsed_bookings() from public, anon;
grant execute on function public.auto_cancel_lapsed_bookings() to service_role, authenticated;
