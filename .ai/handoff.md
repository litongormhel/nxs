# Handoff — Active Sprint

Not a history log — see `.ai/briefing.md` → "Last Completed Tasks" for that.
This file tracks only what's in flight right now.

## In progress

- **Migration files (`ohm#2m6x9j5f`) — retroactive baseline + going-forward
  convention** — **complete** as of 2026-08-27. Tooling decision (Supabase
  CLI installed but project not CLI-linked here, no `supabase/` directory)
  was presented and approved before generating anything. Pulled the live
  schema directly from Supabase (not from docs — those can drift) and
  confirmed it matches ADR-001: 18 tables + 1 view (`loginable_staff`), both
  GiST exclusion constraints, ledger immutability triggers, `pax_count`,
  the `SECURITY DEFINER` fix on `apply_points_delta()`, `log_visit()`, and
  all 12 current RLS policies. Wrote one hand-authored snapshot file,
  `supabase/migrations/20260827130641_baseline_snapshot.sql` — **DB
  migrations are now version-controlled starting from this baseline.** This
  file is a snapshot only: everything in it is already applied live; it was
  never run against the database (no `apply_migration` call was made this
  session — read-only pulls only). Added the going-forward rule to
  `docs/architecture/workflow.md`: every DB-layer change ships its own
  migration file in the same commit as the dependent app code, now a
  standing Approval & Regression Gate check. Noted where migrations live in
  `docs/architecture/system.md`. No schema, RLS, triggers, or functions were
  changed — this task only captured current state as version-controlled
  files.
- **Bookings phase (`ohm#9k4p7w2z`) — New Booking form, 90-min overlap
  engine, Quick Walk-in** — **complete** as of 2026-08-27. Plan +
  regression assessment presented and approved before implementation.
  Delivered: `app/bookings/page.tsx` is now real (was a stub) with a
  day-view list, New Booking modal, and Quick Walk-in modal. New Booking:
  client search (registered only), service/therapist/room/date/hourly-slot
  picker (4:30 PM open, last call 1:00 AM), UI-layer conflict greying for
  therapist/room, Squad Goals pax stepper (3/4) with a non-blocking weekday
  warning banner, and an editable SMS preview (placeholder copy, no
  gateway — compose/preview only) shown after a successful booking for a
  registered client, using the service's non-discounted price. Quick
  Walk-in: single-step modal, toggles between walk-in guest (free-text
  label) and registered-member search, manual room dropdown, inserts
  directly into `bookings` as `status = 'Completed'` — decided with the
  user over the alternative of bypassing `bookings` entirely. Both paths
  go through one `createBooking` server action
  (`app/bookings/actions.ts`) that lets the DB's GiST exclusion
  constraints be the real enforcement and parses `23P01` violations into a
  specific "therapist" or "room" conflict message rather than surfacing
  the raw Postgres error.
  - **DB change**: `bookings.pax_count` (nullable smallint, check
    constraint `IN (3,4)`) — additive, smoke-tested via a rolled-back
    transaction (valid 3/4 inserts, invalid value correctly rejected,
    both GiST exclusion constraints confirmed still intact) before
    applying for real. New narrow `anon` SELECT/INSERT RLS policies on
    `bookings` (same shape as Core Loop's), no UPDATE/DELETE.
  - **Explicitly out of scope, flagged not forgotten**: status transitions
    (Booked→Completed/No-show/Cancelled) need an `anon` UPDATE policy on
    `bookings` that was not opened this phase — left out of the UI
    entirely rather than added ad hoc. No version-controlled migration
    file exists for the `pax_count` column or the new RLS policies — same
    gap as every prior phase, still unresolved, still worth a real
    decision.
  - **Discrepancies resolved with the user before building** (none were
    guessed): operating hours/slot grid, SMS copy format, and Squad Goals
    pax storage were all undocumented anywhere in this repo — confirmed
    directly rather than assumed. See [[bookings_state]] for the
    surgical detail.
  - Verified live in a browser (not just typecheck/build): created a
    registered-client booking end-to-end including the SMS preview,
    forced a real double-booking to confirm the specific conflict message,
    ran a Quick Walk-in end-to-end, and regression-checked
    Dashboard and Client Profile/Log Visit — both unaffected. Test rows
    cleaned up from the live DB after verification.
- **Core Loop phase (`ohm#7f3k9d2m`) — Client Profile Actions, Points
  Ledger, Log Visit Modal** — **complete** as of 2026-08-27. Plan was
  presented and approved before implementation, per the prompt's mandatory
  gate. Delivered: Log Visit button + last-10 activity list on Client
  Profile, `public.log_visit(...)` atomic write RPC (ledger + optional sale
  + action log in one transaction), narrow additive RLS policies for `anon`
  on `clients`/`staff`/`point_transactions` (SELECT) and
  `point_transactions`/`sales`/`action_logs` (INSERT), and a one-line fix
  making `apply_points_delta()` `SECURITY DEFINER` (pre-existing trigger,
  broken for any RLS-scoped caller until this surfaced it in manual
  smoke-testing). See [[points_ledger_state]], [[clients_state]],
  [[sales_state]], [[staff_state]], [[logs_state]] for the surgical detail.
  **Staff Auth intentionally deferred** — RLS now has narrow anon
  SELECT/INSERT policies scoped to exactly what Core Loop needs, not a
  general re-open; `clients` still has no UPDATE policy. Action Logs uses
  a placeholder actor dropdown (`// TEMP: placeholder actor pending Staff
  Auth phase` — grep this). Not a regression, not forgotten.
- Doc scaffold bootstrap (`ohm#3q8n5t1x`) — **complete** as of 2026-08-27.
  `.ai/`, `docs/state/*.md`, `docs/architecture/*.md`, and the ADR-001
  invariants file are all in place, sourced from the live Supabase schema
  and the actual app tree (not assumed content).

## Session notes

- `app/dashboard` and `app/clients` have real implementations. Every other
  route under `app/` (`bookings`, `sales`, `therapists`, `staff`, `logs`,
  `analytics`, `settings`, `lockers`, `call-sheet`) is still an 8-line
  "Coming soon." stub — Core Loop did not touch any of them. Do not assume
  any behavior exists there beyond the stub unless you've re-read the file.
- Staff auth is still not wired up anywhere in the app code (no login page,
  no session in `app/layout.tsx`/`sidebar.tsx`). The app's server/browser
  Supabase clients use the anon key. RLS now has narrow, additive
  SELECT/INSERT policies for the five tables Core Loop needed (see above) —
  everything else is unchanged from the doc-scaffold bootstrap's findings:
  enabled, no policy, default-deny.
