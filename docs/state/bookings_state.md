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

**Correction, `ohm#8p4t2vk6` (2026-08-29)** — extends the Change action to
also update `start_time`, renames labels to "Change", and adds live
therapist availability greying.

- **Rename**: "Change Therapist" button (on `Booked`/`No-show` rows) and
  shared modal title both renamed to "Change". The "Reassign" button on
  `Needs Reassignment` rows is unchanged.
- **Time field**: modal now contains a `Start Time` input above the
  therapist select, pre-filled with the booking's current `start_time`.
  Changing the time clears the therapist selection and triggers a live
  re-query.
- **Current therapist excluded**: the therapist currently assigned to the
  booking is removed from the dropdown entirely (not just default-selected).
  Server action already rejected a no-op reassignment; the exclusion is
  additive defense-in-depth UX.
- **Live availability greying**: a `useEffect` debounced at 300 ms fires
  on every time change (and on modal open) — fetches all same-date bookings
  with status `Booked`/`Completed`/`Needs Reassignment` excluding the
  booking being changed, then uses `slotsOverlap()` (from
  `lib/bookings/slots.ts`) client-side to determine which therapists
  conflict. Conflicting therapists are disabled and labelled "— Unavailable"
  in the select. A "Checking availability…" hint shows while the query is
  in flight. Room availability is **not** checked here — explicitly out of
  scope per task instructions.
- **Server action extended** (`changeBookingTherapist`): now accepts a
  fourth parameter `newStartTime: string`. Writes `start_time` to the
  `bookings` row alongside `therapist_id`; `trg_bookings_set_computed_fields`
  fires on UPDATE and recomputes `start_ts`/`end_ts` automatically, so
  `no_double_book_therapist` GiST constraint enforces on the new time window.
  23P01 error path unchanged. **No migration required.**
- **Conditional activity logging**: the action now logs only what changed —
  `old_therapist → new_therapist` if therapist changed, `old_time →
  new_time` if time changed, or both if both changed. A no-op (neither
  changed) is rejected early. Action name in `action_logs` stays
  `"change_therapist"`.
- `No-show` conflict scope caveat (existing, unchanged): `No-show` is
  outside the GiST constraint's `WHERE` predicate, so a time/therapist
  change on a `No-show` booking is not DB-conflict-checked. The UI
  availability query is a best-effort hint regardless; the constraint's
  existing designed scope is unchanged.

**Correction, `ohm#7q2x9m4k` (2026-08-29)** — restructures the Bookings tab
into 3 tabs (Upcoming / Check-in / Check-out), replacing the single flat
list + status pill.

- `locker_occupancy` gained `booking_id uuid references bookings(id)`
  (nullable, no backfill — `supabase/migrations/20260829180000_locker_occupancy_booking_id.sql`).
  Populated by both write paths into `locker_occupancy`: the
  `quick_walkin()` RPC (updated in the same migration) and
  `logVisitBooking()`'s linked-booking branch
  (`app/(staff)/bookings/actions.ts`).
- Tab membership is **derived, not stored** — no new value on the
  `booking_status` enum:
  - Upcoming: `status IN (Booked, Needs Reassignment, No-show)`.
  - Check-in: `status = Completed AND locker_occupancy.checked_out_at IS NULL`
    (joined via `booking_id`).
  - Check-out: `status = Completed AND locker_occupancy.checked_out_at IS NOT NULL`.
- `components/booking-browser.tsx`'s day-view query now embeds
  `locker_occupancy(checked_in_at, checked_out_at, locker_number)` on the
  `bookings` select. Sort within each tab is spa-day-aware, reusing
  `compareSlotTimes()` from `lib/bookings/slots.ts` (minutes-since-4PM
  open, not raw timestamp) rather than a new helper.
- Per-tab columns: Upcoming (Massage Time/Client/Service/Room/Therapist/
  Action), Check-in (+ Check-in Time/Locker #), Check-out (+ Check-out
  Time). The Date column and per-row status pill were removed (redundant
  with the date picker and tab membership). Wet Area rows still render
  "—" for Room/Therapist across all 3 tabs — unchanged behavior, since
  Wet Area bookings do get a `locker_occupancy` row.
- No RLS change — `locker_occupancy`'s existing `staff_select`/
  `staff_insert`/`staff_update` policies are unconditional `is_staff()`
  gates, already covering the new column.
- No change to the GiST exclusion constraints or
  `trg_bookings_set_computed_fields`.

**Correction, `ohm#3f8q1w6z` (2026-08-30)** — Dashboard reassignment trigger
adds a Transfer action for `Needs Reassignment` bookings from the
Dashboard (see [[dashboard_state]]), and fixes a gap found while building it.

- **Gap fixed in `changeBookingTherapist()`**: the UPDATE now also sets
  `status: 'Booked'` when the booking's current status is
  `Needs Reassignment`. Previously the function only wrote
  `therapist_id`/`start_time` — a `Needs Reassignment` row never actually
  resolved back to `Booked` on a successful reassignment, which silently
  affected the Bookings tab's pre-existing `ohm#7k2m9xq4` "Reassign"
  button too (same shared function). One shared fix resolves both.
- No new parameter, no change to the `23P01` exclusion-violation handling
  — the GiST constraints are unchanged and unweakened.
- No changes to Points Ledger, Sales, or Locker Board.

**Correction, `ohm#68b329da` (2026-08-30)** — Mobile/Tablet Responsive Pass
for the New Booking form and Quick Walk-in flow. UI/layout only, no
backend/DB/business-logic change.

- `components/booking-form-modal.tsx` and `components/quick-walkin-modal.tsx`:
  modal card padding, previously-fixed 2-column field rows (Service/
  Therapist, Discount Type/Value, Amount/Payment), and the Quick Walk-in
  time-slot grid (`grid-cols-4` → `grid-cols-3 sm:grid-cols-4`, matching
  the pattern `booking-form-modal.tsx` already used) now collapse to a
  single column / smaller grid below the `sm:` breakpoint. Interactive
  rows (time-slot buttons, client-search suggestions, add-on checkboxes)
  gained a `min-h-[44px]` mobile-only touch target. The bottom Cancel/
  Save action row is `sticky bottom-0` on mobile (`sm:static` on desktop)
  so it stays reachable without scrolling to the end of the form.
- Conflict/error display: the same `23P01`/`23505` error string already
  produced by `createBooking`/`quickWalkin` (unchanged) is now shown at
  `text-sm` on mobile (`sm:text-xs` on desktop, matching prior size) and
  auto-scrolls into view via a `ref` + `useEffect` when it appears, so a
  double-booking conflict can't silently render off-screen on a small
  viewport.
- No dedicated Room/Therapist selector component exists in this repo —
  the "grid-like UI" in this task's scope was the inline time-slot button
  grid inside both modal files, addressed above.
- Desktop behavior/layout is unchanged — every mobile class has a
  corresponding `sm:` reset to the prior desktop value. No changes to
  `components/booking-browser.tsx`, `app/(staff)/bookings/actions.ts`, or
  any Supabase/migration/exclusion-constraint state.

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
