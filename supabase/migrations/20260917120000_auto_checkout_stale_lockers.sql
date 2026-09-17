-- Auto-checkout stale unclosed locker occupancies past 2:00 AM cutoff (ohm#lckstalesync)

create or replace function public.auto_checkout_stale_lockers()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now_ph timestamp;
  v_time_ph time;
  v_date_ph date;
  v_cutoff_date date;
  v_staff_id uuid;
  v_rec record;
  v_checked_out_ids uuid[] := array[]::uuid[];
  v_count integer := 0;
begin
  -- 1. Compute current time in Asia/Manila timezone
  v_now_ph := now() at time zone 'Asia/Manila';
  v_date_ph := v_now_ph::date;
  v_time_ph := v_now_ph::time;

  -- 2. Determine target cutoff spa date
  -- If time is >= 02:00 AM Manila time, cutoff date is yesterday (v_date_ph - 1).
  -- If time is < 02:00 AM Manila time, cutoff date is 2 days ago (v_date_ph - 2).
  if v_time_ph >= '02:00:00'::time then
    v_cutoff_date := v_date_ph - 1;
  else
    v_cutoff_date := v_date_ph - 2;
  end if;

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

  -- 4. Find and auto check-out stale locker occupancies whose check-in date is on/before cutoff date
  for v_rec in
    select id, locker_number, client_id, guest_label, checked_in_at
    from public.locker_occupancy
    where checked_out_at is null
      and ((checked_in_at at time zone 'Asia/Manila')::date) <= v_cutoff_date
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
      'occupancy_id=' || v_rec.id || ' locker=' || v_rec.locker_number || ' client=' || coalesce(v_rec.client_id::text, v_rec.guest_label, 'unknown') || ' reason=Auto checked-out past 2:00 AM cutoff'
    );
  end loop;

  return jsonb_build_object(
    'cutoff_date', v_cutoff_date,
    'checked_out_count', v_count,
    'checked_out_ids', to_jsonb(v_checked_out_ids)
  );
end;
$$;

-- Run auto-checkout for existing stale rows (e.g. JM #9 and ohm #18)
select public.auto_checkout_stale_lockers();

-- Explicit cleanup for JM (#9) and ohm (#18) if any active rows remain
update public.locker_occupancy
set checked_out_at = now(),
    checked_out_by = (select id from public.staff order by created_at asc limit 1)
where checked_out_at is null
  and locker_number in (9, 18);

-- Backfill missing locker_occupancy row for Nanon (#8) if a Completed booking exists without occupancy
insert into public.locker_occupancy (locker_number, client_id, guest_label, service_id, checked_in_by, booking_id, checked_in_at)
select
  8 as locker_number,
  b.client_id,
  b.guest_label,
  b.service_id,
  (select id from public.staff where archived_at is null order by created_at asc limit 1) as checked_in_by,
  b.id as booking_id,
  now() as checked_in_at
from public.bookings b
left join public.clients c on b.client_id = c.id
where b.status = 'Completed'
  and (c.codename ilike '%Nanon%' or b.guest_label ilike '%Nanon%')
  and not exists (
    select 1 from public.locker_occupancy lo where lo.booking_id = b.id or (b.client_id is not null and lo.client_id = b.client_id and lo.checked_out_at is null)
  );
