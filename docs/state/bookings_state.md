# Bookings — Current State

## Implemented (DB level)

`public.bookings`:
- Columns include `client_id` (nullable), `guest_label` (nullable — check
  constraint requires one of `client_id`/`guest_label`), `service_id`,
  `therapist_id`, `room_number`, `booking_date`, `start_time`, `start_ts`/
  `end_ts` (computed), `duration_minutes`, `status` (enum: `Booked`,
  `Completed`, `No-show`, `Cancelled`, `Needs Reassignment`), `group_id`,
  `promo_id`, `created_by`, and `pax_count` (nullable smallint, check
  `IN (3,4)` — added in the Bookings phase, `ohm#9k4p7w2z`, for Squad Goals
  headcount; nullable/additive, verified via a rolled-back transaction
  before applying).
- Trigger `trg_bookings_set_computed_fields` (BEFORE INSERT/UPDATE OF
  `service_id`, `booking_date`, `start_time`) reads `services.duration_minutes`
  for the selected service, then sets `start_ts = booking_date + start_time`
  and `end_ts = start_ts + duration_minutes` — confirmed directly from the
  live function body, not assumed.
- Two GiST exclusion constraints prevent overlapping bookings for the same
  room or same therapist while status is `Booked`/`Completed`/
  `Needs Reassignment`: `no_double_book_room`, `no_double_book_therapist`.
  Confirmed live and unchanged by this phase.
- RLS: `public_select` (SELECT, `USING (true)`) and `public_insert`
  (INSERT, `WITH CHECK (true)`) added this phase, same shape as Core Loop's
  policies on other tables. **No UPDATE/DELETE policy** — status
  transitions (Booked→Completed/No-show/Cancelled) have no write path from
  the anon client yet; deliberately not built this phase (would need a new
  UPDATE policy, flagged rather than opened ad hoc).

`public.promos`, `public.addons`, `public.locker_occupancy`, `public.sale_addons`
(correction, `ohm#8r3n6y1q`):
- `promos` and `addons` gained a narrow `anon` SELECT policy (`USING (true)`)
  — previously RLS-enabled with zero policies (default-deny), so nothing
  could read them despite `promos` already holding seeded rows (`Squad
  Goals 3pax`/`4pax` at −₱150/−₱200, plus Early Bird, Birthmonth, AMBA).
- `locker_occupancy` gained SELECT (to compute free lockers/rooms) and
  INSERT `anon` policies. `sale_addons` gained an INSERT `anon` policy.
  Both were previously default-deny.
- New function `public.quick_walkin(...)` — atomic write for the Quick
  Walk-in flow, modeled directly on `public.log_visit()`'s pattern (not
  `SECURITY DEFINER`; reachable via the anon INSERT policies above plus
  the pre-existing ones on `bookings`/`sales`/`point_transactions`/
  `action_logs`). In one transaction: inserts `bookings` (status
  `Completed`), `sales`, optional `sale_addons` rows, an optional
  `point_transactions` EARN entry (only when `p_client_id` is not null —
  guests get no ledger entry), a `locker_occupancy` row, and an
  `action_logs` row. Still goes through the same GiST exclusion
  constraints as `createBooking` — confirmed via smoke test that a
  conflicting therapist/room still raises `23P01`.
- Migration: `supabase/migrations/20260827133448_quick_walkin_promo_rls.sql`.
- `bookings.pax_count` and its check constraint (`IN (3,4)`) are
  **unchanged** — Squad Goals pax is now derived app-side from the
  selected promo's label at insert time rather than a schema change.

## Implemented (app level)

**Correction, `ohm#8r3n6y1q` (2026-08-27)** — reverses part of the
Bookings phase's (`ohm#9k4p7w2z`) original Squad Goals/Quick Walk-in
scope below; not a new feature.

- `app/bookings/page.tsx` — server component, real (was an 8-line stub).
  Fetches clients (`id, codename, username`), active services, non-archived
  therapists, active rooms, and active staff; renders `BookingBrowser`.
- `components/booking-browser.tsx` — client component. Date picker plus a
  live day-view list of active-status bookings for that date (client-side
  Supabase query, re-run on date change or after a create). "New Booking"
  and "Quick Walk-in" buttons open the two modals below.
- `components/booking-form-modal.tsx` — **New Booking** form: client
  search/select (registered clients only — same inline filter pattern as
  Client Profile, not a shared component), service select (drives
  duration), date, hourly slot picker (`lib/bookings/slots.ts` —
  `SLOT_START_TIMES`, confirmed with the user: open 4:30 PM, hourly grid,
  last call 1:00 AM as the final, shorter slot), therapist/room selects
  that grey out (native `disabled` option, labeled "(booked)") any
  resource whose existing active booking on that date overlaps the
  selected slot + service duration — a UX layer only, not the source of
  truth. **(Corrected, `ohm#8r3n6y1q`)** Squad Goals is no longer a
  standalone checkbox/pax-stepper — it's selected via a Promo dropdown
  (`Squad Goals 3pax`/`4pax`, plus the other active promos), hidden for
  "Wet Area" (mirrors the mockup's massage-only promo visibility; no
  `category`/`requires_therapist` column exists on `services`, so this is
  a name check same as the therapist-conflict logic elsewhere). Selecting
  a Squad Goals promo derives `pax_count` (3 or 4) at submit time — no
  separate UI control, no schema change. A non-blocking amber warning
  banner still shows when a Squad Goals promo is selected on a weekday
  (same behavior as before, re-keyed off the promo instead of the
  checkbox). Placeholder staff picker (`// TEMP: placeholder actor pending
  Staff Auth phase`) sets `created_by`, same pattern as Core Loop.
