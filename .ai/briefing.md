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

1. **2026-09-01 — Client Portal — Auth Hardening: Rate Limiting + Session
   Secret Separation** (`ohm#5t2m8qz1`). Addresses audit `ohm#9k3v7bx2`'s
   High #1 (no brute-force protection on `/portal/api/login`) and High #2
   (portal session HMAC secret reused `SUPABASE_SERVICE_ROLE_KEY`). Plan +
   regression risk assessment presented and approved (thresholds approved
   as proposed) before any code/migration was written, per the prompt's
   mandatory gate. New `portal_login_attempts` table (generic
   counter/lockout, mirrors `sale_void_attempts`'s RLS-enabled-zero-policy
   convention) backs dual-key lockout on login (`ident:` 5/15min, `ip:`
   20/15min, checked before password verification) and lighter IP-only
   throttling on `check-username`/`register` (30 calls/2min cooldown).
   `lib/portal/session.ts` now signs with a dedicated `PORTAL_SESSION_SECRET`
   env var instead of the service-role key — confirmed via repo-wide grep
   no other file reused the service-role key for non-DB purposes. **Known
   accepted regression**: all currently-active portal sessions are
   invalidated by the key change (live row count was 1). **Outstanding**:
   `PORTAL_SESSION_SECRET` must still be set in Vercel Production + Preview
   manually — no Vercel env-write tool was available this session. See
   [[client_portal_state]] and `.ai/handoff.md`.

2. **2026-09-01 — Therapists — Services Offered RLS + Wiring**
   (`ohm#9q4x1mwr`, Prompt 3 of 3, closes the "Therapist Roster —
   Investigate & Wire" sequence). Investigation surfaced that the prompt's
   premise didn't match live code: `handleToggleService` was genuinely
   local-state-only as expected, but there was no "Services Offered"
   section on the therapist card at all — it was never called from any
   JSX (only the separate, still-local Add Therapist modal picker rendered
   service pills). Also surfaced `Scrub` is a real `services` row but
   `active: false` live. Both flagged and resolved via explicit user
   choice before any code was written: build the missing card section;
   proceed with `Scrub` as-is. Added `staff_select`/`staff_insert`/
   `staff_delete` (`is_staff()`/`is_supervisor_or_above()`) to
   `therapist_services` — had **no policies at all**, so 26 pre-seeded
   rows were previously unreadable. New "Services Offered" pill section on
   each card, wired to new `toggleTherapistService(therapistId, serviceId,
   offering, staffId)` server action mirroring `toggleDayOff`'s shape.
   Page fetch now seeds initial services state via a new `services`/
   `therapist_services` join, resolved through a `serviceIdMap` in the
   component. See [[therapists_state]] and `.ai/handoff.md`.

3. **2026-09-01 — Therapists — Add + Edit (Rename) RLS + Wiring**
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

4. **2026-09-01 — Therapists — Archive/Unarchive RLS + Real Persistence**
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

5. **2026-09-01 — Docs Sync: Correct Stale Call Sheet Status** (`ohm#3k9r7fq2`).
   Documentation-only fix. `docs/state/bookings_state.md`'s "Not yet
   implemented" list claimed `app/call-sheet/page.tsx` was still an 8-line
   "Coming soon." stub — false and stale (also stale path; actual path is
   `app/(staff)/call-sheet/page.tsx`). Confirmed live the page is fully
   implemented (queries `locker_occupancy` joined to
   `services`/`bookings`/`therapists`, excludes Wet Area, renders via
   `components/call-sheet-browser.tsx`), matching what
   `docs/state/operations_state.md` already documented. Removed the stale
   bullet; no other bullet touched. No code, schema, or migration changed.

