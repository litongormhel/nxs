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
- RLS (`ohm#3f7n9c1k`, Staff Auth 6C-3, 2026-08-29): `staff_select`/
  `staff_insert`/`staff_update` all `is_staff()`-gated, replacing the
  original `public_select`/`public_insert` pair. No role restriction on
  any status transition, including Cancel — confirmed with the user
  (unlike Sales Void, which is Owner-only). **Real gap closed**: there was
  previously no UPDATE policy at all, so `updateBookingStatus()` had been
  silently affecting 0 rows under RLS since it was wired — this migration
  is what makes status transitions actually enforce and work end-to-end.
  No DELETE policy — bookings are never hard-deleted.

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

**Correction, `ohm#4t7w1p9k` (2026-08-27)** — connects `LogVisitModal` and wires `Log Visit`, `No-show`, and `Cancel` action buttons on the Bookings Tab.

- `app/bookings/page.tsx` — server component, real (was an 8-line stub).
  Fetches clients (`id, codename, username`), active services, non-archived
  therapists, active rooms, active staff, active promos, active addons, and lockers; renders `BookingBrowser`.
- `components/booking-browser.tsx` — client component. Date picker plus a
  live day-view list of active-status bookings for that date (client-side
  Supabase query, re-run on date change or after a create). "New Booking"
  and "Quick Walk-in" buttons open the respective modals. Booking item rows
  render with full HTML mockup parity (`br-time` on left, client + room + squad pill
  and service/therapist in middle, uppercase status chip on right, and action buttons).
  Clicking `Log Visit` opens `LogVisitModal` pre-linked to the booking; clicking `No-show`
  or `Cancel` calls `updateBookingStatus` server action and immediately reloads.
- `components/log-visit-modal.tsx` — **Log Visit** modal with full HTML mockup parity
  (`#modalScrim` and screenshot):
  - Find Booking search with live suggestions of open bookings (`Booked` / `Needs Reassignment`)
    and `Linked: [Name] · Room [X]` badge.
  - Date of Visit & Therapist dropdown (therapist disabled for Wet Area).
  - Assign Locker dropdown (shows free lockers).
  - Availed Service dropdown (services + points preview, plus `Redeem: Combi Massage Reward (−100 pts)`).
  - Cash upgrade section for redemptions (`Upgraded with cash top-up`).
  - Manual discount box (`Manual discount (e.g. Senior or PWD)` with Percentage / Fixed ₱).
  - Add-ons checklist (+₱50 Towel, etc.).
  - Auto-calculated read-only Added Points and Amount Paid (₱).
  - Payment Method select (Cash, GCash, Card, Points) and Promo Code dropdown.
- `app/bookings/actions.ts` — `logVisitBooking` server action handles complete visit logging
  (marks booking `Completed`, inserts `sales`, `sale_addons`, `point_transactions`, `locker_occupancy`,
  and `action_logs` in one atomic flow); `updateBookingStatus` handles status transitions.
- `components/booking-form-modal.tsx` — **New Booking** form (updated to full
  HTML mockup parity):
  - Client selector dropdown (`<select id="bClient">`) with `— Walk-in / No account —`
    at the top plus registered clients. When `__walkin__` is selected, reveals the
    `Client Name (walk-in / no account)` free-text input field (`guest_label`).
  - Service select (drives duration). When "Wet Area" is selected, therapist, promo,
    time slot grid, custom time toggle, and room assignment fields are cleanly hidden.
  - Therapist select (2-column row alongside Service).
  - Promo dropdown (massage services only), supporting Squad Goals derivation (`squad3`→3,
    `squad4`→4) and displaying the non-blocking amber weekday warning banner.
  - Date input with past date validation check ("Cannot book a date in the past.").
  - Interactive Time Slot Grid (`SLOT_START_TIMES` from `lib/bookings/slots.ts`)
    with taken/conflicting slots struck through (`line-through opacity-50 cursor-not-allowed`)
    and gold active selection state.
  - "Use a custom time instead" checkbox toggle with time input and live therapist/room
    availability summary text.
  - Room & Assignment mode dropdowns (`Auto (recommended)` vs `Manual`), where Auto
    automatically assigns the first free room from live conflict calculations.
  - Placeholder staff picker (`// TEMP: placeholder actor pending Staff Auth phase`)
    for audit tracking (`created_by`).
  - Triggers SMS preview modal for registered clients upon creation; walk-ins complete directly.
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
  **New Booking** (now allows nullable `therapistId` and `roomNumber` for
  services like Wet Area and passes `promo_id`/`pax_count`), and
  (`ohm#8r3n6y1q`) `quickWalkin(input)` server action for **Quick Walk-in**
  that calls the `public.quick_walkin(...)` RPC. Both parse Postgres
  `23P01` (exclusion violation) into a specific "that room/therapist is
  already booked" message the same way; `quickWalkin` additionally parses
  `23505` (unique violation) into a locker- or room-occupancy conflict
  message. Any other error passes through the raw Postgres message. Both
  revalidate `/bookings` and `/dashboard` on success.

