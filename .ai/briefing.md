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

1. **2026-09-02 — Log Visit — Conditional Therapist Field** (`ohm#7n4k9wx3`).
   UI-only — no schema/writer/RLS changes. Plan + regression risk
   assessment presented and approved before any code was written, per the
   prompt's mandatory gate. `LogVisitModal`'s Therapist field reused the
   existing `linkedBooking` memo (the same condition driving the
   `Linked: [Name] · Room [X]` badge) to render read-only text
   (`therapists.find(t => t.id === linkedBooking.therapist_id)?.name`,
   falls back to `"— unassigned —"`) once a booking is linked via Find
   Booking search, instead of the always-editable dropdown — the
   therapist was already assigned at New Booking time and shouldn't be
   re-editable from Log Visit. Wet Area exemption (checked first) and the
   walk-in editable-dropdown path are both unchanged. No new state —
   `therapistId` is still populated by the existing `linkBooking()` call
   and is what's actually submitted to `logVisitBooking`, so the write
   path is untouched. `npx tsc --noEmit` clean. **Not verified live
   in-browser** — same recurring Windows preview-harness
   working-directory bug noted in prior entries (unrelated to this
   change). See [[bookings_state]] and `.ai/handoff.md`.

2. **2026-09-02 — Activity Logs — Human-Readable Detail Formatting**
   (`ohm#i35wdbgr`). Display-layer only — no writer/schema/RLS changes.
   New `lib/logs/format-detail.ts` (`formatLogDetail`) turns each row's
   raw `key=value` `detail` text into a human sentence, keyed off
   `action`; templates for 19 action types (the prompt's 17 confirmed-live
   plus 2 more found live during verification — `therapist_toggle_service`,
   `staff_archive`); any unmapped action falls back to the raw string
   (today's behavior), never a crash. Batched one-time-per-page-load joins
   (`therapists`/`services`/`addons`/`clients`/`locker_occupancy`) in
   `app/(staff)/logs/page.tsx`, with graceful fallback text for dangling
   ids. Two real bugs caught only by testing against live data (not the
   prompt's samples): (1) a naive space-split parser truncates multi-word
   values like "Combi Massage" — fixed to split on key boundaries instead;
   (2) `log_visit`'s direct-insert writer can put a raw guest-label string
   (not a UUID) in its `client=` field — detected via UUID-pattern test
   before attempting the join. `settings_update_room_count`'s
   `added=.../target=` semantics confirmed by reading the writer per the
   prompt's explicit instruction, not guessed from the sample. Filters
   (Action/Date/Staff) untouched — still operate on raw fields.
   `npx tsc --noEmit` clean; dry-run against the full live 95-row/19-action
   table via Supabase MCP showed zero bad output. **Not verified live
   in-browser** — same recurring Windows preview-harness
   working-directory bug as the prior entry (confirmed unrelated to this
   change: `npm run dev` runs cleanly from a direct terminal). See
   [[logs_state]] and `.ai/handoff.md`.

3. **2026-09-02 — Dashboard — Add Cancel Action to Needs Reassignment
   Cards** (`ohm#9d4k7m2x`). Plan + regression risk assessment presented
   and approved before any code was written, per the prompt's mandatory
   gate. Investigation surfaced the prompt's notes-append requirement
   ("reuse the existing notes-flagging pattern, e.g. 'No QR presented'")
   didn't match live code — `bookings` has no `notes` column at all, and
   no such append pattern exists anywhere in the repo. Flagged to Ohm;
   chose to drop the notes requirement entirely rather than add a `notes`
   column (would have violated the prompt's own "do not touch schema"
   rule). New `cancelReassignmentBooking(bookingId, staffId)` server
   action (`app/(staff)/bookings/actions.ts`), mirroring
   `changeBookingTherapist`'s guard/logging shape: rejects unless the
   booking is currently `Needs Reassignment`, updates `status =
   'Cancelled'` (existing enum value, no schema/enum change), logs one
   `action_logs` row (`cancel_reassignment_booking`, detail includes
   `reason=Client decided not to pursue`), revalidates `/bookings`,
   `/dashboard`, `/call-sheet`. `components/reassignment-panel.tsx` gained
   a "Cancel" button next to "Transfer" on each card plus its own confirm
   dialog (client/service/room/time) and state, fully independent of the
   Transfer button's state/handler/modal. No dashboard query change
   needed — it already filters on `status = 'Needs Reassignment'`, so a
   cancelled row disappears on the next fetch the same way a
   successfully-transferred one does. Follow-up prompt (`ohm#3p8v6k1r`)
   verified the Call Sheet page (`locker_occupancy`-driven, keyed off
   check-in state, never reads `bookings.status`) has no dependency on
   `Needs Reassignment` at all — a booking in that status was never
   check-in'd, so it was never on the call sheet to begin with; no bug,
   no change needed. `npx tsc --noEmit` clean. No branch was created (work
   done directly on `main`, uncommitted). **Not verified live in-browser**
   — the preview tool's `npm run dev` fails with "Missing script: dev"
   despite the script existing and running cleanly via a direct terminal
   `npm run dev`/`npm run` check; looks like a working-directory mismatch
   in the preview harness itself, not caused by this change (same class
   of recurring Windows preview-tooling gap noted in prior entries). See
   [[dashboard_state]] and `.ai/handoff.md`.

4. **2026-09-01 — RLS & Grant Tightening — sale_addons Insert Policy +
   apply_points_delta REST Exposure** (`ohm#7n4c1wp6`). Addresses audit
   `ohm#9k3v7bx2`'s Medium #3 (`sale_addons.public_insert` let any anon-key
   holder insert arbitrary rows via public REST) and Medium #6
   (trigger-only `apply_points_delta()` directly callable via
   `/rest/v1/rpc`). Plan + regression risk assessment presented and
   approved before any migration was written, per the prompt's mandatory
   gate — including the required check of `quick_walkin()`'s security
   context: confirmed live via `pg_proc` it is `SECURITY INVOKER`, but
   since its only caller always runs through the authenticated
   `@supabase/ssr` client, narrowing `sale_addons` to `is_staff()` doesn't
   break it (no "flag back" needed; verified end-to-end under an
   impersonated staff role). Replaced `sale_addons.public_insert` with
   `staff_insert`/`is_staff()` (matches `locker_occupancy`'s existing
   pattern); revoked `EXECUTE` on `apply_points_delta()` from `public,
   anon, authenticated` (trigger firing confirmed unaffected).
   `clear_own_must_change_password()`/`current_staff_position()` grants
   left untouched, as scoped. Re-ran Supabase security advisors — both
   findings clear. See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-01 — Client Portal — Auth Hardening: Rate Limiting + Session
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

