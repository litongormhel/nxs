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

5. **Staff Auth — intentionally deferred; RLS state as of Core Loop
   (`ohm#7f3k9d2m`, 2026-08-27):** RLS is enabled (`ENABLE ROW LEVEL
   SECURITY`) on every `public` table. Public SELECT policies exist on
   `lockers`, `rooms`, `services`, `therapists` (pre-existing), plus
   `clients`, `staff`, `point_transactions` (added by Core Loop, all
   `USING (true)`). Public INSERT-only policies exist on
   `point_transactions`, `sales`, `action_logs` (added by Core Loop,
   `WITH CHECK (true)`) — deliberately no SELECT on `sales`/`action_logs`
   (nothing reads them from the app yet) and no UPDATE/DELETE anywhere.
   Every other table — `bookings`, `promos`, `addons`, `sale_addons`,
   `locker_occupancy`, the `therapist_*` tables — still has no policies at
   all: default-deny for `anon`/`authenticated`. **This is additive, not a
   re-open**: each policy was scoped to exactly what a Core Loop read/write
   needed, decided explicitly with the user rather than assumed. One
   related fix: `clients.points_balance` sync trigger
   (`apply_points_delta()`) had to be made `SECURITY DEFINER`, since
   `clients` intentionally has no UPDATE policy for `anon` and the trigger's
   internal update was otherwise silently blocked by RLS too — see
   [[points_ledger_state]]. Action Logs use a placeholder-actor dropdown in
   the interim (staff picked from a list, not an authenticated session),
   now actually built — see [[staff_state]] and [[logs_state]].

## Routing to more detail

- Module-by-module current behavior: `.ai/current_state.md` → `docs/state/*.md`
- Active sprint / in-progress: `.ai/handoff.md`
- Architecture docs: `docs/architecture/system.md`, `rbac.md`, `workflow.md`
- Compact invariant list: `.ai/architecture_locks/ADR-001-nxs-spa-architecture.md`

## Last Completed Tasks

(Newest on top, keep only 5.)

1. **2026-08-29 — Staff Auth 6C-4: Settings/Catalog RLS (services, promos,
   addons, rooms, lockers, weekend_slots)** (`ohm#9d2k6y4p`). Fourth of six
   planned 6C sub-steps — reused 6C-2's role helpers as-is (`is_staff()`,
   `is_supervisor_or_above()`), no new helpers created. Closes the
   "app-level-only role gate" explicitly accepted when Settings persistence
   shipped (`ohm#5x1p8m3v`). Policy matrix was presented and approved before
   any SQL was written, per the prompt's mandatory gate.
   **One real discrepancy caught by reading `settings-browser.tsx` directly,
   not assumed from the prompt's "already locked in the UI" framing**: only
   Services and Promos actually had a UI role lock (`canEditServices`/
   `canEditPromos`) — Add-ons, Weekend Slots, Lockers, and Rooms/Beds had no
   UI lock at all, so any role could click Add/Delete/edit those four
   sections pre-6C-4. Flagged and confirmed with the user before
   implementing: added matching UI locks (new shared `canEditCatalog` flag,
   same pattern as the existing two) alongside the RLS migration, so Front
   Desk sees disabled controls instead of hitting a DB rejection.
   **Policy matrix, all six tables**: SELECT = `is_staff()`; INSERT/UPDATE =
   `is_supervisor_or_above()`; no DELETE policy except `weekend_slots`
   (`staff_delete`, `is_supervisor_or_above()`, real hard DELETE — confirmed
   via a live FK scan that nothing references it). `lockers` has no UPDATE
   policy (add-only, never updated); `services`/`promos`/`addons`/`rooms`
   have no DELETE policy (all four still FK-referenced by historical rows —
   soft-delete/deactivate via UPDATE stays correct, confirmed live).
   **Migration**
   (`supabase/migrations/20260829150000_settings_catalog_rls.sql`),
   smoke-tested via a rolled-back transaction simulating `auth.uid()` as
   anon, Ana (Front Desk), Diego (Supervisor), and J. Cruz (Owner) across
   all six tables (18 checks total) — confirmed anon and Ana are blocked on
   every INSERT/UPDATE/DELETE while retaining SELECT, Diego and Owner
   succeed on every table — before applying live via `apply_migration`.
   Live policies read back afterward and confirmed to match exactly.
   Regression-tested end-to-end via real logins (not Simulate Staff):
   logged in as Ana — Settings correctly showed the new read-only notice
   and disabled controls (including numeric inputs, confirmed via DOM
   inspection) on all four newly-gated sections, in addition to the
   pre-existing Services/Promos lock. Logged in as Diego — all six sections
   showed enabled controls; a live Add Weekend Slot succeeded end-to-end
   through the real UI (`"1:37 PM added to weekend slots"`, confirmed
   inserted via SQL), proving the DB-level policy actually permits a real
   Supervisor session, not just the smoke test. Delete's `window.confirm()`
   was auto-dismissed by this browser tool (same known limitation
   documented since the Operations Phase, `ohm#9h4c7x2m`) so the test slot
   was removed directly via SQL instead — not treated as unverified, since
   the identical DELETE path was already proven in the rolled-back
   transaction smoke test. No server or console errors at any tier.
   **Next**: 6C-5 (Staff/Logs RLS) and 6C-6 (removing Simulate Staff)
   remain, tracked in `.ai/handoff.md`.
