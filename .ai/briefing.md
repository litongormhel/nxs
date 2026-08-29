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

1. **2026-08-29 — Staff Auth 6C-2: Role Helper Functions + Core Loop RLS
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
2. **2026-08-29 — Staff Auth 6C-1: Protected Routes / Middleware (No RLS
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
2. **2026-08-29 — Staff Auth 6B-Addendum: Logout Button + Fully Automatic
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
3. **2026-08-29 — Staff Auth 6B: Real Session Wiring into staff-context +
   Actor Attribution** (`ohm#4p7v9k3s`). Second of the three-part plan
   (6A/6B/6C) — see `.ai/handoff.md`. Enumerated all 7
   `// TEMP: placeholder actor pending Staff Auth phase` sites and the
   product decision (not-logged-in fallback behavior) before writing any
   code, per the prompt's mandatory approval gate; both recommended
   options (fall back to Simulate Staff when logged out; auto-fill the 3
   independent modal staff-pickers from the real session but keep them
   editable) were confirmed by the user. **`lib/staff-context.tsx`**:
   `StaffSimProvider` now accepts an optional `sessionStaff` prop —
   `currentStaff`/`currentRole`/`selectedStaffId` prefer it over the
   Simulate Staff selection when present, falling back to exactly the
   prior Simulate-Staff-driven behavior when absent. Simulate Staff itself
   is untouched and stays fully functional as the logged-out mechanism.
   **`app/layout.tsx`**: resolves `auth.uid()` → `staff` row (via
   `user_id`, already-open `public_select` RLS policy covers
   `authenticated` too since it has no `to` clause) → passed down as
   `sessionStaff`. **Two call-site patterns found and handled
   differently**: most actor-attribution call sites (Settings, Sales,
   Lockers, Staff Directory) already sourced `staffId` from
   `staff-context`'s `selectedStaffId`, so fixing the context alone fixed
   them — no per-call-site change needed beyond deleting the now-stale
   TEMP comments. Three modals (`log-visit-modal.tsx`,
   `booking-form-modal.tsx`, `quick-walkin-modal.tsx`) had their own
   local, disconnected `staffId` `useState`/dropdown — each now
   initializes from `useStaffSim().sessionStaff?.id` first, falling back
   to the prior default, dropdown left in place as an editable override.
   **Settings UI**: the existing "Signed in" account card now reflects the
   real session when present (was always mirroring Simulate Staff before,
   mislabeled); the Simulate Staff selector is disabled with an inline
   note while a real session is active. All 7 TEMP comments removed.
   **No RLS/schema/middleware changes** — pages remain accessible without
   login, exactly per scope. Verified live in the browser (`npx tsc
   --noEmit` passes clean, not relied on alone): logged out → Settings
   showed "Simulated" and the Simulate Staff dropdown enabled, unchanged
   from pre-6B; logged in as Ana (Receptionist) → Settings showed
   "Ana / Receptionist · Front Desk / Signed in", Simulate Staff disabled,
   Front-Desk-correct read-only Settings gating, sidebar correctly hiding
   Staff/Logs (Owner-only nav); Log Visit modal's "Logged by" field
   auto-selected Ana instead of defaulting to the first staff member;
   signed out again → correctly reverted to Simulate Staff mode. **Next**:
   6C (protected-route middleware + RLS lockdown) remains, tracked in
   `.ai/handoff.md`.
4. **2026-08-29 — Staff Auth 6A: Auth Users + Basic Login** (`ohm#2k9m4w7p`).
   First of a three-part plan (6A/6B/6C) — see [[staff_auth_6a_6c_plan]] and
   `.ai/handoff.md` for sub-phase tracking. Scope was explicitly limited to
   auth account creation + login page + session handling only: **no RLS
   changes, no actor-attribution changes, no protected routes** — all
   deferred to 6B/6C. Plan (the 8-account list with email/password per
   tier) was presented and approved before any credentials were created,
   per the prompt's mandatory approval gate. **One real discrepancy
   surfaced and resolved with the user, not guessed past**: the prompt's
   locked decision #5 claimed `SUPABASE_SERVICE_ROLE_KEY` was already in
   `.env.local` — a direct read of the file showed only
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, no service
   key at all. Blocked and asked the user for it; the first key they
   pasted decoded (JWT payload) to project ref `rwxeluluyapjgaarlwkus`
   (a different project, "ohmployee") — caught before use, not sent to
   any API — the user then supplied the correct key for this project
   (`zqwiqrvqyinacjozubtc`, confirmed by decoding the payload before
   trusting it). **8 `auth.users` created** via a one-off local script
   (`@supabase/supabase-js` admin client, `auth.admin.createUser`,
   `email_confirm: true`) — not committed, deleted after running:
   Ana/Ben/Cathy/Jeff/Essem (Receptionist, `nxsrecep26`),
   Diego/Elena (Supervisor, `nxs.supervisor26`), J. Cruz (Owner,
   `nxs.owner26`), all `<firstname>@nxs.local` (J. Cruz → `jcruz@nxs.local`).
   Mika (Attendant) correctly excluded, matching the locked decision.
   Each new `auth.users.id` was written into the matching existing
   `staff.user_id` row via direct SQL — the existing nullable column,
   no migration needed. **Login page** (`app/login/page.tsx`,
   `app/login/actions.ts`, new): email/password form using
   `supabase.auth.signInWithPassword()` through the existing
   `lib/supabase/server.ts` SSR client (session cookies handled by
   `@supabase/ssr`'s own cookie adapter — no custom JWT/session code
   needed, matching the Next.js auth guide's own recommendation to use
   Supabase directly rather than hand-rolling session logic). Redirects
   to `/dashboard` on success, shows an inline error on failure. Visiting
   `/login` while already signed in shows "Signed in as [email]" with a
   Sign Out button (`logout()` server action, `supabase.auth.signOut()`,
   redirects back to `/login`) — this covers "session handling" without
   inventing a bespoke session table, consistent with `@supabase/ssr`
   already being the app's Supabase client pattern. **No existing code
   touched**: `lib/staff-context.tsx`/Simulate Staff, `lib/nav.ts`,
   `components/sidebar.tsx`, and all RLS policies are unchanged — the
   login page is purely additive and not yet wired to anything else in
   the app (by design, per the explicit 6A scope limit). Verified live in
   the browser (`npx tsc --noEmit` passes clean, but not relied on alone):
   logged in as Ana (Receptionist tier) and confirmed redirect to
   `/dashboard`; confirmed the session persisted across a full navigation
   to `/login`showing the signed-in state; signed out and confirmed return
   to the empty login form; logged in as Diego (Supervisor tier)
   successfully; confirmed a wrong password shows "Invalid email or
   password." inline instead of a raw error. Regression-checked Settings
   — Simulate Staff dropdown still fully functional (tested switching
   role, editing gated correctly) — confirming the two mechanisms remain
   fully independent per the explicit scope requirement. No server or
   console errors. **Next**: 6B (wiring real sessions into
   `lib/staff-context.tsx`/actor-attribution) and 6C (protected routes)
   remain, tracked in `.ai/handoff.md`.
