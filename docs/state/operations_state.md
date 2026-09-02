# Operations (Lockers / Rooms / Call Sheet) — Current State

## Implemented (DB level)

- `public.rooms`: `number` (PK-like), `active`.
- `public.lockers`: `number`, `active`.
- `public.locker_occupancy`: check-in/check-out tracking — `locker_number`,
  `room_number`, `service_id`, `client_id`, `guest_label`, `checked_in_at`/
  `checked_in_by`, `checked_out_at`/`checked_out_by`, and (`ohm#7q2x9m4k`,
  2026-08-29) `booking_id uuid references bookings(id)` — nullable,
  additive, no backfill. Lets the Bookings tab derive Check-in/Check-out
  tab membership by joining back to `bookings.status` instead of adding a
  new status value. Populated by both existing write paths
  (`quick_walkin()` RPC and `logVisitBooking()`'s linked-booking branch)
  — see [[bookings_state]]. Locker Board and Call Sheet (below) are
  unaffected: both read via explicit column selects and their own
  `checked_out_at IS NULL` filter, neither references `booking_id`.

## Implemented (app level)

`app/dashboard/page.tsx` reads live counts of `rooms` and `lockers` where
`active = true` ("Total Rooms", "Total Lockers" cards) — the only current
app-level read of these tables.

## RLS

`rooms` and `lockers` both have public-read policies (`USING (true)`).
`locker_occupancy` RLS (`ohm#3f7n9c1k`, Staff Auth 6C-3, 2026-08-29):
`staff_select`/`staff_insert`/`staff_update` all `is_staff()`-gated,
replacing the original `public_select`/`public_insert`/`public_update`
policies (the latter added in the Operations phase, `ohm#9h4c7x2m`). No
role restriction on Check-Out — confirmed with the user, any staff tier
(including Front Desk) can check out a locker. No DELETE policy —
occupancy rows are never hard-deleted.

## Implemented (app level) — Operations Phase (`ohm#9h4c7x2m`, 2026-08-28)

- **Locker Board** (`app/lockers/page.tsx`, `components/locker-board.tsx`):
  real page (was an 8-line stub). Renders one tile per `active=true`
  `lockers` row (live count, currently 100 — not hardcoded). A tile is
  "occupied" when a `locker_occupancy` row exists for that `locker_number`
  with `checked_out_at IS NULL`; occupied tiles show the linked client's
  `codename` (or `guest_label` for walk-ins/guests) and a Check-Out button.
  Header reads `"X / Y occupied"`.
- **Check-Out** (`app/lockers/actions.ts::checkOutLocker`): sets
  `checked_out_at = now()` and `checked_out_by = <acting staff>` on the
  matching `locker_occupancy` row (never deletes it — the row stays as a
  historical record). Ends with an `action_logs` insert
  (`action = "locker_checkout"`), revalidates `/lockers` and
  `/call-sheet`.
- **Call Sheet** (`app/call-sheet/page.tsx`,
  `components/call-sheet-browser.tsx`): read-only, no mutation. Derived
  from the same active (`checked_out_at IS NULL`) `locker_occupancy` rows,
  joined to `services(name)` and filtered to exclude Wet Area, matching
  ADR-001's Wet Area exclusion. **Time field substitution, documented, not
  a schema change**: the mockup's synthetic per-entry `time` doesn't exist
  in the real schema — `locker_occupancy` has no start-time column (that
  concept lives on `bookings`, not joined here). `checked_in_at`
  (formatted HH:MM) is used instead as the time-filter basis, with the
  dropdown built from distinct times actually present in the active rows
  (same "derive from live data" pattern the Logs tab established). Total
  line reads `"X massage(s) [in progress / at TIME]"`.
- **Stale-occupancy filter + nudge** (`ohm#3n8w5tqf`, 2026-09-02,
  implements approaches A + C from audit `ohm#7q2m9xk4`; auto-checkout
  stays out of scope). An active (`checked_out_at IS NULL`)
  `locker_occupancy` row is **stale** when `toSpaDay(checked_in_at) !==
  spaDayNow()` (`lib/analytics/spa-day.ts`'s canonical Analytics-phase
  bucketing, reused as-is) — i.e. it was checked in on a prior spa-day and
  never checked out, which previously inflated Call Sheet's "in progress"
  count with dead entries (confirmed live: 1 stale row at audit time, plus
  16/77 historical rows that took >12h to close). Call Sheet's
  `locker_occupancy` select now also fetches `client_id, guest_label,
  clients(codename)`; entries are split server-side into `inProgress`
  (drives the existing count/filter/JPEG export, unchanged) and
  `needsCheckout` (a new read-only "Needs checkout — N from a prior
  spa-day" section below the table — locker/room/service/guest-client/
  checked-in-at, no action buttons). Locker Board tiles for stale
  occupants get a dashed-border/red-label/"Since yesterday" treatment
  (still blocked from reassignment, same unmodified `checkOutLocker`
  button) plus a "`N` lockers need checkout" badge next to the existing
  occupied count. **Not fixed by this change**: `booking-browser.tsx`'s
  Check-in/Check-out tabs (a separate `bookings.status`-keyed read path)
  still show a stale row stuck in "Check-in" indefinitely — flagged as a
  known residual gap for a future prompt, not silently patched here.
- Both current write paths into `locker_occupancy` — `quick_walkin()` (RPC)
  and `logVisitBooking()`'s linked-booking branch
  (`app/bookings/actions.ts`) — were verified directly (not assumed) to
  reliably populate it at check-in, which is what makes Check-Out safe.
  Two pre-existing partial unique indexes,
  `one_active_occupant_per_locker` and `one_active_occupant_per_room`
  (both `WHERE checked_out_at IS NULL`), are what make "active occupancy"
  well-defined.

## Not yet implemented — see roadmap

- No room-management UI (adding/deactivating individual rooms is done via
  Settings' Room/Bed count, not from Lockers/Call Sheet).
- No manual check-in UI from the Lockers page itself — check-in still only
  happens as a side effect of Log Visit / Quick Walk-in on the Bookings
  page, by design (out of scope for this phase, confirmed with the user).
