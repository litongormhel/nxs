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
  Filters operate on the raw `action`/`staff_name`/`created_at` fields,
  never on the formatted detail sentence below.
- **Human-readable detail formatting** (`ohm#i35wdbgr`, 2026-09-02) —
  display-layer only, no writer/schema/RLS change. `detail` is still
  stored as raw `key=value` text by every writer; `lib/logs/format-detail.ts`
  (`formatLogDetail(action, detail, lookups)`) parses it and renders a
  human sentence per `action`, with a small monospace secondary line for
  any `sale_id`/`booking_id`/`occupancy_id` (kept for audit trace, not
  removed). `parseDetail()` splits on **key boundaries**
  (`/(?:^|\s)([a-z_]+)=/g`), not spaces — a value can legitimately contain
  spaces (`service=Combi Massage`, `position=Front Desk`).
  `app/(staff)/logs/page.tsx` batch-fetches (once per page load, not
  per-row) only the id sets each present action type actually references,
  against `therapists`/`services`/`addons`/`clients`/`locker_occupancy`.
  19 action types have real templates (the 17 confirmed live at prompt
  time, plus `therapist_toggle_service`/`staff_archive` found live during
  verification); any other `action` value falls back to rendering the raw
  `detail` string unchanged, so a brand-new/rare action never crashes or
  shows `undefined`. Two writer-shape nuances the templates account for:
  `log_visit`'s two writers (`log_visit()` RPC vs. the direct-insert
  branch in `logVisitBooking()`) put different fields in `detail`, and the
  direct-insert one's `client=` value can be a client UUID **or** a raw
  guest-label string — detected via UUID-pattern test before attempting
  the `clients` join; `change_therapist`'s writer only logs fields that
  actually changed, so the therapist-change and time-change clauses are
  each independently optional in the rendered sentence.
- **Owner-only**: hidden from nav (`lib/nav.ts`'s `ownerOnly` flag,
  gated by `currentRole` from `lib/staff-context.tsx`) and the page
  itself renders a blocking message if visited directly by URL as a
  non-Owner role.
- Read-only — no mutation capability from this tab.

## Event types — convention, not a DB enum

`action_logs.action` is plain `text`, so "event types" are an app-level
convention, not a schema constraint — there is no enum to extend when a
new one is added.

- **`phone_number_revealed`** (Client Portal 7A-1, `ohm#7a1f9c2k`,
  2026-08-29) — reserved for when a staff member reveals a client's full
  phone number (default display is masked, last 4 digits only, per
  ADR-001). No schema change was needed or made. `staff_id` (revealing
  staff) and `created_at` (timestamp) use the table's existing columns;
  the target client id is expected to go in the nullable `detail` text
  column, matching how every other event type already encodes extra
  context. **No writer exists yet** — the actual reveal UI/action is a
  later Client Portal prompt; see [[client_portal_state]].

## Not yet implemented — see roadmap

- No pagination — a flat `LIMIT 500` is used; fine at current volume, not
  designed to scale past it.
- Access control is enforced at both tiers — the Owner-only nav/page
  gate stays app-level (`lib/nav.ts`, `currentRole`), and as of 6C-5 the
  underlying `action_logs` SELECT is also real RLS (`is_owner()`), not
  just a UI convention. There is no role-spoofing surface left in the app
  (Simulate Staff was removed in 6C-6).
