-- Normalize Prime Scrub Massage service and therapist skills (ohm#7d3b9e1a)
--
-- 1. Ensure active 'Prime Scrub Massage' exists in services table with active = true
-- 2. Deactivate any duplicate or legacy scrub catalog records ('Scrub', 'Scrub + Massage')
-- 3. Migrate therapist_services rows to 'Prime Scrub Massage'
-- 4. Ensure therapists offering scrub (Akio, Clark, Dan, Josh, Leo, Ron, Xander, Marco) are mapped
-- 5. Update foreign keys in bookings, sales, and locker_occupancy

do $$
declare
  v_prime_scrub_id uuid;
  v_old_scrub_ids uuid[];
begin
  -- Resolve or normalize 'Prime Scrub Massage'
  select id into v_prime_scrub_id
  from public.services
  where name = 'Prime Scrub Massage'
  limit 1;

  if v_prime_scrub_id is null then
    select id into v_prime_scrub_id
    from public.services
    where name in ('Scrub + Massage', 'Scrub')
    order by price desc
    limit 1;

    if v_prime_scrub_id is not null then
      update public.services
      set name = 'Prime Scrub Massage', active = true, duration_minutes = 80
      where id = v_prime_scrub_id;
    else
      insert into public.services (name, price, points_earned, duration_minutes, active, requires_therapist)
      values ('Prime Scrub Massage', 1800, 12, 80, true, true)
      returning id into v_prime_scrub_id;
    end if;
  else
    update public.services
    set active = true, duration_minutes = 80, requires_therapist = true
    where id = v_prime_scrub_id;
  end if;

  -- Collect any legacy scrub IDs
  select coalesce(array_agg(id), array[]::uuid[]) into v_old_scrub_ids
  from public.services
  where id <> v_prime_scrub_id
    and (name in ('Scrub', 'Scrub + Massage') or lower(name) like '%scrub%');

  -- Deactivate legacy scrub services
  if array_length(v_old_scrub_ids, 1) > 0 then
    update public.services
    set active = false
    where id = any(v_old_scrub_ids);

    -- Migrate existing therapist_services referencing old scrub IDs to prime scrub
    insert into public.therapist_services (therapist_id, service_id)
    select distinct therapist_id, v_prime_scrub_id
    from public.therapist_services
    where service_id = any(v_old_scrub_ids)
    on conflict (therapist_id, service_id) do nothing;

    delete from public.therapist_services
    where service_id = any(v_old_scrub_ids);

    -- Update historical references so FKs point to prime scrub
    update public.bookings
    set service_id = v_prime_scrub_id
    where service_id = any(v_old_scrub_ids);

    update public.sales
    set service_id = v_prime_scrub_id
    where service_id = any(v_old_scrub_ids);

    update public.locker_occupancy
    set service_id = v_prime_scrub_id
    where service_id = any(v_old_scrub_ids);
  end if;

  -- Ensure all scrub-qualified therapists (Akio, Clark, Dan, Josh, Leo, Ron, Xander, Marco) offer Prime Scrub Massage
  insert into public.therapist_services (therapist_id, service_id)
  select t.id, v_prime_scrub_id
  from public.therapists t
  where t.name in ('Akio', 'Clark', 'Dan', 'Josh', 'Leo', 'Ron', 'Xander', 'Marco')
  on conflict (therapist_id, service_id) do nothing;

end $$;
