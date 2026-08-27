# Workflow

## Doc system usage

Any AI session on this repo should load `.ai/briefing.md` first, then route
to `.ai/current_state.md` for the specific module in play, then
`.ai/handoff.md` for what's actively in progress. `docs/architecture/*`
(this file, `system.md`, `rbac.md`) and `.ai/architecture_locks/` are for
architecture-level questions, not module behavior.

## Regression Guard Protocol

Consistent with the Approval & Regression Gate already in use on this
project: before making a change that touches an existing, working code
path (not a stub), auto-trigger a STOP and confirm with the user first if
any of the following are true:

- The change would alter or remove a DB-level invariant listed in
  `.ai/architecture_locks/ADR-001-nxs-spa-architecture.md` (ledger
  immutability trigger, GiST no-double-booking constraints, sales/ledger
  separation, codename-over-legal-name, RLS policy shape).
- The change touches `app/dashboard` or `app/clients` — the only two routes
  with real, currently-working behavior — in a way that could change what a
  user sees or what data is read, rather than purely additive work.
- The change modifies RLS policies, triggers, or constraints directly via
  SQL/migration rather than through the normal app code path.
- The change would make staff auth or RBAC enforcement partial/ad hoc
  (e.g. gating one page's UI without a real session layer) instead of the
  single coherent layer called for in `docs/architecture/rbac.md`.
- The task description and the actual repo/schema state disagree (e.g. a
  prompt assumes a feature, table, or policy exists and it doesn't) — stop
  and surface the discrepancy rather than silently building on the
  incorrect assumption.

When none of the above apply — new stub pages, new `docs/state/` content,
additive read-only features on already-stub routes — proceed without
stopping.

## Migration Files (mandatory going forward)

Starting from the retroactive baseline (`ohm#2m6x9j5f`,
`supabase/migrations/20260827130641_baseline_snapshot.sql`), every DB-layer
change — schema, RLS, triggers, functions — ships as its own migration file
in `supabase/migrations/`, committed in the **same commit** as the app code
that depends on it. Applying a change live-only and writing the migration
file after the fact is not acceptable, even for a "quick" additive column
or policy.

This is now a standing check in the Approval & Regression Gate: when a plan
involves a DB change, the plan must name the migration file path up front —
not just describe a smoke-test-then-apply-directly flow.

Generating a new migration file: hand-author it following the numbered/dated
naming convention already in `supabase/migrations/` (see
`docs/architecture/system.md` for where these live and how to generate
them), since this project is not yet CLI-linked to Supabase. If the project
gets linked (`supabase link`) in the future, prefer `supabase db diff` for
drafting the file instead of hand-authoring from scratch.
