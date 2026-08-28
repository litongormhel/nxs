-- Operations Phase: Locker Board, Call Sheet, Sales (ohm#9h4c7x2m)
--
-- locker_occupancy gains UPDATE so Check-Out can set checked_out_at/
-- checked_out_by (INSERT/SELECT already existed from Bookings phase).
--
-- sales gains SELECT (was insert-only, nothing read it before this) and
-- UPDATE (for Edit/Void — never a hard DELETE, matching ADR-001 "Sales are
-- mutable; Supervisor can edit, Owner-only can void, never hard delete").
--
-- Same additive shape as every prior policy in this repo: role `public`,
-- USING(true)/WITH CHECK(true). The DB-level gate stays open; the actual
-- Supervisor/Owner restriction is enforced only in app code via the
-- existing Simulate Staff selection (lib/staff-context.tsx) — same
-- explicitly accepted gap as every other phase, pending real Staff Auth.

create policy public_update on public.locker_occupancy
  for update to public using (true) with check (true);

create policy public_select on public.sales
  for select to public using (true);

create policy public_update on public.sales
  for update to public using (true) with check (true);
