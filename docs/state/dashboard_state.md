# Dashboard (Reception Home) — Current State

## Implemented (DB level)

No new tables/columns. Reuses `bookings.status = 'Needs Reassignment'`
(existing enum value, already inside both no-double-booking GiST
constraints' scope — see [[bookings_state]] and ADR-001) as the sole signal
for "this booking needs a new therapist." `therapist_absence`/
`therapist_leave` gained RLS policies (`ohm#3f8q1w6z`, 2026-08-30,
`20260830024144_therapist_absence_leave_rls.sql`) — see [[therapists_state]].

## Standalone Dashboard Removed (`ohm#8b3f1a9c`, 2026-09-19)

The standalone `/dashboard` route and view (`app/(staff)/dashboard/`) were completely removed.
- **Default landing**: Authenticated staff visits to `/` or post-login now redirect directly to `/bookings`. `next.config.ts` includes a permanent redirect from `/dashboard` to `/bookings`.
- **Sidebar navigation**: "Dashboard" was removed from navigation. The updated sidebar sequence starts directly with `Bookings`, followed by `Call Sheet`, `Therapists`, `Lockers`, `Sales`, `Clients`, `Analytics`, `Staff`, `Logs`, and `Settings`.
- **ReassignmentPanel relocation**: The `<ReassignmentPanel />` component has been relocated into `app/(staff)/bookings/page.tsx` directly above `<BookingBrowser />`. See [[bookings_state]].

## Implemented (app level, historical context)

Previously rendered on `app/(staff)/dashboard/page.tsx`, `ReassignmentPanel` fetched all `bookings` rows with
`status = 'Needs Reassignment'` (embedded-joined to `therapists(name)`,
`services(name)`, `clients(codename)`, plus `guest_label`/`room_number`)
and all non-archived `therapists(id, name)`, passed into client
component `components/reassignment-panel.tsx` (`ReassignmentPanel`).

- Renders a "Needs Reassignment (N)" panel below the stat cards, one row
  per flagged booking (date/time, client or guest label, service, room if
  any, and the therapist who was on it), each with a **Transfer** button.
- **Reassign Therapist Modal** (`ohm#alignreassignmentslotsandselection`, 2026-09-18) —
  Transfer/Reassign opens a modal with a therapist `<select>` and interactive
  time slot picker:
  - **Therapist selection rules**: Excludes the currently-assigned therapist and
    archived therapists. Disables ONLY therapists who are strictly unavailable
    for the whole day (`Day Off`, `Absent`, `On Leave`, or `Fully Booked`). Working
    therapists with at least 1 free slot remain selectable even if booked at the
    original session time.
  - **Interactive Time Slot Picker**: Renders clickable time pills below the
    therapist selector with the original booking time pre-selected. Occupied slots
    for the chosen therapist are disabled, struck-through, red, and marked "Booked".
    Free slots are styled with emerald/green borders and labeled "Free". Selected
    slot is styled with a gold gradient.
  - **Reschedule & Validation**: If the selected therapist is occupied at the
    original session time, an inline warning prompts the receptionist to pick an
    available slot and disables Confirm. Picking a free slot updates the session
    time and enables Confirm.
  - Calls `changeBookingTherapist(bookingId, newTherapistId, staffId, selectedSlot)`
    in `app/(staff)/bookings/actions.ts`, which updates `therapist_id` and (if changed)
    `start_time`, resets status back to `Booked`, and revalidates `/dashboard` and `/bookings`.
- **Cancel** (`ohm#9d4k7m2x`, 2026-09-02) — a second button next to
  Transfer, with its own confirm dialog (client, service, room, time)
  before committing. Calls new `cancelReassignmentBooking(bookingId,
  staffId)` (`app/(staff)/bookings/actions.ts`): rejects unless the
  booking is currently `Needs Reassignment`, sets `status = 'Cancelled'`
  (existing enum value, no schema change), logs one `action_logs` row
  (`cancel_reassignment_booking`, `reason=Client decided not to pursue`
  in the detail string — there is no `notes` column on `bookings` to
  append to, confirmed during investigation; the prompt's intent is
  captured in the audit log instead). Fully independent state/handler
  from Transfer. No dashboard-query change needed — cancelling flips
  `status` away from `Needs Reassignment`, so the row drops out of this
  panel on the next fetch via the same mechanism a successful Transfer
  already relies on. Verified (`ohm#3p8v6k1r`) that the Call Sheet
  (driven off `locker_occupancy` check-in state, never `bookings.status`)
  has no dependency on `Needs Reassignment` rows, so cancelling one has
  no call-sheet side effect.
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
