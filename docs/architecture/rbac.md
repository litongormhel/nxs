# RBAC — Design Target (Not Yet Enforced)

Everything in this file describes the **intended** role model. None of it
is wired up in application code or keyed into RLS policies yet — there is
no login/session flow in the app at all as of 2026-08-27. Treat this as a
target to build toward, not current behavior.

## Roles

Sourced from the live `staff_position` enum (the only role-shaped construct
that currently exists in the schema):

- `Receptionist`
- `Attendant`
- `Supervisor`
- `Owner`
- `Others`

The prompt's three-tier framing (Front Desk / Supervisor / Owner) maps
loosely onto this enum as a simplification, but the schema itself already
has five values, not three. Any RBAC design work should reconcile against
the actual enum rather than the simplified framing.

## Current reality vs. target

| Aspect | Target | Current |
|---|---|---|
| Login | Staff authenticate individually | No auth flow exists in the app |
| Session → actor | `action_logs.staff_id` set from session | Set via placeholder dropdown (manual staff pick) — built for Log Visit as of `ohm#7f3k9d2m`; no Logs *viewer* UI yet, see `docs/state/logs_state.md` |
| RLS policy scoping | Policies keyed off authenticated staff role/id | RLS enabled table-wide; 7 tables have a policy (`lockers`/`rooms`/`services`/`therapists` public-read, plus `clients`/`staff`/`point_transactions` public-read and `point_transactions`/`sales`/`action_logs` public-insert added by `ohm#7f3k9d2m`, scoped to exactly what Core Loop needed); nothing is role-keyed and no table has an UPDATE/DELETE policy |
| Route protection | Role-gated pages/actions per `staff_position` | No route protection exists — every page under `app/` is reachable without auth |

## Why deferred

Per project decision, staff auth is intentionally being built last in the
roadmap so the core operational domains (ledger, bookings, sales) can be
validated against real DB-level invariants first. Do not front-run this by
adding ad hoc auth checks to individual pages — when it lands it should be
a single coherent layer (middleware + RLS policies + `loginable_staff`
view), not scattered per-page guards.
