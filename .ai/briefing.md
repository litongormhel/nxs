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

1. **2026-08-29 — Staff Auth 6A: Auth Users + Basic Login** (`ohm#2k9m4w7p`).
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
2. **2026-08-28 — Analytics Phase: Owner-Only Reporting Dashboard
   (Spa-Day Bucketing)** (`ohm#7v2q8f5c`). Plan + regression assessment
   presented and approved before implementation, per the prompt's
   mandatory gate. Two discrepancies surfaced during context loading and
   resolved with the user rather than assumed: (1) no `nxs-spa-portal.html`
   mockup exists anywhere in the repo (same recurring gap as prior
   phases) — the prompt's own scope section (items 3-8) already fully
   specified every stat/ranking's logic, so the user chose to proceed
   from the prompt's spec alone rather than block on the file; (2) the
   prompt stated spa-day opens at 4:00 PM, but the only existing
   operating-hours definition in the codebase (`lib/bookings/slots.ts`,
   from the Bookings phase) is 4:30 PM open / 1:00 AM last call — the
   user confirmed aligning to 4:30 PM (cosmetic only: the rollover
   formula's 12:00 AM–3:59 PM window is unaffected either way, since
   nothing operationally happens 4:00–4:30 PM). **New canonical spa-day
   helper** (`lib/analytics/spa-day.ts`, first of its kind — confirmed no
   prior "operating day" concept existed via ADR-001 and a grep):
   `toSpaDay`/`toSpaMonth`/`spaDayNow`/`spaMonthNow`/`lastSpaDays`, all
   built on one formula (subtract 8 hours from the UTC instant, since
   Asia/Manila is a fixed UTC+8 offset with no DST — net equivalent of
   the documented "shift to Manila local, then roll back 12AM–3:59PM
   onto the prior date"), used by every bucketed stat/table so numbers
   stay consistent site-wide. **Analytics page**
   (`app/analytics/page.tsx`, real page replacing the 8-line stub;
   `components/analytics-browser.tsx`, new): Sales stat cards
   (Today/7-day/Month, non-voided `sales.amount` summed by spa-day/spa-
   month), Client Visits stat cards (same buckets, count of non-voided
   `sales` rows — confirmed `sales` alone is the correct, non-double-
   counting visit definition per the prompt), Most Availed Service
   (ranked count via `sales.service_id → services(name)`), Sales Per Day
   / Sales Per Month tables (amount + visit count, most recent first),
   Top Clients (ranked by non-voided spend, visit count,
   `clients.points_balance` read directly), Therapist Ranking (count of
   `bookings` with status Booked/Completed per therapist via
   `bookings.therapist_id`, archived therapists tagged "(Archived)").
   Read-only aggregation — no new mutation paths, no new RLS (confirmed
   `sales`/`bookings`/`clients`/`therapists` SELECT was already open from
   prior phases). **Owner-only gating reuses the exact existing
   `lib/staff-context.tsx` (`useStaffSim`/`currentRole`) mechanism** — no
   new gating pattern invented: `lib/nav.ts`'s `analytics` entry gained
   `ownerOnly: true` (previously the only nav item lacking it despite the
   page needing it — the Staff/Logs phase had explicitly left it
   untouched as out of scope then), plus the same page-level content
   guard pattern as Staff Directory/Activity Logs. Verified live in the
   browser (`npx tsc --noEmit` passes clean, but not relied on alone):
   confirmed the numbers (Today ₱0, Last 7 Days/This Month ₱3,300, 4
   visits) correctly reflect all 4 existing sales bucketing into
   yesterday's spa-day at the current pre-4:30-PM wall-clock time,
   matching the Sales tab's own ₱3,300 total independently; confirmed nav
   hiding and the page-level guard both correctly block Front Desk (Ana)
   and clear for Owner (J. Cruz). Regression-checked Sales, Bookings,
   Staff Directory, and Activity Logs — all load with no server or
   console errors.
3. **2026-08-28 — Operations Phase: Locker Board, Call Sheet, Sales
   (Edit/Void)** (`ohm#9h4c7x2m`). Plan + regression assessment presented
   and approved before implementation, per the prompt's mandatory gate.
   Both required discrepancy questions were resolved by reading the actual
   code/schema, not assumed: (1) the Locker Board check-in "gap" turned out
   not to be a gap — both `quick_walkin()` (RPC) and `logVisitBooking()`'s
   linked-booking path already insert into `locker_occupancy` reliably, so
   Check-Out was safe to build without touching check-in; (2) walk-in vs.
   registered sales are distinguished by `sales.client_id IS NULL` (with
   `guest_label` set), matching the mockup's `clientKey===null` check
   exactly. **New migration**
   (`supabase/migrations/20260828023358_operations_sales_rls.sql`,
   smoke-tested via a rolled-back transaction as `anon` first): additive
   `public_update` policy on `locker_occupancy` (for Check-Out) and
   `public_select` + `public_update` policies on `sales` (was insert-only;
   needed for the Sales tab to read at all, plus Edit/Void) — same
   `USING(true)`/`WITH CHECK(true)` shape as every prior policy,
   app-level-only role gate same accepted gap as every other phase.
   **Locker Board** (`app/lockers/page.tsx`, `components/locker-board.tsx`,
   `app/lockers/actions.ts`): 100 tiles from the live `lockers` table,
   occupied tiles show client codename/guest label and a Check-Out button
   that sets `checked_out_at`/`checked_out_by`. **Call Sheet**
   (`app/call-sheet/page.tsx`, `components/call-sheet-browser.tsx`,
   read-only): derived from the same active (`checked_out_at IS NULL`)
   `locker_occupancy` rows, excluding Wet Area; the mockup's synthetic
   per-entry `time` field doesn't exist in the real schema, so the time
   filter is built from distinct `checked_in_at` times instead (documented
   substitution, not a schema change). **Sales**
   (`app/sales/page.tsx`, `components/sales-browser.tsx`,
   `app/sales/actions.ts`): real Edit modal (not `prompt()`) for
   amount/payment method/GCash ref/therapist, writes `edited_by`/
   `edited_at` + an "Edited by [staff]" tag; Void sets `voided`/
   `voided_at`/`voided_by` (never a hard delete), excluded from the running
   total, tagged "VOIDED", stays visible; walk-in sales show "No action —
   walk-in, no account" instead of buttons. Both mutations end with an
   `action_logs` entry. **Role gating reuses `lib/staff-context.tsx`
   (`useStaffSim`/`currentRole`)** exactly as Staff/Logs did — Edit =
   Supervisor/Owner, Void = Owner-only — no new gating mechanism invented.
   Verified live in the browser (`npx tsc --noEmit` passes clean, but not
   relied on alone): edited a real sale (amount 700→750, confirmed the
   `sales` row and a `sale_edit` action_logs entry), checked out locker 5
   (confirmed `checked_out_at` set and a `locker_checkout` action_logs
   entry, Locker Board and Call Sheet both updated live), confirmed
   Front-Desk role shows disabled Edit/Void with the correct tooltip text
   and Owner role shows them enabled. Void's `window.confirm()` couldn't be
   driven through the headless browser tool (dialogs are suppressed there),
   but it's the identical write path already proven via Edit and the RLS
   UPDATE was independently smoke-tested during migration application.
   Test mutations (the amount edit, the checkout) were reverted in the live
   DB after verification so state matches pre-session. Regression-checked
   Dashboard (Total Lockers still reads 100), Bookings, and Settings — all
   load with no server or console errors.
4. **2026-08-28 — Management Phase: Staff Directory + Activity Logs Tab
   (Owner-only)** (`ohm#3z8k1p6d`). Plan + regression assessment presented
   and approved before implementation, per the prompt's mandatory gate.
   Two real discrepancies surfaced during context loading, not guessed
   past: (1) the mockup file initially found on disk (same pattern as
   `ohm#8r3n6y1q`) lacked the `panel-staff`/`panel-logs` panels — blocked
   until the user supplied the correct file
   (`nxs-spa-portal (13).html`); (2) the prompt's premise that Owner-only
   gating could "reuse the Analytics mechanism" was false — verified
   directly that `lib/nav.ts` was a static array with no role logic at
   all, and `Simulate Staff` state lived only in local `useState` inside
   `settings-browser.tsx`, invisible to `Sidebar`. Confirmed with the user
   before building anything: a small shared role-state mechanism was the
   right call (not scope creep), Staff Directory's nav item should also
   be Owner-only (matching the mockup, which the prompt's text hadn't
   explicitly said), and Analytics' nav should NOT be touched despite the
   mockup gating it too (stayed strictly in scope). **New shared
   mechanism**: `lib/staff-context.tsx` (`StaffSimProvider`/`useStaffSim`)
   lifts the Simulate Staff selection out of Settings-local state into a
   React Context seeded from a server-fetched staff list in
   `app/layout.tsx` (now async), persisted to `localStorage` so it
   survives full page navigation between real routes (unlike the
   mockup's single-page tabs). `components/sidebar.tsx` now hides the
   `Staff`/`Logs` nav items (`lib/nav.ts` items gained an `ownerOnly`
   flag) unless `currentRole === 'Owner'`; `settings-browser.tsx`'s
   Simulate Staff dropdown now reads/writes the shared context instead of
   local state (same UI/options — the `initialStaff` prop and its local
   fallback staff array were removed as dead code once the fetch moved to
   the layout). **Staff Directory** (`app/staff/page.tsx`,
   `components/staff-browser.tsx`): real page (was 8-line stub), flat
   list per mockup (position + "can log in"/"directory only" tag,
   comment shown if present), `+ Add Staff` modal (Name, Position select,
   Comment field shown only for "Others"), Owner-only page-level content
   guard as defense-in-depth beyond nav hiding (a direct URL visit would
   otherwise bypass it). New `app/staff/actions.ts`: `addStaff()` server
   action — insert-only, no delete/archive in scope, ends with an
   `action_logs` insert (`staff_add`) using the same placeholder-actor
   pattern as every other phase. **Activity Logs** (`app/logs/page.tsx`,
   `components/logs-browser.tsx`): real page (was 8-line stub),
   server-fetches `action_logs` (LIMIT 500 — current volume is a few
   dozen rows, no pagination needed yet, flagged for revisit if that
   changes) joined to staff names in app code (not a PostgREST embedded
   select — `action_logs.staff_id` carries two FKs, to `staff` and to the
   `loginable_staff` view over it, which makes embedding ambiguous).
   Client-side combinable filters (Action/Date/Staff) populate from
   distinct values actually present in the fetched rows, not the
   mockup's hardcoded action-label list — per the prompt's explicit
   instruction overriding mockup literalism on that one point. Read-only,
   same Owner-only page guard as Staff Directory. **Migration**
   (`supabase/migrations/20260828015000_staff_directory_and_logs_rls.sql`,
   smoke-tested via a rolled-back transaction as the `anon` role —
   insert into `staff` and select from `action_logs` both exercised —
   before applying for real): `staff` gained a `public_insert` INSERT
   policy (was SELECT-only), `action_logs` gained a `public_select`
   SELECT policy (was INSERT-only) — both `roles: public`,
   `USING/WITH CHECK (true)`, same shape as every prior additive policy.
   **Seeded** "Jeff" and "Essem" as real Receptionist rows through the
   live Add Staff UI (per explicit user request), not left as test data —
   both now appear in the Simulate Staff dropdown. Verified live in the
   browser (not just `npx tsc --noEmit`, which passes clean): confirmed
   nav hiding and the page-level Owner-only guard both fire correctly for
   Front Desk and both clear for Owner, confirmed the Logs Action filter
   dropdown includes the new `staff_add` action and filters correctly,
   confirmed the Simulate Staff selection survives a full page navigation
   via `localStorage`. Regression-checked Settings (dropdown
   options/labels/gating behavior unchanged), Bookings, Therapists, and
   Client Profile — all load with no server or console errors.
5. **2026-08-28 — Settings Persistence — Wire Existing UI to Supabase
   (Direct Table Writes)** (`ohm#5x1p8m3v`). Wired the full-parity Settings
   UI (`ohm#6j2v9s4k`) to real Supabase persistence via direct writes to
   `services`/`promos`/`addons`/`rooms`/`lockers`, plus a new
   `weekend_slots` table (nothing in the schema modeled weekend slots
   before this). Plan + regression assessment presented and approved
   before implementation, including three explicit decision points
   confirmed with the user: (1) Rooms/Beds count decreases deactivate the
   highest-numbered active rooms rather than hard-deleting; (2) a new
   `weekend_slots` table was the right call, not a generic settings blob;
   (3) Services delete got wired too (soft-delete) even though the
   prompt's literal scope omitted it, since the UI already shipped a
   working Delete button for it. **Migration**
   (`supabase/migrations/20260828011724_settings_persistence_rls.sql`,
   smoke-tested via a rolled-back transaction as the `anon` role before
   applying for real): new `weekend_slots` table + `public_insert`
   INSERT/UPDATE RLS policies on `services`/`promos`/`addons`/`rooms`,
   INSERT-only on `lockers` — same `roles: {public}`, `USING(true)` shape
   as every prior additive policy. **Deletes for services/promos/addons
   are soft** (`active = false` via UPDATE, never hard `DELETE`) since all
   three are FK-referenced by historical sales/bookings/sale_addons rows —
   no DELETE policy exists for them. A second migration
   (`20260828011900_seed_weekend_slots_defaults.sql`) seeded the 7 default
   slot times the UI already displayed, so switching to persistence didn't
   visually wipe the list. **Server actions**
   (`app/settings/actions.ts`, new file): one action per mutation point in
   `settings-browser.tsx` (services price/points/add/delete, promos
   add/discount/delete, weekend slots add/delete, add-ons add/price/delete
   with the "minimum 1 active add-on" guard now enforced server-side too,
   lockers add-10-batch, room count increase/decrease), each ending with
   an `action_logs` insert using the same placeholder-actor pattern as
   Bookings/Core Loop and `revalidatePath("/settings")`. **UI wiring**:
   every local-only `useState` handler in `settings-browser.tsx` now calls
   its server action first and only commits local state + toast on
   success (numeric inputs switched from per-keystroke `onChange` to
   commit-on-`blur` to avoid a DB write per digit typed); theme toggle and
   Staff Simulation stay local-only by design (confirmed with the user, no
   DB write needed for either). **App-level-only role gate, same
   explicitly-accepted gap as every other phase**: the new RLS grants
   INSERT/UPDATE at the DB level to any anon/authenticated caller — the
   actual Front-Desk-locked / Supervisor-Owner-editable restriction is
   enforced only in the UI via the existing Simulate Staff selection, not
   at the RLS layer, pending real Staff Auth. Verified live in the browser
   (not just `npx tsc --noEmit`, which passes clean): updated a service
   price, added a weekend slot, added a locker batch, and shrank the room
   count, confirming each write landed in the live DB and in `action_logs`
   with the correct actor; regression-checked Bookings, Client Profile,
   and Therapists — all load with no server or console errors. Test rows
   cleaned up from the live DB after verification.
