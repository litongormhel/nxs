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
  Both were previously default-deny. **`sale_addons`'s policy was later
  tightened to `is_staff()` — see below.**
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
- **RLS tightened (`ohm#7n4c1wp6`, 2026-09-01)**: `sale_addons.public_insert`
  (`with_check=true`, role `public`) was replaced with `staff_insert`
  (`with_check=is_staff()`) — audit `ohm#9k3v7bx2` Medium #3 found any
  anon-key holder could insert arbitrary `sale_addons` rows via public REST,
  independent of `quick_walkin()`. Confirmed live via `pg_proc` that
  `quick_walkin()` is `SECURITY INVOKER` (not `DEFINER`, matching the
  original note above) — but its only caller
  (`app/(staff)/bookings/actions.ts` `quickWalkin()`) always runs through
  the cookie-based authenticated Supabase client, so the function's
  internal `sale_addons` insert runs as the real staff caller and passes
  `is_staff()`. Verified end-to-end under an impersonated staff role
  (`quick_walkin()` succeeds, `sale_addons` row inserted) and that a direct
  anon insert into `sale_addons` now raises `42501`. Same audit's Medium #6
  also revoked `EXECUTE` on the trigger-only `apply_points_delta()` from
  `public, anon, authenticated` (trigger firing on `point_transactions`
  INSERT is unaffected — verified). Migration:
  `supabase/migrations/20260901230000_sale_addons_staff_insert_and_points_delta_grants.sql`.
- `bookings.pax_count` and its check constraint (`IN (3,4)`) are
  **unchanged** — Squad Goals pax is now derived app-side from the
  selected promo's label at insert time rather than a schema change.

**Correction, `ohm#4t7w1p9k` (2026-08-27)** — connects `LogVisitModal` and wires `Log Visit`, `No-show`, and `Cancel` action buttons on the Bookings Tab.

- `app/bookings/page.tsx` — server component, real (was an 8-line stub).
  Fetches clients (`id, codename, username`), active services, non-archived
  therapists, active rooms (`active = true`, fallback 1 to 18), active staff, active promos, active addons, and lockers; renders `BookingBrowser`.
- **Dynamic Room Capacity (18) Sourcing & Server Action Guard (`ohm#roomcapdynamic`, 2026-09-17)**:
  - **Frontend Dynamic Sourcing (`app/(staff)/bookings/page.tsx`, `components/booking-browser.tsx`, `components/booking-form-modal.tsx`, `components/quick-walkin-modal.tsx`)**: Queries active rooms from Supabase `rooms` table (`active = true`). Computes `effectiveRooms` with fallback defaulting strictly to 18 (1 to 18) when room queries are empty or loading, replacing hardcoded 20-room arrays. Dynamic room capacity feeds room availability calculations and option dropdown mappings across `New Booking`, `Quick Walkin`, and `Edit Booking` modals.
  - **Backend Server Action Guard (`app/(staff)/bookings/actions.ts`)**: Added `getMaxRoomCapacity(supabase)` helper returning count of active rooms (defaulting to 18). Enforces validation guard in `createBooking`, `quickWalkin`, and `editBooking` server actions to reject any assigned `room_number` exceeding configured room capacity (or `< 1`).
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
  - Client state initializer (`clientId`) respects `initialBooking.client_id` even when `null` for walk-in guest bookings (`ohm#7f3k2m9p`, 2026-09-16).
  - Walk-in account linking (`ohm#3k7yqxpz`, 2026-09-16): when `clientId` is null, displays collapsible "Link to Client Account" search box (searching `clients` prop by codename or username) and "Scan QR" button (nested `<ScanMemberQrModal>` overlay at `z-[60]`). Displays "Unlink account (back to walk-in)" text button when `isGuestOrigin && clientId !== null`.
  - Added Points field (`ohm#3k7yqxpz`, 2026-09-16): renders disabled text input showing `"N/A — no account linked"` when `!clientId`, numeric `pointsDelta` when `clientId` is set.
  - Find Booking search with live suggestions of open bookings (`Booked` / `Needs Reassignment`)
    and `Linked: [Name] · Room [X]` badge.
  - Date of Visit & Therapist field: read-only display (shows the
    therapist already assigned on the linked booking, via
    `bookings.therapist_id`) when a booking is linked via Find Booking
    search; editable dropdown for walk-ins (no linked booking); disabled/
    exempted for Wet Area in both cases (`ohm#7n4k9wx3`, 2026-09-02).
  - Assign Locker dropdown (`ohm#logvstconflict`, 2026-09-17): queries active `locker_occupancy` (`checked_out_at IS NULL`) with `booking_id` and `client_id`; renders occupied lockers as `Locker X - Unavailable` (`disabled={true}`, `text-stone-500`), while auto-selecting and enabling pre-assigned lockers for the active booking/client as `Locker X (Assigned)`.
  - Restricted Payment Methods & Split Payment Controls (`ohm#spltpaylog`, 2026-09-17): payment dropdown restricted to `Cash`, `GCash`, and `Split (Cash + GCash)`. Renders side-by-side Cash and GCash amount inputs with smart auto-balancing and validation equality check.
  - Pre-Confirmation Summary Dialog (`ohm#logvstsummary`, 2026-09-17): Two-step submission flow. Clicking primary "Confirm" button validates form fields and opens `showSummary = true` receipt summary view displaying Client Codename, Therapist, Massage Time, Locker number, Room number, Service Availed (with upgrade & add-ons), and Total Payment with breakdown. Action buttons feature "Back / Edit" (returns to form with state intact) and "Finalize Check-in" (Gold primary button triggering `logVisitBooking` server action with `isPending` loading spinner).
  - Field order (`ohm#7f3k2m9p`, 2026-09-16): Availed Service → Upgrade Box (conditional) → Manual Discount → **Promo Code** (standalone dropdown) → **Add-ons** checklist → Points & Amount Paid (2-column auto-calc grid) → **Payment Method** (standalone dropdown) → GCash Ref (conditional) → Staff attribution.