2. **2026-08-29 — Staff Auth 6C-3: Bookings + Locker Occupancy RLS**
   (`ohm#3f7n9c1k`). Third of six planned 6C sub-steps — reused 6C-2's role
   helpers as-is (`is_staff()`, `is_supervisor_or_above()`, `is_owner()`,
   `current_staff_position()`), no new helpers created. Policy matrix and
   the status-transition role-restriction question were presented and
   approved before any SQL was written, per the prompt's mandatory gate:
   the user picked "all staff, no restriction" for both `bookings` and
   `locker_occupancy` (unlike Sales Void, which stays Owner-only per 6C-2 —
   confirmed this is a `sales`-only rule, not a `bookings` one).
   **`bookings`**: `staff_select`/`staff_insert`/`staff_update` all
   `is_staff()`-gated, replacing the old `public_select`/`public_insert`
   pair. **One real gap closed, not just re-scoped**: `bookings` previously
   had no UPDATE policy at all (default-deny), so `updateBookingStatus()`
   (the No-show/Cancel buttons wired in the Bookings correction phase) was
   silently affecting 0 rows under RLS — confirmed live via `pg_policies`
   before writing the migration, not assumed from the docs. This migration
   is what makes status transitions actually work end-to-end for the first
   time, not merely re-gate an existing path. No DELETE policy — bookings
   are never hard-deleted. **`locker_occupancy`**: `staff_select`/
   `staff_insert`/`staff_update` all `is_staff()`-gated, replacing the prior
   `public_*` policies (Check-Out already had an UPDATE policy from the
   Operations phase; this just re-scopes it to real staff identity). No
   DELETE policy. **Migration**
   (`supabase/migrations/20260829140000_bookings_locker_occupancy_rls.sql`),
   smoke-tested via a rolled-back transaction simulating `auth.uid()` as
   anon, Ana (Front Desk), Diego (Supervisor), and J. Cruz (Owner) —
   confirmed anon sees/inserts nothing on both tables, Ana can select/
   insert/cancel a booking, the GiST exclusion constraints
   (`no_double_book_room`/`no_double_book_therapist`) still correctly
   blocked a conflicting insert under the new policies, and Diego/Owner
   can check a locker in and out — before applying live via
   `apply_migration`. Live policies read back afterward and confirmed to
   match exactly. Regression-tested end-to-end via real logins (not
   Simulate Staff): logged in as Ana — New Booking succeeded (actor
   attribution correctly showed "Ana · Receptionist"), Cancel on that same
   booking succeeded (confirmed live via SQL: status flipped to
   `Cancelled`, previously would have silently no-op'd), Locker Board
   Check-out succeeded. Logged in as Diego — Call Sheet loaded correctly
   (3 active massages), `quick_walkin()` RPC succeeded end-to-end via a
   rolled-back-transaction substitution (booking + sale + locker_occupancy
   all inserted) after hitting the same pre-existing Browser-pane
   limitation from 6C-2 (native `<select>` changes not propagating to
   React state — unrelated to RLS, not a regression). Logged in as J. Cruz
   (Owner) — Locker Board Check-out succeeded, Owner-only nav
   (Analytics/Staff/Logs) correctly present. No server or console errors
   at any tier. One harmless test artifact left in place, matching the
   "bookings are never hard-deleted" invariant: a `Cancelled` booking
   (`guest_label = "RLS Smoke TestRLS Smoke Test"`) from the live browser
   test — inert, excluded from active-status lists. **Next**: 6C-4 and
   6C-5 (RLS for `staff`/`action_logs` attribution and the Settings/Catalog
   domain) and 6C-6 (removing Simulate Staff) remain, tracked in
   `.ai/handoff.md`.
3. **2026-08-29 — Staff Auth 6C-2: Role Helper Functions + Core Loop RLS
   (clients, point_transactions, sales)** (`ohm#5m8t2x6b`). Second of six
   planned 6C sub-steps — first real RLS lockdown step (6C-1 was routes
   only, no RLS). Helper-function shape, the policy-per-table-per-operation
   matrix, and the Sales edit-vs-void granularity decision were all
   presented and approved before any SQL was written, per the prompt's
   mandatory gate; the void granularity question (single policy vs.
   RLS+trigger) was explicitly flagged rather than guessed, and the user
   picked the RLS+trigger option. **New role helpers** (reused as-is by
   6C-3 through 6C-5): `current_staff_position()` (`SECURITY DEFINER`,
   resolves `auth.uid() → staff.user_id → staff.position`, returns null
   gracefully with no session), `is_staff()`, `is_supervisor_or_above()`,
   `is_owner()`. **`clients`**: `staff_select`/`staff_insert` replace the
   old `public_select`-only policy — SELECT/INSERT now require
   `is_staff()`; confirmed no UPDATE policy is needed (no editable client
   field exists in the app; `points_balance` stays ledger-trigger-only).
   **`point_transactions`**: `staff_select`/`staff_insert` replace
   `public_select`/`public_insert`, both now `is_staff()`-gated; no
   UPDATE/DELETE policy, unchanged (the block triggers are the only
   enforcement). **`sales`**: `staff_select`/`staff_insert` now
   `is_staff()`-gated; `staff_update` now requires
   `is_supervisor_or_above()` (was `USING(true)`); a new
   `trg_block_void_by_non_owner` trigger additionally blocks flipping
   `voided` unless `is_owner()`, giving the Owner-only void rule real
   DB-level enforcement on top of the Supervisor+ RLS floor. **One
   real discrepancy caught by reading the live function bodies before
   writing policy, not assumed**: `log_visit()`/`quick_walkin()` are
   `SECURITY INVOKER`, not `DEFINER` — they run as the calling session's
   role, so the new INSERT policies had to actually pass for an
   authenticated staff caller, not just an app-level abstraction; verified
   directly rather than assumed. **Migration**
   (`supabase/migrations/20260829000000_role_helpers_and_core_loop_rls.sql`),
   smoke-tested via a rolled-back transaction simulating `auth.uid()` as
   anon, Ana (Front Desk), Diego (Supervisor), and J. Cruz (Owner) —
   confirmed anon sees/inserts nothing, Front Desk sees but can't edit
   sales, Supervisor can edit but not void, Owner can void — before
   applying live via `apply_migration`. Regression-tested end-to-end via
   real logins (not Simulate Staff): Log Visit earn case confirmed live in
   the browser as Ana (28→33 pts); redemption and redemption-with-upgrade
   cases confirmed via the same `log_visit()` RPC path in a rolled-back
   transaction as Diego/Owner respectively, after a UI-automation
   limitation (this Browser pane's native `<select>` changes don't
   propagate to this app's React state, a pre-existing tooling gap
   unrelated to RLS) made driving those two cases through the actual
   dropdown unreliable; Sales Edit confirmed live as Diego and reverted
   live as Owner; Sales Void's `window.confirm()` is auto-dismissed by
   this browser tool (same known limitation noted in the Operations
   Phase handoff) so the click-through itself wasn't drivable, but the
   identical UPDATE path was proven live via Edit and the void trigger
   was independently smoke-tested (Diego blocked, Owner allowed).
   Regression-checked Dashboard/Clients/Staff/Bookings — all load with no
   console errors, and nav/role gating is unchanged. **Next**: 6C-3
   through 6C-5 (RLS for the remaining domains, reusing these same helper
   functions) and 6C-6 (removing Simulate Staff) remain, tracked in
   `.ai/handoff.md`.
4. **2026-08-29 — Staff Auth 6C-1: Protected Routes / Middleware (No RLS
   Changes Yet)** (`ohm#1q6w3e9r`). First of six planned 6C sub-steps
   (6C-1 through 6C-6) — a "soft" step confirming session/redirect
   mechanics in isolation before RLS enforcement lands in 6C-2 through
   6C-5. Context loaded first (`.ai/briefing.md`, `.ai/handoff.md`,
   `docs/state/staff_state.md`, ADR-001's Staff Auth section,
   `app/login/page.tsx`/`app/login/actions.ts` read-only, a full `app/`
   route enumeration), then a plan (matcher config, redirect logic,
   redirect-intent scope) presented and approved before implementation,
   per the prompt's mandatory gate. **One breaking-change discrepancy
   caught by reading the framework docs first, not assumed from prior
   Next.js knowledge**: this project's Next.js version (16) has
   deprecated `middleware.ts` and renamed the convention to `proxy.ts`
   (export `proxy` instead of `middleware`) — functionally identical,
   confirmed via `node_modules/next/dist/docs/.../proxy.md`, so the new
   file was written as `proxy.ts` at the repo root rather than the
   prompt's literal `middleware.ts` filename. **`proxy.ts`** (new): uses
   `@supabase/ssr`'s `createServerClient` directly against
   `NextRequest`/`NextResponse` (a third cookie adapter alongside the
   existing `lib/supabase/server.ts`/`lib/supabase/client.ts`, per
   Supabase's documented proxy/middleware pattern — not a reuse of
   either, since both are typed for their own contexts), calls
   `supabase.auth.getUser()` to force a session refresh. No session +
   path ≠ `/login` → redirect to `/login?next=<original path>`; session +
   path === `/login` → redirect to `/dashboard`; matcher excludes
   `_next/static`, `_next/image`, and standard metadata files (favicon,
   sitemap, robots) per the docs' negative-lookahead pattern, covering
   every other route including Server Action POSTs on those routes.
   **Redirect-intent preservation built in** (confirmed with the user as
   the straightforward option, not skipped): `app/login/actions.ts`'s
   `login()` now reads a `next` form field (validated via a
   `safeNextPath` guard against open-redirect payloads — must start with
   `/`, not `//`) and redirects there instead of hardcoding `/dashboard`;
   `app/login/page.tsx` carries the `?next=` query param through as a
   hidden form field. **No RLS changes, no removal of Simulate Staff,
   no role-based route restriction** — exactly per scope; `ownerOnly`
   nav/page-guard remains the sole role gate. Verified live in the
   browser (`npx tsc --noEmit` passes clean, not relied on alone):
   unauthenticated `/dashboard` correctly redirected to
   `/login?next=%2Fdashboard`; logged in as Ana (Receptionist) →
   redirected back to `/dashboard` (not just always `/dashboard`),
   sidebar/nav gating unchanged, `/staff` still correctly blocked by the
   existing Owner-only page guard (proxy only gates session presence, not
   role); visiting `/login` again while signed in correctly bounced to
   `/dashboard`; signed out → correctly bounced back to `/login`; logged
   in as J. Cruz (Owner) → reached every route including Staff/Logs with
   no server or console errors. **Next**: 6C-2 through 6C-5 (RLS
   enforcement, one domain at a time) and 6C-6 (removing Simulate Staff)
   remain, tracked in `.ai/handoff.md`.
5. **2026-08-29 — Staff Auth 6B-Addendum: Logout Button + Fully Automatic
   Actor (Remove Staff Dropdowns from Modals)** (`ohm#6y1d4h8m`). Precursor
   to 6C, not 6C itself — no RLS changes, no protected routes. Context
   loaded first (`.ai/briefing.md`, `.ai/handoff.md`,
   `docs/state/staff_state.md`, `lib/staff-context.tsx`), then a repo-wide
   enumeration of every staff-select dropdown before writing any code, per
   the prompt's mandatory approval gate. **Enumeration confirmed exactly
   the 3 modals 6B had already found** (`log-visit-modal.tsx`,
   `booking-form-modal.tsx`, `quick-walkin-modal.tsx`) — no others exist;
   `staff-browser.tsx`'s Add Staff modal `<select>` is a Position field,
   not an actor picker, and `settings-browser.tsx`'s `<select>` is
   Simulate Staff itself, explicitly out of scope. Plan (enumerated list +
   logout placement) presented and approved before implementation. **Actor
   dropdowns removed**: each modal's local `staffId` `useState` (which 6B
   had seeded from `sessionStaff?.id ?? staff[0]?.id` but left editable)
   is now a plain derived value — `const actor = sessionStaff ?? staff[0]`
   — with the `<select>` replaced by a read-only `<div>` showing
   `{actor.name} · {actor.position}`. The underlying value/fallback logic
   is byte-for-byte the same as 6B established (deliberately not changed
   to `selectedStaffId`/Simulate-Staff-context, to avoid inventing a new
   pattern); only the editability was removed. **Logout button**:
   `components/sidebar.tsx` gained a persistent account block at the
   bottom, below the nav list — reads `sessionStaff`/`currentStaff`/
   `currentRole` from `useStaffSim()` (no new context fields needed).
   Session present: shows `{currentStaff.name} · {currentRole}` plus a
   "Sign out" button wired to the existing `logout()` server action from
   `app/login/actions.ts` (reused as-is, no duplicate sign-out logic). No
   session: shows a "Log in" link to `/login`. **No removal of Simulate
   Staff** — untouched, still the sole driver when logged out, per
   explicit scope. Verified live in the browser (`npx tsc --noEmit`
   passes clean, not relied on alone): logged out — sidebar showed "Log
   in", all three modals showed no dropdown but a resolved
   Simulate-Staff-driven actor label; logged in as Ana (Receptionist) —
   sidebar showed "Ana · Front Desk" + working Sign Out, Log Visit / New
   Booking / Quick Walk-in modals all showed the read-only "Ana ·
   Receptionist" label with no editable control; signed out again and
   confirmed clean revert to the Simulate Staff–driven state. No server
   or console errors. **Next**: 6C (protected-route middleware + RLS
   lockdown, including neutralizing Simulate Staff at the DB level)
   remains, tracked in `.ai/handoff.md`.
