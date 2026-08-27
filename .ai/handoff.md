# Handoff — Active Sprint

Not a history log — see `.ai/briefing.md` → "Last Completed Tasks" for that.
This file tracks only what's in flight right now.

## In progress

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