- `app/bookings/actions.ts` — `logVisitBooking` server action handles complete visit logging
  (marks booking `Completed`, inserts `sales`, `sale_addons`, `point_transactions`, `locker_occupancy`,
  and `action_logs` in one atomic flow). Updates existing active `locker_occupancy` (`checked_out_at IS NULL`) matching `input.bookingId` if present, preventing false positive self-collisions on room/locker availability checks (`ohm#logvstconflict`, 2026-09-17); `updateBookingStatus` handles status transitions.
- `components/booking-form-modal.tsx` — **New Booking** form (updated to full
  HTML mockup parity):
  - **Searchable Combobox Client Selector (`components/client-combobox.tsx`, `components/booking-form-modal.tsx`, `ohm#newbookingclientcombobox`, 2026-09-17)**: Replaced native `<select id="bClient">` dropdown with a typeahead combobox. Filters active members only (`is_archived !== true && archived_at == null && is_active !== false`). Defaults to `No Account` (`"— Walk-in / No account —"`). Dynamically searches members by codename, handle (`@username`), or member code (`#member_code`). Includes clear button `✕`, persistent top option `— Walk-in / No account —`, dark theme styling matching modal inputs (`bg-background border-border focus:border-gold`), and full keyboard navigation (ArrowUp/ArrowDown, Enter, Esc, click outside). When `__walkin__` is selected, reveals the `Client Name (walk-in / no account)` free-text input field (`guest_label`).
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
  pattern as elsewhere. **(`ohm#9x4k2wr7`, 2026-09-02) Time Slot grid now
  has `takenSlots` parity with New Booking**: selecting a Therapist greys
  out (disables, struck-through) their already-conflicting slots in the
  grid itself, ported logic-for-logic from `booking-form-modal.tsx`'s
  `takenSlots` useMemo — not just the reverse direction
  (`takenTherapists`, selected time → taken therapists in the dropdown),
  which already existed beforehand.  both directions now coexist, matching New Booking's dual `takenSlots` + `conflictingTherapists` pattern.
  - **(`ohm#j4m8v2xq`, 2026-09-17) Therapist Availability Dropdown & Status Suffixes**:
    `QuickWalkinModal` now fetches `therapist_day_off`, `therapist_absence`, and `therapist_leave` for the active date (`todayIso()`). Therapist options format as `{t.name}{unavailableReason ? ` - ${unavailableReason}` : fullyBooked ? " - Fully Booked" : conflictNow ? " (booked)" : ""}` (e.g. `Akio - Day Off`, `Josh - On Leave`, `Name - Absent`), with `disabled={disabled}` and styled with `text-stone-500`. Extended `canSubmit` check to include `!unavailableTherapists.has(therapistId)`. Server action `quickWalkin` catches DB trigger `trg_bookings_check_therapist_availability` exception `THERAPIST_UNAVAILABLE` via `therapistUnavailableError` returning a friendly error `{ ok: false, field: "therapist", error: "That therapist is <Reason> on the selected date." }`.
  - **(`ohm#quickwalkindropdownsplit`, 2026-09-17) Integrated Dropdown Option "Split (Cash + GCash)"**:
    `QuickWalkinModal` aligned Split Payment UI to dropdown option `Split (Cash + GCash)` directly in main Payment Method select, replacing the standalone checkbox toggle. Renders side-by-side `Cash Amount (₱)` and `GCash Amount (₱)` inputs with auto-balancing and validation feedback badge (`Cash Amount + GCash Amount === Total Amount`). `quickWalkin` action in `app/(staff)/bookings/actions.ts` receives `isSplitPayment: true`, `splitCashAmount`, and `splitGcashAmount`, preserving backend split sales ledger logic intact.
  - **(`ohm#quickwalkinpaymethods`, 2026-09-17) Restrict Payment Method Dropdown Options & Remove Logged by Staff**:
    `QuickWalkinModal` removed `Card` and `Maya` options from the Payment Method dropdown, strictly restricting options to `Cash`, `GCash`, and `Split (Cash + GCash)`. Updated reference number input label span to `(optional — GCash)`. Removed the redundant visible "Logged by (staff)" field from the UI while preserving staff attribution in backend actions via `useStaffSim()`.
  - **(`ohm#quickwalkinlockerdisabledstate`, 2026-09-18) Keep Occupied Lockers as Disabled Options**:
    `QuickWalkinModal` updated locker options mapping to render all lockers without filtering occupied ones out. Occupied lockers are rendered with `disabled` attribute and text `Locker {n} — Occupied` with `text-muted` styling. Default option formatted as `— select locker —`. Added validation in `canSubmit` and `handleSubmit` ensuring selected locker is strictly unoccupied.
