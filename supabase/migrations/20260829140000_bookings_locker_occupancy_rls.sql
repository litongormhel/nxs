-- Staff Auth 6C-3: bookings + locker_occupancy RLS
-- Replaces the narrow-additive USING(true)/WITH CHECK(true) policies on these two tables
-- with real role checks, reusing 6C-2's role helpers (is_staff()). No new helpers.
-- All staff (any tier) may perform every operation here, including Cancel -- no
-- Supervisor/Owner restriction on bookings status transitions (unlike Sales Void).

-- 1. bookings

drop policy if exists public_select on public.bookings;
drop policy if exists public_insert on public.bookings;

create policy staff_select on public.bookings
  for select
  using (public.is_staff());

create policy staff_insert on public.bookings
  for insert
  with check (public.is_staff());

-- New: status transitions (Booked -> Completed/No-show/Cancelled) previously had
-- no UPDATE policy at all (default-deny), so updateBookingStatus() silently
-- affected 0 rows under RLS. Open to any staff tier -- confirmed with the user,
-- no role restriction on Cancel or any other transition.
create policy staff_update on public.bookings
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- No DELETE policy: bookings are never hard-deleted.

-- 2. locker_occupancy

drop policy if exists public_select on public.locker_occupancy;
drop policy if exists public_insert on public.locker_occupancy;
drop policy if exists public_update on public.locker_occupancy;

create policy staff_select on public.locker_occupancy
  for select
  using (public.is_staff());

create policy staff_insert on public.locker_occupancy
  for insert
  with check (public.is_staff());

-- Check-Out (sets checked_out_at/checked_out_by) -- any staff tier, Front Desk included.
create policy staff_update on public.locker_occupancy
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- No DELETE policy: occupancy rows are never hard-deleted (historical record).
