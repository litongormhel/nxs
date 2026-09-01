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

## Last Completed Tasks
- ohm#3n8y5w1q — Call sheet: re-added "All" tab (pinned, opt-in) for total-count/shift-overview visibility; footer label + canvas export branch on timeFilter === "all"; Download JPEG hidden in All view
- ohm#7k2p9m4x — Call sheet: replaced "All Times" dropdown with data-driven scrollable time-slot tabs (sourced from availableSlots/sortSlotTimes, not hardcoded); added Thera column (Locker/Room/Service/Thera); default tab = nearest upcoming slot

1. **2026-09-01 — Staff Archive + Owner-Managed Login Credentials**
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

3. **2026-09-01 — Sale Void — Owner-Set 6-Digit Authorization Code**
   (`ohm#6f3p8dxn`, supersedes `ohm#8m2k5vqz` — email+password step-up was
   drafted but never implemented). Plan + regression risk assessment
   presented and approved before any code/migration was written, per the
   prompt's mandatory gate. Two void paths now: Supervisor/Owner void
   directly (no code, DB trigger widened this prompt from Owner-only to
   Supervisor-or-above after a live discrepancy check); everyone else goes
   through a shared Owner-set 6-digit code + Supervisor/Owner-authorizer
   step-up (`void_sale_with_code()`, `SECURITY DEFINER`, 3-fail/5-minute
   per-initiator lockout). Two critical DB-interaction findings surfaced
   and resolved before/during coding — see [[sales_state]],
   [[settings_state]], `docs/architecture/rbac.md`, and `.ai/handoff.md`
   for full detail.

4. **2026-09-01 — Promo Codes — Remove Hardcoded Fallback, Owner-Only
   Enforcement, Explicit Save** (`ohm#3n7x9kwp`). Plan + regression risk
   assessment presented and approved before any code/migration was
   written, per the prompt's mandatory gate. Hardcoded fallback promos
   array removed (explicit empty-vs-error UI instead); promo create/edit/
   delete restricted to Owner only at both the UI gate and real
   server-side + RLS enforcement (was Supervisor-or-above at all three
   layers); discount edits now use per-row draft state with explicit
   Save/Cancel instead of auto-save-on-blur. See [[settings_state]] and
   `.ai/handoff.md` for full detail.

5. **2026-09-01 — Member QR — Reception Scan + Prefill Into Log Visit /
   Quick Walk-in (7B-2 of 2)** (`ohm#7q4d8vnw`). Plan + regression risk
   assessment presented and approved before any code was written, per the
   prompt's mandatory gate. Phase 7B (Member QR, 7B-1 + 7B-2) is now
   complete end-to-end: reception scans a client's Member QR
   (`resolveMemberQr()`, new `jsqr`-based scan modal), which hands off into
   the existing `LogVisitModal`/`QuickWalkinModal` flows pre-filled and
   client-locked — no new write logic, no changes to points/ledger. See
   [[client_portal_state]] and `.ai/handoff.md` for full detail.