- `components/sms-preview-modal.tsx` — shown after a successful New
  Booking for a registered client (`client_id` not null). Editable
  textarea pre-filled with the active customized SMS template from Settings
  (or default official Nexus Spa copy: `DEFAULT_SMS_TEMPLATE` from
  `lib/bookings/sms.ts`, `ohm#4f8e1b2d`) interpolated dynamically with
  `{booking_date}`, `{client_name}`, `{slot_time}`, `{therapist_name}`,
  `{service_name}`, and `{amount}`. No SMS gateway is wired into this
  repo — this is a compose/preview + copy-to-clipboard step only, not a
  real send. Staff retain full textarea editability before copying.
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
- **Server action extended** (`changeBookingTherapist`, updated `ohm#alignreassignmentslotsandselection`, 2026-09-18):
  accepts optional fourth parameter `newStartTime?: string`. Writes `start_time`
  to the `bookings` row alongside `therapist_id` if changed; `trg_bookings_set_computed_fields`
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

**Correction, `ohm#j4m8v2xq` (2026-09-02)** — Status-aware therapist
dropdown + DB-level availability gate on `bookings`, fixing a bug where a
Day-Off therapist (Leo) could be saved from New Booking.

- **New DB trigger, authoritative gate**: `check_therapist_availability()`
  (`supabase/migrations/20260902000000_bookings_therapist_availability_trigger.sql`),
  `BEFORE INSERT OR UPDATE OF therapist_id, booking_date, start_time ON
  bookings` — same column-scoping as `trg_bookings_set_computed_fields`, so
  a bare status transition (Complete/Cancel/No-show) never re-validates.
  Raises `THERAPIST_UNAVAILABLE: Day Off|Absent|On Leave` when the assigned
  `therapist_id` matches a live row in `therapist_day_off`/
  `therapist_absence`/`therapist_leave` for that `booking_date`. Table-level,
  so it also covers `quick_walkin()` and `changeBookingTherapist()`
  (Change/Reassign), not just `createBooking()` — confirmed and approved as
  intentional.
- **Known pre-existing bad data, left as-is by design**: live data has
  ~40 `Booked`/`Completed`/`Needs Reassignment` bookings already assigned to
  a Day-Off/Absent therapist for their booking date (some dated the day of
  this fix). The trigger's column scoping means these are never touched
  unless someone actually reassigns/reschedules them, at which point the
  new check correctly applies. No backfill/cleanup was done.
  - **Update (`ohm#9x4r7b2q`, 2026-09-02)**: 2 of these rows manually
    corrected `Booked` → `Needs Reassignment` (both under Akio — one a
    genuine `toggleDayOff` gap, now closed going forward; one an
    unresolved `markAbsentToday` discrepancy, follow-up needed). ~38 rows
    remain untouched (22 `Completed`, not actionable; 5 `Cancelled`,
    terminal/harmless; rest out of scope for this pass). See
    `.ai/handoff.md` for details.
  - **`toggleDayOff` gap closed going forward**: `toggleDayOff()` in
    [app/(staff)/therapists/actions.ts](../../app/(staff)/therapists/actions.ts:203)
    now bulk-flags current/future `Booked` rows to `Needs Reassignment`
    when a recurring day-off is added, matching `markAbsentToday`/
    `markOnLeave`/`archiveTherapist`. New day-offs no longer silently leave
    stale `Booked` rows.
