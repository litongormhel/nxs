# Logs — Current State

## Implemented (DB level)

`public.action_logs`: `id`, `staff_id` (FK → `staff`/`loginable_staff`, not
null), `action` (not null), `detail` (nullable), `created_at`.

RLS: `anon` has both `INSERT` (`public_insert`, `WITH CHECK (true)`, added
by Core Loop) and `SELECT` (`public_select`, `USING (true)`, added by
`ohm#3z8k1p6d`) policies. No UPDATE/DELETE policy — this table has no
mutation UI, by design (append-only action trail).

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
  `staff_add`. `staff_id` on every row is the staff picked in whichever
  placeholder-actor dropdown was active for that action (Log Visit modal's
  own picker, or the shared Simulate Staff selection from
  `lib/staff-context.tsx`), never a real session.
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
- No real access control — the Owner-only gate is app-level only (see
  `docs/state/staff_state.md` and `.ai/handoff.md` session notes), not
  enforced by RLS or a real session.
