-- Migration: Add notes column to public.bookings
-- Created: 2026-09-21
-- Description: Adds nullable notes text column to public.bookings for session notes / vehicle & parking info (ohm#4a7b1c3e)

alter table public.bookings
  add column if not exists notes text;

-- Drop previous quick_walkin overload if exists and recreate with p_notes parameter
drop function if exists public.quick_walkin(uuid, text, uuid, uuid, integer, date, time, integer, uuid, text, numeric, uuid[], numeric, text, text, uuid, integer);

create or replace function public.quick_walkin(
  p_client_id uuid,
  p_guest_label text,
  p_service_id uuid,
  p_therapist_id uuid,
  p_room_number integer,
  p_booking_date date,
  p_start_time time,
  p_locker_number integer,
  p_promo_id uuid,
  p_manual_discount_type text,
  p_manual_discount_value numeric,
  p_addon_ids uuid[],
  p_amount numeric,
  p_payment_method text,
  p_payment_ref text,
  p_staff_id uuid,
  p_points_earned integer default null,
  p_notes text default null
)
returns table(booking_id uuid, sale_id uuid, ledger_id uuid)
language plpgsql
set search_path to ''
as $function$
declare
  v_booking_id uuid;
  v_sale_id uuid;
  v_ledger_id uuid;
  v_service_name text;
  v_addon_id uuid;
  v_addon_price numeric;
  v_existing_occ_id uuid;
begin
  select name into v_service_name
  from public.services where id = p_service_id;

  if v_service_name is null then
    raise exception 'Service not found: %', p_service_id;
  end if;

  v_booking_id := gen_random_uuid();
  insert into public.bookings
    (id, client_id, guest_label, service_id, therapist_id, room_number,
     promo_id, booking_date, start_time, status, created_by, notes)
  values (
    v_booking_id, p_client_id, p_guest_label, p_service_id, p_therapist_id,
    p_room_number, p_promo_id, p_booking_date, p_start_time, 'Completed', p_staff_id, p_notes
  );

  v_sale_id := gen_random_uuid();
  insert into public.sales
    (id, client_id, guest_label, booking_id, service_id, therapist_id, amount,
     payment_method, payment_ref, promo_id, manual_discount_type,
     manual_discount_value, processed_by)
  values (
    v_sale_id, p_client_id, p_guest_label, v_booking_id, p_service_id,
    p_therapist_id, p_amount, p_payment_method, p_payment_ref, p_promo_id,
    p_manual_discount_type, p_manual_discount_value, p_staff_id
  );

  if p_addon_ids is not null then
    foreach v_addon_id in array p_addon_ids loop
      select price into v_addon_price from public.addons where id = v_addon_id;
      if v_addon_price is not null then
        insert into public.sale_addons (sale_id, addon_id, price_at_sale)
        values (v_sale_id, v_addon_id, v_addon_price);
      end if;
    end loop;
  end if;

  if p_client_id is not null and p_points_earned is not null then
    v_ledger_id := gen_random_uuid();
    insert into public.point_transactions
      (id, client_id, booking_id, sale_id, points_delta, entry_type, source, processed_by, notes)
    values (
      v_ledger_id, p_client_id, v_booking_id, v_sale_id, p_points_earned,
      'EARN', 'STAFF_MANUAL', p_staff_id, 'Visit: ' || v_service_name
    );
  end if;

  -- Reuse existing active locker occupancy row if one is open for this client / walk-in on the requested locker
  select id into v_existing_occ_id
  from public.locker_occupancy
  where checked_out_at is null
    and locker_number = p_locker_number
    and (
      (p_client_id is not null and client_id = p_client_id)
      or (p_client_id is null and p_guest_label is not null and lower(guest_label) = lower(p_guest_label))
    )
  limit 1;

  if v_existing_occ_id is not null then
    update public.locker_occupancy
    set room_number = p_room_number,
        service_id = p_service_id,
        checked_in_by = p_staff_id,
        booking_id = v_booking_id
    where id = v_existing_occ_id;
  else
    insert into public.locker_occupancy
      (locker_number, client_id, guest_label, room_number, service_id, checked_in_by, booking_id)
    values (
      p_locker_number, p_client_id, p_guest_label, p_room_number, p_service_id, p_staff_id, v_booking_id
    );
  end if;

  insert into public.action_logs (staff_id, action, detail)
  values (
    p_staff_id,
    'quick_walkin',
    format('client=%s guest=%s service=%s amount=%s sale_id=%s booking_id=%s points_awarded=%s notes=%s',
      p_client_id, p_guest_label, v_service_name, p_amount, v_sale_id, v_booking_id,
      case when p_client_id is null then 'n/a'
           when p_points_earned is null then 'NONE:formula_not_configured'
           else p_points_earned::text end,
      coalesce(p_notes, 'none'))
  );

  return query select v_booking_id, v_sale_id, v_ledger_id;
end;
$function$;

-- Reload schema cache
notify pgrst, 'reload schema';
