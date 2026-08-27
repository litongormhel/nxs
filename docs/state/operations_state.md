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

`rooms` and `lockers` both have public-read policies (`USING (true)`) —
these are two of only four tables with any public SELECT policy at all.

## Not yet implemented — see roadmap

- `app/lockers/page.tsx` and `app/call-sheet/page.tsx` are both 8-line
  stubs. No check-in/check-out UI, no room/locker management UI, no call
  sheet view exists yet. `locker_occupancy` is not read or written by any
  app code currently.