- `app/(staff)/bookings/actions.ts`: new `therapistUnavailableError()`
  helper parses the trigger's message; wired into `createBooking`,
  `quickWalkin`, and `changeBookingTherapist`'s existing error-mapping
  (same pattern as their pre-existing `23P01` parsing).
- `components/booking-form-modal.tsx` (New Booking only — no shared
  therapist-select component exists across modals; Quick Walk-in, Log
  Visit, and Sales each inline their own `<select>` and are untouched,
  covered only by the DB trigger): new per-date fetch of the three
  availability tables into an `unavailableTherapists` map. Dropdown options
  get a `— Day Off`/`— Absent`/`— On Leave` suffix and `disabled`, alongside
  the pre-existing (already-correct, runtime-derived) `— Fully Booked`.
  Default therapist selection now skips to the first available therapist
  instead of blindly `therapists[0]`.
- Confirmed live: "On Leave" (`therapist_leave`) was already modeled
  separately from `therapist_absence`/`therapist_day_off` — no schema
  change needed for status types.

**Correction, `ohm#c4nc3lbk` (2026-09-17)** — Auto-cancel lapsed unvisited bookings past 2:00 AM cutoff.

- Added stored procedure `public.auto_cancel_lapsed_bookings()` (`supabase/migrations/20260917100000_auto_cancel_lapsed_bookings.sql`).
- Calculates current Manila time (`now() AT TIME ZONE 'Asia/Manila'`). At or past 2:00 AM, target cutoff date is yesterday (`date_ph - 1`), auto-cancelling any remaining unvisited bookings (`Booked` or `Needs Reassignment`) for `booking_date <= cutoff_date`.
- Updates `bookings.status = 'Cancelled'` and inserts `action_logs` audit entries with `action = 'auto_cancel_lapsed_booking'`.
- Created Route Handler `/api/cron/auto-cancel-bookings` (`app/api/cron/auto-cancel-bookings/route.ts`) registered in `vercel.json` with schedule `0 18 * * *` (2:00 AM Manila time / UTC+8).

**Correction, `ohm#edtmodbfix` (2026-09-17)** — Fix EditBookingModal Self-Locker False Conflict & Therapist Availability Dropdown.

- **Self-Locker False Conflict Fix**:
  - Client-side: Updated `EditBookingModal` (`components/booking-browser.tsx`) `occupiedLockers` fetch to exclude self-occupancy rows matching `booking.id`, `initialOccupancy.id`, or `initialOccupancy.locker_number`. Set `<option disabled={occupied && !isCurrent}>` so leaving the assigned locker unchanged remains valid.
  - Server-side: Updated `editBooking` action (`app/(staff)/bookings/actions.ts`) to resolve `existingOcc` to active occupancy (`!checked_out_at`), skip conflict check when locker is unchanged (`lockerChanged === false`), and exclude `activeOcc.booking_id !== input.bookingId` / `activeOcc.id !== existingOcc.id` from triggering a conflict.
- **Therapist Availability & Weekday Math**:
  - Formatted therapist options in `EditBookingModal` dropdown to display availability suffixes (`Akio - Day Off`, `Josh - On Leave`, `Name - Absent`) for `booking.booking_date`.
  - Set `<option disabled className="text-stone-500">` to prevent selecting unavailable therapists unless currently assigned to that booking (`booking.therapist_id === t.id`).
  - Evaluated recurring day-off weekday via `new Date('${date}T00:00:00').getDay()` (0 = Sunday ... 6 = Saturday), aligning JS `getDay()` with Postgres `extract(dow from booking_date)`.

**Correction, `ohm#lckstalesync` (2026-09-17)** — Fix Desync Between Bookings Check-In Tab & Locker Board (Missing Nanon Occupancy + Stale Locker Rows).