**Correction, `ohm#7k2m9xq4` (2026-08-29)** — adds a Change Therapist
action for reassigning an existing booking's therapist without touching
room/locker.

- Available whenever `status` is `Booked`, `No-show`, or
  `Needs Reassignment` (i.e. not `Completed`/`Cancelled`).
- `app/(staff)/bookings/actions.ts` — new `changeBookingTherapist(bookingId,
  newTherapistId, staffId)`. Re-fetches the booking, rejects
  `Completed`/`Cancelled` and a no-op reassignment to the same therapist,
  then `UPDATE bookings SET therapist_id = ...` only (room/locker
  untouched). Parses `23P01` (exclusion violation) into the same "that
  therapist is already booked" message used by `createBooking`/
  `quickWalkin`. On success, writes one `action_logs` row (`action:
  "change_therapist"`, `detail` with booking id/date/time and old→new
  therapist name). Revalidates `/bookings`, `/dashboard`, `/call-sheet`.
- **No schema change** — the `no_double_book_therapist`/
  `no_double_book_room` GiST exclusion constraints are plain Postgres
  `EXCLUDE` constraints (not trigger-based like the Points Ledger), so
  Postgres already enforces them on UPDATE as well as INSERT. Confirmed
  directly against the migration before implementing, not assumed.
- **Scoping nuance**: the constraints' `WHERE` clause only covers status
  `Booked`/`Completed`/`Needs Reassignment` — a `No-show` row falls
  outside that predicate, so a therapist swap on a `No-show` booking is
  not conflict-checked by the DB. Matches the constraints' existing
  designed scope; not a gap.
- `components/booking-browser.tsx` — the day-view `ACTIVE_STATUSES` fetch
  filter now also includes `No-show` (previously excluded from the list
  entirely, along with `Cancelled` which remains excluded). New "Change
  Therapist" button on `Booked`/`No-show` rows; the pre-existing but
  previously-unwired `Reassign` button stub on `Needs Reassignment` rows
  is now wired to the same confirm modal (therapist `<select>` pre-filled
  to the current therapist, inline conflict-error slot). Staff
  attribution via `useStaffSim().sessionStaff` — no placeholder actor.
- No changes to Points Ledger or Sales — confirmed no code path in this
  change writes to `point_transactions` or `sales`.

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

- Calendar/week view — day-list only for now.
- Companion tagging for Squad Goals — still explicitly out of scope per
  [[clients_state]] (no schema for it beyond the `pax_count` headcount
  field, now derived from the selected promo rather than a manual
  stepper).
- `app/call-sheet/page.tsx` is still an 8-line "Coming soon." stub, though
  it will likely consume `bookings` + `therapists` once built.
- `completeWalkinBooking()` ("Complete Walk-in Visit" — converting an
  existing `Booked` booking into a paid walk-in checkout) is not built.
  Explicitly excluded from `ohm#8r3n6y1q`'s scope. The `bookings` UPDATE
  policy it would have needed now exists (`staff_update`, `is_staff()`,
  added `ohm#3f7n9c1k`) — the remaining gap is purely that the feature
  itself was never written, not an RLS blocker.
- The `pax_count` column and its original RLS policies (Bookings phase)
  still predate version-controlled migrations — the baseline snapshot
  (`20260827130641_baseline_snapshot.sql`) captures them retroactively,
  but no dedicated migration file exists for that specific change. Only
  this correction's own additions (`20260827133448_quick_walkin_promo_rls.sql`)
  are natively version-controlled from creation.
