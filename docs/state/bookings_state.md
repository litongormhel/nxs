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

## Implemented (app level, Bookings phase `ohm#9k4p7w2z`)

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
  truth. Squad Goals is a plain checkbox (no service in the current
  catalog is tagged "Squad Goals" — the catalog only has Combi Massage,
  Scrub, Signature Massage, Wet Area — so this is a general group-booking
  toggle, not gated to a specific service) that reveals a 3/4 pax stepper
  and a non-blocking amber warning banner when the date is a weekday.
  Placeholder staff picker (`// TEMP: placeholder actor pending Staff Auth
  phase`) sets `created_by`, same pattern as Core Loop.
- `components/quick-walkin-modal.tsx` — **Quick Walk-in**: single-step
  modal, toggles between "Walk-in guest" (free-text `guest_label`) and
  "Registered member" (same inline client search pattern), service select,
  manual therapist/room dropdowns (no conflict greying — a walk-in is
  meant to be instant; the DB constraint is still the enforcement layer),
  placeholder staff picker. Always books "now" (current date/time) and
  inserts with `status = 'Completed'` directly into `bookings` — decided
  with the user over bypassing `bookings` for a sales/points-only path,
  specifically so a walk-in still can't silently double-book a room or
  therapist.
- `components/sms-preview-modal.tsx` — shown after a successful New
  Booking for a registered client (`client_id` not null). Editable
  textarea pre-filled with **placeholder** copy (no locked SMS format
  existed anywhere in this repo — confirmed with the user rather than
  invented) using the service's non-discounted `price`. No SMS gateway is
  wired into this repo — this is a compose/preview + copy-to-clipboard
  step only, not a real send.
- `app/bookings/actions.ts` — `createBooking(input)` server action, the
  single insert path for both New Booking and Quick Walk-in. On a Postgres
  `23P01` (exclusion violation) it inspects the error message for
  `no_double_book_room` vs `no_double_book_therapist` and returns a
  specific "that room/therapist is already booked" message; any other
  error passes through the raw Postgres message. On success, revalidates
  `/bookings` and `/dashboard`.

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
  [[clients_state]] (no schema for it beyond the new `pax_count` headcount
  field).
- `app/call-sheet/page.tsx` is still an 8-line "Coming soon." stub, though
  it will likely consume `bookings` + `therapists` once built.
- No version-controlled migration file exists for the `pax_count` column
  or its RLS policies — same gap noted in every prior phase, still
  unresolved.
