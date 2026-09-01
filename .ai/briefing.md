# NXS Spa Portal — Briefing

Always load this file first in any AI session on this repo.

## Project

NXS Spa Portal: reception management console + client mobile app for a
male-only spa in Cubao, PH. This repo currently contains the reception
console (Next.js app). The client-facing mobile app is a separate,
not-yet-built surface referenced by the schema (client login fields, QR
tokens) but not present in this codebase.

## Tech stack

- Next.js (App Router, TypeScript, Tailwind) — see `node_modules/next/dist/docs/`
  for this project's Next.js conventions before writing code; this is not the
  Next.js you may know from training data.
- Supabase (Postgres 17), project ref `zqwiqrvqyinacjozubtc`, region ap-southeast-1.
- Vercel hosting (`vercel.json` present at repo root).
- Client access via `@supabase/ssr`: `lib/supabase/server.ts` (server components,
  cookie-based) and `lib/supabase/client.ts` (browser). Both use the anon key —
  reads are governed by RLS, not a service-role bypass.

## Locked architectural decisions

These are enforced in the live schema (verified directly against the
Supabase project, migrations `01`–`12`). Do not silently change any of these.
Full invariant list: [[nxs-architecture-locks]].

1. **Points Ledger is immutable/append-only, DB-trigger enforced.**
   `point_transactions` has `trg_block_ledger_update` and
   `trg_block_ledger_delete` (function `block_ledger_mutation()`) that reject
   any UPDATE or DELETE outright — not just app-level convention. Balance
   changes apply via `trg_apply_points_delta` (`apply_points_delta()`) on
   INSERT only. See [[points_ledger_state]].

2. **Bookings — DB-enforced no-double-booking via GiST exclusion constraints.**
   Two constraints on `bookings`: `no_double_book_room` and
   `no_double_book_therapist`, both `EXCLUDE USING gist (<resource> WITH =,
   tsrange(start_ts, end_ts) WITH &&)`, scoped to active statuses (`Booked`,
   `Completed`, `Needs Reassignment`). See [[bookings_state]].

3. **Sales — mutable, separate domain from the ledger.** `sales` is its own
   table (voidable, editable, has `edited_by`/`voided_by` audit columns) and
   is cross-referenced from `point_transactions` only via the optional
   `sale_id` FK. The two domains are never merged into one table or view.
   See [[sales_state]].

4. **Client privacy.** `clients.codename` is the only display identity in the
   schema — there is no legal-name column at all. `clients` has one
   `password_hash` column (single credential per client, consistent with
   one-device login intent, though nothing in the schema technically
   prevents concurrent sessions on that credential — enforcement would be
   app-level, not yet built). No "companion tagging" construct exists in the
   schema. See [[clients_state]].

