# Logs — Current State

## Implemented (DB level)

`public.action_logs`: `id`, `staff_id` (FK → `staff`/`loginable_staff`, not
null), `action` (not null), `detail` (nullable), `created_at`.

## Implemented (app level, Core Loop `ohm#7f3k9d2m`)

- First writer: `public.log_visit(...)` (see [[points_ledger_state]])
  inserts one `action_logs` row per Log Visit submission — `action =
  "log_visit"`, `staff_id` = the staff picked in the modal's
  placeholder-actor dropdown (the interim pattern this file previously
  described as planned-but-not-built; it is now built — see
  [[staff_state]]), `detail` a formatted summary (client id, service,
  redemption flag, amount, sale id).
- RLS: `anon` has an `INSERT`-only policy (`public_insert`,
  `WITH CHECK (true)`) — no SELECT policy, since there is still no log
  viewer UI to read it back.

## Not yet implemented — see roadmap

- `app/logs/page.tsx` is an 8-line stub. No log viewer UI, and no SELECT
  policy exists yet for one to read through as `anon`.
