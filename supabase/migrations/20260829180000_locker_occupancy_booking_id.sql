-- Bookings Tab 3-Tab Restructure (ohm#7q2x9m4k)
-- Additive only: nullable FK linking locker_occupancy back to the booking
-- that produced it, so Check-in/Check-out tab membership can be derived by
-- joining bookings <-> locker_occupancy instead of adding a new status
-- enum value. No backfill, no NOT NULL, no change to bookings.status, no
-- change to the no_double_book_room/no_double_book_therapist GiST
-- exclusion constraints, no change to trg_bookings_set_computed_fields.

alter table public.locker_occupancy
  add column booking_id uuid references public.bookings(id);

-- ----------------------------------------------------------------------------
-- Function: public.quick_walkin(...) — unchanged signature/behavior, only the
-- locker_occupancy insert now also populates booking_id (v_booking_id is
-- already in scope). Quick Walk-in is one of the two write paths into
-- locker_occupancy (the other is logVisitBooking() in
-- app/(staff)/bookings/actions.ts, updated app-side in the same phase), so
-- both must populate booking_id for Check-in/Check-out tabs to see walk-ins.
-- ----------------------------------------------------------------------------

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
  p_staff_id uuid
)
returns table(booking_id uuid, sale_id uuid, ledger_id uuid)
language plpgsql
set search_path to ''
as $function$
declare
  v_booking_id uuid;
  v_sale_id uuid;
  v_ledger_id uuid;
  v_points_earned int;
  v_service_name text;
  v_addon_id uuid;
  v_addon_price numeric;
begin
  select points_earned, name into v_points_earned, v_service_name
  from public.services where id = p_service_id;

  if v_service_name is null then
    raise exception 'Service not found: %', p_service_id;
  end if;

  v_booking_id := gen_random_uuid();
  insert into public.bookings
    (id, client_id, guest_label, service_id, therapist_id, room_number,
     promo_id, booking_date, start_time, status, created_by)
  values (
    v_booking_id, p_client_id, p_guest_label, p_service_id, p_therapist_id,
    p_room_number, p_promo_id, p_booking_date, p_start_time, 'Completed', p_staff_id
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

  if p_client_id is not null then
    v_ledger_id := gen_random_uuid();
    insert into public.point_transactions
      (id, client_id, booking_id, sale_id, points_delta, entry_type, source, processed_by, notes)
    values (
      v_ledger_id, p_client_id, v_booking_id, v_sale_id, v_points_earned,
      'EARN', 'STAFF_MANUAL', p_staff_id, 'Visit: ' || v_service_name
    );
  end if;

  insert into public.locker_occupancy
    (locker_number, client_id, guest_label, room_number, service_id, checked_in_by, booking_id)
  values (
    p_locker_number, p_client_id, p_guest_label, p_room_number, p_service_id, p_staff_id, v_booking_id
  );

  insert into public.action_logs (staff_id, action, detail)
  values (
    p_staff_id,
    'quick_walkin',
    format('client=%s guest=%s service=%s amount=%s sale_id=%s booking_id=%s',
      p_client_id, p_guest_label, v_service_name, p_amount, v_sale_id, v_booking_id)
  );

  return query select v_booking_id, v_sale_id, v_ledger_id;
end;
$function$;