- `components/quick-walkin-modal.tsx` — **(Rebuilt, `ohm#8r3n6y1q`) Quick
  Walk-in**: full mockup parity, scoped to the mockup's `openQuickWalkin()`
  flow only (instant, one-step, no pre-existing booking) —
  `completeWalkinBooking()` ("Complete Walk-in Visit," converting an
  existing `Booked` row) was explicitly excluded, confirmed with the user,
  since it depends on the booking-status-transition `UPDATE` path the
  Bookings phase deliberately left unopened. Fields: client search with a
  guest-name fallback in one modal (not a two-toggle split), service
  select, conditional therapist + room (hidden for Wet Area — auto-suggests
  free rooms from a live same-day conflict query, same `slotsOverlap`
  logic as New Booking), time-slot grid + "use a custom time instead"
  toggle (reuses `lib/bookings/slots.ts`, not duplicated), locker
  assignment (required — computed from `locker_occupancy` rows with
  `checked_out_at is null`), promo (mutually exclusive with manual
  discount — selecting one disables the other, matching the mockup),
  manual discount (percentage or fixed ₱), add-ons (multi-select),
  auto-computed read-only Amount Paid, Payment Method (Cash/GCash), and a
  GCash reference field shown only for GCash. Always books "today"
  (no date picker, matching the mockup). On confirm, calls the new
  `quickWalkin()` server action → `public.quick_walkin(...)` RPC (see DB
  section above) — a single atomic write that still goes through the same
  GiST exclusion constraints as New Booking, so a walk-in still can't
  silently double-book a room or therapist. Placeholder staff picker, same
  pattern as elsewhere.
- `components/sms-preview-modal.tsx` — shown after a successful New
  Booking for a registered client (`client_id` not null). Editable
  textarea pre-filled with **placeholder** copy (no locked SMS format
  existed anywhere in this repo — confirmed with the user rather than
  invented) using the service's non-discounted `price`. No SMS gateway is
  wired into this repo — this is a compose/preview + copy-to-clipboard
  step only, not a real send.
- `app/bookings/actions.ts` — `createBooking(input)` server action for
  **New Booking** (now also passes `promo_id` through, see correction
  above), and (`ohm#8r3n6y1q`) a separate `quickWalkin(input)` server
  action for **Quick Walk-in** that calls the `public.quick_walkin(...)`
  RPC. Both parse Postgres `23P01` (exclusion violation) into a specific
  "that room/therapist is already booked" message the same way;
  `quickWalkin` additionally parses `23505` (unique violation) into a
  locker- or room-occupancy conflict message. Any other error passes
  through the raw Postgres message. Both revalidate `/bookings` and
  `/dashboard` on success.

## Known simplifications (not gaps — deliberate for this phase's scope)

- Therapist options are not filtered by `therapist_services` (which
  therapists are qualified for which service) — every non-archived
  therapist is offered regardless of service. No existing code in this
  repo does this filtering either.
- The New Booking conflict-greying query re-fetches on every date change
  inside the modal (its own Supabase call), independent of the day list in
  `booking-browser.tsx` — two separate client-side queries by design, kept
  simple rather than threading shared state between them.

## Not yet implemented — see roadmap

- Status-change UI (Booked→Completed/No-show/Cancelled) — blocked on an
  `anon` UPDATE policy for `bookings` that was intentionally not opened
  this phase.
- Calendar/week view — day-list only for now.
- Companion tagging for Squad Goals — still explicitly out of scope per
  [[clients_state]] (no schema for it beyond the `pax_count` headcount
  field, now derived from the selected promo rather than a manual
  stepper).
- `app/call-sheet/page.tsx` is still an 8-line "Coming soon." stub, though
  it will likely consume `bookings` + `therapists` once built.
- `completeWalkinBooking()` ("Complete Walk-in Visit" — converting an
  existing `Booked` booking into a paid walk-in checkout) is not built.
  Explicitly excluded from `ohm#8r3n6y1q`'s scope, confirmed with the
  user: it needs the same `anon` UPDATE policy on `bookings` that
  status-change UI needs (still not opened, see above).
- The `pax_count` column and its original RLS policies (Bookings phase)
  still predate version-controlled migrations — the baseline snapshot
  (`20260827130641_baseline_snapshot.sql`) captures them retroactively,
  but no dedicated migration file exists for that specific change. Only
  this correction's own additions (`20260827133448_quick_walkin_promo_rls.sql`)
  are natively version-controlled from creation.
