# Dashboard (Reception Home) — Current State

## Implemented (DB level)

No new tables/columns. Reuses `bookings.status = 'Needs Reassignment'`
(existing enum value, already inside both no-double-booking GiST
constraints' scope — see [[bookings_state]] and ADR-001) as the sole signal
for "this booking needs a new therapist." `therapist_absence`/
`therapist_leave` gained RLS policies (`ohm#3f8q1w6z`, 2026-08-30,
`20260830024144_therapist_absence_leave_rls.sql`) — see [[therapists_state]].

## Implemented (app level, `ohm#3f8q1w6z`, 2026-08-30)

`app/(staff)/dashboard/page.tsx` (server component, previously 4 static
count cards only) now also fetches all `bookings` rows with
`status = 'Needs Reassignment'` (embedded-joined to `therapists(name)`,
`services(name)`, `clients(codename)`, plus `guest_label`/`room_number`)
and all non-archived `therapists(id, name)`, passed into a new client
component `components/reassignment-panel.tsx` (`ReassignmentPanel`).

- Renders a "Needs Reassignment (N)" panel below the stat cards, one row
  per flagged booking (date/time, client or guest label, service, room if
  any, and the therapist who was on it), each with a **Transfer** button.
- Transfer opens a modal with a therapist `<select>` (excludes the
  currently-assigned therapist, excludes archived therapists) and calls
  the existing `changeBookingTherapist()` server action
  (`app/(staff)/bookings/actions.ts`) with the booking's unchanged
  `start_time` — no time-change UI here, deliberately narrower than the
  Bookings tab's Change/Reassign modal (out of this task's scope).
- **Correctness fix inside `changeBookingTherapist()`**: the UPDATE now
  also sets `status: 'Booked'` when the booking's current status is
  `Needs Reassignment`, alongside the existing `therapist_id`/
  `start_time` write. Previously this never happened — a `Needs
  Reassignment` row stayed flagged forever even after a successful
  reassignment, a pre-existing gap in both this task's own Transfer
  action and the Bookings tab's pre-existing "Reassign" button (same
  shared function, so both are fixed by the one change). No new
  parameter; no change to the `23P01` exclusion-violation handling — the
  GiST constraints are unchanged and unweakened.
- No new RLS on `bookings` — the existing `staff_update` (`is_staff()`)
  policy already covers this UPDATE, matching the "no role restriction on
  status transitions" precedent from Change Therapist. Matches the
  prompt's named roles (Owner/Supervisor/Receptionist) exactly — those are
  the only three staff positions that can authenticate at all (`rbac.md`);
  there is no narrower role to exclude.

## How a booking gets flagged in the first place

`app/(staff)/therapists/actions.ts` — new `markAbsentToday()` and
`markOnLeave()`, wired to the Therapist Roster's kebab menu (previously
local-state-only, see [[therapists_state]]):

- `markAbsentToday(therapistId, date, staffId)`: upserts
  `therapist_absence` (ignores the unique-constraint conflict if already
  marked for that date), then `UPDATE bookings SET status =
  'Needs Reassignment' WHERE therapist_id = … AND booking_date = … AND
  status = 'Booked'`.
- `markOnLeave(therapistId, startDate, endDate, reason, staffId)`: inserts
  `therapist_leave`, then the same flagging UPDATE over
  `booking_date BETWEEN startDate AND endDate`.
- Both log one `action_logs` row (`therapist_mark_absent`/
  `therapist_mark_on_leave`) with the flagged-row count, and
  `revalidatePath("/therapists")` + `revalidatePath("/dashboard")`.
- "Operational day" here means the plain `booking_date` calendar date
  (matching how the rest of Bookings/Roster already filter — not the
  spa-day/4PM-rollover concept from [[analytics_state]], which is a
  reporting-only bucketing rule, never applied to `booking_date` itself
  anywhere in this codebase).

## Not yet implemented

- Un-flagging without a transfer (e.g. reverting a `Needs Reassignment`
  booking back to `Booked` with the same therapist, for an absence marked
  in error) — not requested, not built.
- No filter/sort on the reassignment panel itself — expected to stay
  small in practice (same "small row counts, revisit if that changes"
  reasoning as Analytics).