- **Atomicity & Order Fix (`logVisitBooking`)**: Reordered `logVisitBooking` in `app/(staff)/bookings/actions.ts` so `locker_occupancy` is assigned before `bookings.status` is set to `'Completed'`. If locker assignment fails, status update is aborted/rolled back, eliminating orphaned completed bookings without locker records.
- **Stale Locker Cleanup & Nanon Backfill**: Created migration `20260917120000_auto_checkout_stale_lockers.sql` with procedure `auto_checkout_stale_lockers()` to auto check-out unclosed locker rows past 2:00 AM cutoff, auto-releasing JM (#9) and ohm (#18) and backfilling Nanon (#8).

**Correction, `ohm#bkgchkedt` (2026-09-17)** — Fix Check-in Time & Locker missing data + Add leftmost Edit Booking action & modal.

- **Check-in Time & Locker # Fix**: Updated `BookingBrowser` (`components/booking-browser.tsx`) day-view query to fetch `bookings` alongside active `locker_occupancy` records with fallback resolution for unlinked `booking_id` rows, resolving blank `-` displays on Check-in and Check-out tabs.
- **Leftmost Edit Button & Modal**:
  - Added leftmost "Edit" button column as the first column in the Bookings table.
  - Built `EditBookingModal` component allowing receptionists to update Service, Therapist, Massage Time / Schedule (with slot availability struck through), and Locker #.
  - Added `editBooking` server action in `app/(staff)/bookings/actions.ts`: updates `bookings` (`service_id`, `therapist_id`, `start_time`), validates double-booking GiST constraint (`no_double_book_therapist`) and therapist status availability (`THERAPIST_UNAVAILABLE`), checks and updates/inserts `locker_occupancy` (preventing double-locker assignment via `one_active_occupant_per_locker`), and logs an entry to `action_logs` (`action: "edit_booking"`).
  - Revalidates `/bookings`, `/dashboard`, `/call-sheet`, `/lockers`.

**Correction, `ohm#bkgupcedt` (2026-09-17)** — Conditionally display leftmost Edit column strictly on CHECK-IN tab.

- **Check-in Tab Column Condition**: Updated `BookingBrowser` (`components/booking-browser.tsx`) table header (`<thead>`) and body (`<tbody>`) to condition the leftmost Edit button column on `tab === "checkin"`.
- **Removed Redundancy**: The leftmost Edit column is omitted from the UPCOMING tab (which features dedicated rightmost action buttons) and CHECK-OUT tab.


**Correction, `ohm#droprmoccupancy` (2026-09-17)** — Drop `one_active_occupant_per_room` Constraint from `locker_occupancy` to Decouple Room Sessions from Locker Stays.

- **Database Migration (`20260917130000_drop_room_occupancy_unique_index.sql`)**: Dropped partial unique index `public.one_active_occupant_per_room` on `locker_occupancy(room_number) WHERE checked_out_at IS NULL`. Intact: `one_active_occupant_per_locker`.
- **Server Actions (`app/(staff)/bookings/actions.ts`)**: Removed dead `one_active_occupant_per_room` unique violation error checks from `quickWalkin` and `logVisitBooking` (both update and insert paths). Decoupled physical 90-minute massage room session windows from all-day locker stays so consecutive clients in different time slots can occupy the same room on the same day without triggering false "That room is already occupied" errors.

**Correction, `ohm#editbkgsvcroom` (2026-09-17)** — Dynamic Room/Therapist Handling & Sales Adjustment when switching between Wet Area and Massage in Edit Booking Modal.

- **Dynamic Form Fields (`components/booking-browser.tsx`)**: Extended `EditBookingModal` to inspect selected service (`isMassageService = selectedService.name !== "Wet Area"`). Renders `Assign Room` dropdown when Massage is selected, computes same-day room availability at `startTime`, marks occupied rooms, and requires selecting both a **Room** and a **Therapist**. Automatically resets `room_number = null` and `therapist_id = null` when downgraded to Wet Area. Added **Price & Remittance Banner** showing original service price vs new service price, price difference (+₱X / -₱X), and updated sales remittance total. Passed `rooms={rooms}` from `BookingBrowser`.
- **Backend Action & Sales Sync (`app/(staff)/bookings/actions.ts`)**: Updated `editBooking` server action to accept `roomNumber`. Enforces required Room and Therapist for massage services and clears them for Wet Area. Updates `bookings.room_number` and `locker_occupancy.room_number` simultaneously so Call Sheet immediately reflects room changes. Automatically adjusts active non-voided `sales.amount` by the price difference when service changes and updates `sales.service_id` and `sales.therapist_id`.

**Correction, `ohm#editbkgwettimehide` (2026-09-17)** — Hide Massage Time / Schedule picker when service is downgraded to Wet Area in Edit Booking Modal.

- **Conditional Schedule Selector (`components/booking-browser.tsx`)**: Wrapped **Massage Time / Schedule** section in `{isMassageService && (...)}`. When service is changed to "Wet Area", the schedule slot selector is completely hidden. Updated form payload in `handleConfirmSave` to pass `startTime: isMassageService ? startTime : null`.
- **Server Action & Slot Release (`app/(staff)/bookings/actions.ts`)**: Updated `EditBookingInput.startTime` to `string | null`. Computed `finalStartTime` in `editBooking` action (`isMassageService ? input.startTime : (input.startTime ?? booking.start_time)`). Clearing `therapist_id` and `room_number` when downgraded to Wet Area immediately releases the booking from the `no_double_book_therapist` and `no_double_book_room` GiST exclusion constraints, freeing up the massage slot immediately for other bookings on that day.

**Correction, `ohm#bookingfilterbar` (2026-09-17)** — Add Quick Search Bar and Time Slot Filters to Bookings Page.

- **Quick Search & Filter Controls (`components/booking-browser.tsx`)**: Placed responsive Filter Bar controls directly above active tab table. `searchQuery` state supports instant client-side substring matching on `client_codename` or `guest_label` and `locker_number` (exact or partial numeric match), with a clear "x" button. `selectedTimeSlot` state supports filtering by time slot (`All` + operating-day sorted pills with active gold highlight).
- **Record Counter & Inline Empty Message (`components/booking-browser.tsx`)**: Displays reactive record counter (`Showing X of Y bookings` / `Showing Y bookings`). Displays inline empty state `No bookings match your search or filter criteria.` when no records match filter criteria.

**Correction, `ohm#rembookingact` (2026-09-17)** — Remove ACTION column and Check Out buttons from Bookings page.

- **Check-in Tab Table Cleanup (`components/booking-browser.tsx`)**: Removed `ACTION` table header (`<th>ACTION</th>`) and `Check Out` button cell (`<td><button ...>Check Out</button></td>`) under the **Check-in** tab table.
- **Unused State & Modal Cleanup (`components/booking-browser.tsx`)**: Removed `CheckoutConfirmModal` import and `checkoutTarget` state binding from `BookingBrowser`.
- **Clean Grid Alignment (`components/booking-browser.tsx`)**: Re-aligned Check-in table columns cleanly to 8 columns: `EDIT`, `MASSAGE TIME`, `CLIENT`, `SERVICE`, `ROOM`, `THERAPIST`, `CHECK-IN TIME`, `LOCKER #`. Locker checkout remains strictly handled under the **Lockers** tab (`components/locker-board.tsx`), protected by `CheckoutConfirmModal`.

**Correction, `ohm#8b3f1a9c` (2026-09-19)** — Remove Dashboard, Set Bookings as Default Landing, and Mount Needs Reassignment Panel.

- **Needs Reassignment Relocation (`app/(staff)/bookings/page.tsx`)**: Embedded `<ReassignmentPanel />` directly at the top of the Bookings page, between the page title and `<BookingBrowser />`.
- **Live Availability & Flagging Queries**: Added queries for `Needs Reassignment` status, active bookings, therapist absences, leaves, and days off into the page-level `Promise.all`.
- **Dynamic Reassignment Key & Reactivity**: Derived `reassignmentKey` from the flagged bookings list and passed `key={reassignmentKey}` to `<BookingBrowser />`. Completing a reassignment or cancellation triggers `router.refresh()`, mutating `reassignmentKey` and automatically re-fetching fresh booking rows in the bookings table below.
- **Default Landing Route**: Bookings (`/bookings`) is now the default landing route across `/`, `proxy.ts`, and staff login flows. Standalone `/dashboard` route was completely deleted, with a permanent redirect configured in `next.config.ts`.

**Correction, `ohm#7d2a5f1e` (2026-09-19)** — Disable Time Slot Selection Until Therapist Is Selected in Quick Walk-in and New Booking.

- **Time Slot & Custom Time Gating (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**:
  - Gated Time Slot pill buttons and the "Use a custom time instead" checkbox toggle on active therapist selection (`disabled={!isTherapistSelected || taken || useCustomTime}`).
  - When no therapist is selected, buttons render with `opacity-40 cursor-not-allowed border-border bg-background text-foreground/40` and custom time toggle with `opacity-40 cursor-not-allowed`.
  - Added visual feedback below Time Slot section: helper text `"Select a therapist first to see available slots"` is displayed when `!isTherapistSelected`.
  - In both modals, resetting or clearing the therapist selection (`!nextId`) automatically resets `slotTime` to empty and `useCustomTime` to `false`, immediately returning the Time Slot section to the disabled state.

**Correction, `ohm#6c9d3e1a` (2026-09-19)** — Add Cancel Action Button Beside Reassign in Bookings Table.

- **Bookings Action Cell UI (`components/booking-browser.tsx`)**:
  - Located `row.status === "Needs Reassignment"` row action branch under the ACTION column.
  - Added `Cancel` button right beside `Reassign` styled with `rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10`.
  - Clicking `Cancel` opens a confirmation dialog showing client name, service, room, date, and time, with an editable cancellation reason input.
- **Cancellation Logic & Cleanup (`app/(staff)/bookings/actions.ts`, `components/booking-browser.tsx`)**:
  - Exported `cancelBooking(bookingId, staffId?, reason?)`: sets `bookings.status = 'Cancelled'`, which automatically releases the room and slot from `no_double_book_room` and `no_double_book_therapist` GiST exclusion constraints.
  - Inserts audit log in `action_logs` (`cancel_reassignment_booking` or `cancel_booking`) with staff attribution and reason.
  - Revalidates paths `/bookings`, `/dashboard`, and `/call-sheet`.
  - Confirmed cancellation cleanly drops row from active upcoming views and top `<ReassignmentPanel />`.

**Correction, `ohm#3c8f1e2a` (2026-09-19)** — Set default manual discount percentage to 20%.

- **Default Percentage Value**:
  - `QuickWalkinModal` (`components/quick-walkin-modal.tsx`): Updated initial `discountValue` state from `25` to `20`. Updated `onManualDiscountToggle` and type switch dropdown `onChange` so that toggling manual discount on or switching type back to "pct" immediately resets/defaults `discountValue` to `20`.
  - `LogVisitModal` (`components/log-visit-modal.tsx`): Confirmed initial `discountValue` state is `20`. Updated `onManualDiscountToggle` and type switch dropdown `onChange` so that toggling manual discount on or switching type to "pct" resets/defaults `discountValue` to `20`.
- **Immediate Calculation**: Amount computations in both modals immediately reflect the 20% discount upon checking the "Manual discount (e.g. Senior or PWD)" box.
- `components/booking-form-modal.tsx` confirmed untouched (does not implement manual discount or pricing).

**Correction, `ohm#4a8d2f1b` (2026-09-19)** — Filter Therapist by Service in Quick Walk-in and New Booking Modals.

- **Service-Based Qualification Filter (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**:
  - Both modals now query `therapist_services` in their availability `Promise.all` block on mount/date change.
  - Computes `qualifiedTherapists` filtering active therapists strictly to those assigned to the currently selected `serviceId`.
  - Therapist `<select>` dropdown renders only qualified therapists offering the selected service.
  - When no service is selected, the therapist dropdown is disabled with placeholder `— select service first —`.
  - On service change (`onServiceChange`): if the currently selected therapist is not qualified for the newly selected service, `therapistId` is automatically reset to empty `""`, which in turn clears `slotTime = ""` and disables the time slot selection (`ohm#7d2a5f1e`).
  - Added reactive qualification guard ensuring any desynchronized selection resets immediately if unqualified.
**Correction, `ohm#7f3b1e9a` (2026-09-19)** — Past Time Grace Period (20 mins) and Booked Slots Gating in Quick Walk-in and New Booking Modals.

- **Time Slot Utilities (`lib/bookings/slots.ts`)**:
  - Added `getSlotStartMs(bookingSpaDay, slotTime)`: maps slot times to Manila epoch milliseconds (UTC ms) with operational window awareness (hours `< 8` such as 00:00, 00:30, 01:00 map to the calendar morning following the spa day anchor via `shiftSpaDay(bookingSpaDay, 1)`).
  - Added `isSlotPastGracePeriod(slotTime, bookingDate, now, gracePeriodMinutes = 20)`: evaluates whether a slot has elapsed past its 20-minute grace window on the active operational day (`bookingDate === spaDayNow()`). Gated strictly on the current spa day — future dates (`bookingDate > spaDayNow()`) return `false` (never past-gated).
- **Slot Gating & Styling (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**:
  - Incorporated 30s interval ticker `currentTime` for live grace period evaluation while modal is open.
  - Differentiated slot button visual states:
    - **Past slots**: disabled and rendered in faded dark gray (`border-border/40 bg-background/50 text-foreground/30 opacity-25 cursor-not-allowed`) without line-through and without "Booked" label.
    - **Booked slots**: disabled and rendered struck-through with red/muted outline (`border-dashed border-red-500/30 bg-red-950/10 text-red-400/60 line-through opacity-60 cursor-not-allowed`) displaying struck-through time and `<span className="text-[9px] no-underline font-sans text-red-400/80 leading-none mt-0.5">Booked</span>`.
    - **No therapist selected**: `border-border bg-background text-foreground/40 opacity-40 cursor-not-allowed` with helper text `"Select a therapist first to see available slots"`.
  - Preserved mobile touch target (`min-h-[44px] sm:min-h-[38px]`) with centered vertical flex alignment.
  - Added `isPastSlot` and `isBookedSlot` validation guards to `canSubmit` and `handleSubmit`.
  - Quick Walk-in modal date initialized with canonical `spaDayNow()`.

**Correction, `ohm#5c1a8d2e` (2026-09-21)** — Filter Service Dropdown in Quick Walk-in and New Booking Modals by Therapist Services Offered.

- **Bidirectional Service Filtering (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**:
  - Derived and stored `therapistServicesMap: Map<string, Set<string>>` (`therapist_id -> Set<service_id>`) populated from the `therapist_services` query.
  - Derived `availableServices` options for the Service `<select>`:
    - If a `therapistId` is selected, filters `services` strictly to those offered by that therapist in `therapistServicesMap.get(therapistId)`.
    - If no `therapistId` is selected yet (`!therapistId`), displays all active services (retaining the existing behavior where picking a service filters therapists).
  - Added bidirectional synchronization effect in both modals: if a therapist is selected and the active `serviceId` is not in their offered services (e.g. on therapist change or pre-fill), automatically resets/defaults `serviceId` to the therapist's first qualified service.
  - Updated therapist dropdown `onChange` in both modals: selecting a therapist automatically switches `serviceId` to their first qualified service if the current service is not offered by them.
  - Extended `BookingFormModal` with optional `initialTherapistId` prop and name/id resolution matching `QuickWalkinModal`.
  - Added fallback empty option `— no services available —` when a therapist has no offered services.
  - Recalculations: `amount`, duration, room availability calculations, and split payment auto-balancing recalculate seamlessly on dynamic service adjustments.

**Correction, `ohm#1b4e9f7a` (2026-09-21)** — Audit and Fix Service Name vs ID Mismatch in Therapist Booking Flow.

- **Catalog & Capability Discrepancy Resolution (`public.services`, `public.therapist_services`, `components/quick-walkin-modal.tsx`)**:
  - Identified database discrepancy: `public.services` contains inactive legacy service `"Scrub"` (`326e0b78-49cb-441c-aa03-e54453f2f67f`, `active: false`, ₱900) and active catalog service `"Scrub + Massage"` (`8c97c5db-eaa9-47b9-89c0-9db114000483`, `active: true`, ₱1,800).
  - Previously, therapist cards and `therapist_services` referenced the inactive `Scrub` UUID. Because `QuickWalkinModal` filters active services (`.eq("active", true)`), `availableServices` omitted the inactive Scrub row while also omitting `"Scrub + Massage"` because therapists lacked its active UUID.
  - Repointed existing `therapist_services` capability rows from the inactive `Scrub` UUID to the active `Scrub + Massage` UUID (`8c97c5db...`).
  - Added defense-in-depth alias normalization in `QuickWalkinModal` query processing mapping legacy `Scrub` ID to `Scrub + Massage` ID.
  - Verified bidirectional filtering in `QuickWalkinModal`: launching or selecting a therapist offering scrub immediately includes `Scrub + Massage · 90min` in `availableServices`; selecting `Scrub + Massage` filters qualified therapists strictly to those offering the service.

**Correction, `ohm#8b2f4c1e` (2026-09-21)** — Add Context-Rich Success Toast Notifications for Bookings Creation.

- **Floating Success Toast Dispatcher (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**:
  - Implemented `showBookingToast({ title, description })` mounted directly to `document.body` at `z-[100]` with semantic design tokens (`border-gold`, `bg-surface-2`, `text-accent-gold`, `text-foreground`, `shadow-2xl`, `animate-fade-in`).
  - Solves modal unmount lifecycle teardown: because parent views unmount modals on `onCreated()`, attaching toasts to `document.body` ensures notifications display for the full 4 seconds (with smooth CSS exit transition and click-to-dismiss).
- **Quick Walk-in Modal Feedback (`components/quick-walkin-modal.tsx`)**:
  - Triggers success toast upon walk-in completion and modal close (both immediate and post-points-warning dismissal).
  - Toast content: Title: `"Walk-in logged successfully!"`, Subtitle: `Client Name • Service Name (Therapist Name) • Locker #[Num] • Room [Num]` (with null-safe handling for Wet Area).
- **New Booking Modal Feedback (`components/booking-form-modal.tsx`)**:
  - Triggers success toast upon advance booking completion and modal close (both direct walk-in and post-SMS preview dismissal).
  - Toast content: Title: `"Booking created successfully!"`, Subtitle: `Client Name • [Date], [Slot Time] • Service Name (Therapist Name)`.
- **Safety & Resilience**:
  - Preserved inline error state, warnings, and `errorRef` scrolling.
  - Retained single server revalidation path via `onCreated()` (`router.refresh()`), preventing duplicate network calls.

## Known simplifications (not gaps — deliberate for this phase's scope)

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
