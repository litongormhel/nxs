# Logs — Current State

## Implemented (DB level)

`public.action_logs`: `id`, `staff_id` (FK → `staff`/`loginable_staff`, not
null), `action` (not null), `detail` (nullable), `created_at`.

**RLS lockdown (`ohm#4t8w2j6q`, Staff Auth 6C-5, 2026-08-29)**:
`action_logs` now has role-keyed policies replacing the old
`public_select`/`public_insert` (`USING`/`WITH CHECK (true)`) pair.
`action_logs_select` — `is_owner()` (matches the Owner-gated Activity
Logs page). `action_logs_insert` — `is_staff()` (written from nearly
every mutating flow across the app — Log Visit, Bookings, Sales
edit/void, Settings, Staff add — by any logged-in staff member, so this
must stay broad). No UPDATE/DELETE policy — this table has no mutation
UI, by design (append-only action trail), and this is now DB-enforced,
not just a UI convention — verified even Owner gets a silent 0-row no-op
on UPDATE/DELETE attempts, not a real permission.

## Implemented (app level)

- Writers (one row per mutation, across every phase since Core Loop):
  `log_visit`, `quick_walkin`, `settings_add_service`,
  `settings_update_service_price`, `settings_update_service_points`,
  `settings_delete_service`, `settings_add_promo`,
  `settings_update_promo_discount`, `settings_delete_promo`,
  `settings_add_weekend_slot`, `settings_delete_weekend_slot`,
  `settings_add_addon`, `settings_update_addon_price`,
  `settings_delete_addon`, `settings_add_lockers`,
  `settings_update_room_count`, and — new in `ohm#3z8k1p6d` —
  `staff_add`. As of Staff Auth 6B/6C-6, `staff_id` on every row is the
  real authenticated staff member (`sessionStaff.id` from
  `lib/staff-context.tsx`) — no placeholder picker or Simulate Staff
  fallback remains.
- **Activity Logs tab** (`app/logs/page.tsx`, `components/logs-browser.tsx`,
  `ohm#3z8k1p6d`) — first reader of this table. Server-fetches
  `action_logs` ordered `created_at desc` with a flat `LIMIT 500` (current
  volume: a few dozen rows across every phase since Core Loop — revisit
  with real pagination if growth makes 500 a meaningful cap; no pagination
  UI exists yet). Staff names are joined in app code (a separate `staff`
  fetch mapped by `staff_id`), not via a PostgREST embedded select —
  `action_logs.staff_id` carries two FKs in the generated types (to
  `staff` and to the `loginable_staff` view over the same table), which
  makes embedding ambiguous without an explicit FK-name hint.
- **Filters** (Action / Date / Staff, all combinable, client-side):
  Action and Staff dropdown options are derived from **distinct values
  actually present in the fetched rows** — not a hardcoded action list —
  so the Action filter only ever shows actions that have really occurred.
- **Owner-only**: hidden from nav (`lib/nav.ts`'s `ownerOnly` flag,
  gated by `currentRole` from `lib/staff-context.tsx`) and the page
  itself renders a blocking message if visited directly by URL as a
  non-Owner role.
- Read-only — no mutation capability from this tab.

## Not yet implemented — see roadmap

- No pagination — a flat `LIMIT 500` is used; fine at current volume, not
  designed to scale past it.
- Access control is enforced at both tiers — the Owner-only nav/page
  gate stays app-level (`lib/nav.ts`, `currentRole`), and as of 6C-5 the
  underlying `action_logs` SELECT is also real RLS (`is_owner()`), not
  just a UI convention. There is no role-spoofing surface left in the app
  (Simulate Staff was removed in 6C-6).