5. **Staff Auth — complete (6A through 6C-6, `ohm#8r5m1v7z`, 2026-08-29).**
   Every route requires a real Supabase Auth session (`proxy.ts`); every
   `public` table's RLS is identity-keyed off `auth.uid() → staff.user_id →
   staff.position` via shared helpers (`is_staff()`,
   `is_supervisor_or_above()`, `is_owner()`, `current_staff_position()`) —
   no table has an open `USING (true)` policy left. There is no
   role-spoofing surface in the app (the "Simulate Staff" testing dropdown
   was removed in 6C-6 once real RLS made it redundant). Every actor
   attribution column (`action_logs.staff_id`, `sales.processed_by`,
   `bookings.created_by`, etc.) is populated from the real authenticated
   session. One related fix from the Core Loop step:
   `clients.points_balance` sync trigger (`apply_points_delta()`) is
   `SECURITY DEFINER`, since `clients` intentionally has no UPDATE policy
   for any role and the trigger's internal update would otherwise be
   blocked by RLS too — see [[points_ledger_state]]. Full per-table policy
   matrix: [[staff_state]]. RBAC reference: `docs/architecture/rbac.md`.

## Routing to more detail

- Module-by-module current behavior: `.ai/current_state.md` → `docs/state/*.md`
- Active sprint / in-progress: `.ai/handoff.md`
- Architecture docs: `docs/architecture/system.md`, `rbac.md`, `workflow.md`
- Compact invariant list: `.ai/architecture_locks/ADR-001-nxs-spa-architecture.md`

## Last Completed Tasks

(Newest on top, keep only 5.)

1. **2026-09-01 — Therapists — Add + Edit (Rename) RLS + Wiring**
   (`ohm#5v8n3ptc`, Prompt 2 of 3). Investigation phase re-confirmed live
   (not from the prompt's snapshot) that `therapists` still had exactly
   `public_select` + `staff_update` (no INSERT/DELETE), that
   `createTherapistAction`/`createTherapist()` still existed and was still
   silently RLS-rejected, and that `handleConfirmEdit` was still
   local-state-only, touching only the `name` field. Plan + regression risk
   assessment presented and approved before any code/migration was written,
   per the prompt's mandatory gate. Added `staff_insert`
   (`is_supervisor_or_above()`) to `therapists` — this alone fixes the
   already-broken `createTherapist()` insert, no client-side change needed
   for Add. Reused the existing `staff_update` policy (from Prompt 1) for
   rename, no new policy or column-level narrowing needed — confirmed no
   unique constraint on `therapists.name` (only the `id` PK) and confirmed
   the component's name-keyed `therapistIds`/`therapistMeta` maps aren't
   used as an identifier anywhere outside `therapist-browser.tsx`. New
   `updateTherapistName(therapistId, name, staffId)` server action now backs
   the Edit Name modal. See [[therapists_state]] and `.ai/handoff.md`.

2. **2026-09-01 — Therapists — Archive/Unarchive RLS + Real Persistence**
   (`ohm#7m2w9dxk`, Prompt 1 of 3). Investigation phase confirmed live
   (not from the prompt's snapshot) that `therapists` had no INSERT/
   UPDATE/DELETE RLS policy at all, and separately surfaced that Add
   Therapist was *not* the local-only stub the docs claimed — it already
   called a real `createTherapist()` insert that RLS was silently
   rejecting (a bug, deferred to Prompt 2). Plan + regression risk
   assessment presented and approved before any code/migration was
   written, per the prompt's mandatory gate — this prompt itself also
   got its own pre-implementation gate. Added `staff_update`
   (`is_supervisor_or_above()`) to `therapists`, no DELETE policy.
   `archiveTherapist()`/`unarchiveTherapist()` server actions now back
   the kebab menu's Archive/Unarchive; Archive's booking-flagging reuses
   `markAbsentToday`'s exact UPDATE shape with no date filter (permanent,
   unlike a one-day absence). `therapist_day_off`/`therapist_services`
   rows are untouched by archive/unarchive. See [[therapists_state]] and
   `.ai/handoff.md`.

3. **2026-09-01 — Docs Sync: Correct Stale Call Sheet Status** (`ohm#3k9r7fq2`).
   Documentation-only fix. `docs/state/bookings_state.md`'s "Not yet
   implemented" list claimed `app/call-sheet/page.tsx` was still an 8-line
   "Coming soon." stub — false and stale (also stale path; actual path is
   `app/(staff)/call-sheet/page.tsx`). Confirmed live the page is fully
   implemented (queries `locker_occupancy` joined to
   `services`/`bookings`/`therapists`, excludes Wet Area, renders via
   `components/call-sheet-browser.tsx`), matching what
   `docs/state/operations_state.md` already documented. Removed the stale
   bullet; no other bullet touched. No code, schema, or migration changed.

4. **2026-09-01 — Settings — 4-Tab Restructure + Capacity Stepper + Add-ons
   Save Button** (`ohm#9x3f7mq2`). Plan + regression risk assessment
   presented and approved before any code was written, per the prompt's
   mandatory gate. Two discrepancies caught by the mandatory investigate-first
   step: Lockers has no RLS UPDATE policy (add-only), so the `[−]` stepper
   button is disabled/grayed rather than wired to a new decrement path;
   Services (onBlur) and Promos (draft+Save) don't share one save pattern,
   so Add-ons was built to match Promos' explicit draft+Save since the
   prompt asked for a Save button. Settings restructured into 4 tabs
   (General / Services & Loyalty / Promos & Security / Scheduling &
   Capacity) using the tab-state pattern from `analytics-tabs.tsx`. No RBAC
   change, no migrations. See [[settings_state]] and `.ai/handoff.md`.

5. **2026-09-01 — Staff Archive + Owner-Managed Login Credentials**
   (`ohm#uox20nff`). Plan + regression risk assessment presented and
   approved before any code/migration was written, per the prompt's
   mandatory gate. Mid-implementation, confirmed live that switching login
   to username-based auth would have locked out all 8 existing staff
   accounts (including the only Owner) — stopped and got explicit approval
   before backfilling `username`/`auth.users.email` for those accounts
   rather than silently building over the discrepancy. `staff.active` is
   now the real archive-gating flag with audit columns mirroring
   `therapists`; archive/restore pairs a DB update with a Supabase Admin
   API `ban_duration` flip; Owner-set username+password provisioning via
   Admin API `createUser`; new self-service password-change view. See
   [[staff_state]] and `.ai/handoff.md` for full detail.

