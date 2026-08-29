# Operations (Lockers / Rooms / Call Sheet) — Current State

## Implemented (DB level)

- `public.rooms`: `number` (PK-like), `active`.
- `public.lockers`: `number`, `active`.
- `public.locker_occupancy`: check-in/check-out tracking — `locker_number`,
  `room_number`, `service_id`, `client_id`, `guest_label`, `checked_in_at`/
  `checked_in_by`, `checked_out_at`/`checked_out_by`.

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
