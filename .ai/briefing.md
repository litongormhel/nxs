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

1. **2026-08-28 — Management Phase: Staff Directory + Activity Logs Tab
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
2. **2026-08-28 — Settings Persistence — Wire Existing UI to Supabase
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
3. **2026-08-28 — Closeout: Commit Reviewed Therapist-Tab Work + Fix Stale
   Settings State Doc** (`ohm#6w9d3n8h`). Two-item closeout from audit
   `ohm#4t7b2k9w`. **Item 1**: no commit was made — `git status` showed a
   clean working tree at session start; the Therapist-tab work the audit
   described was already committed as `90c5329` before this session began
   (verified the diff matches exactly). **Item 2**: rewrote
   `docs/state/settings_state.md`, which still described an 8-line stub,
   to reflect the actual full-parity Settings UI (`ohm#6j2v9s4k`) while
   explicitly flagging it as UI-only with no Supabase persistence — verified
   directly against `app/settings/page.tsx` (read-only seed fetch) and
   `components/settings-browser.tsx` (no mutation calls, no `actions.ts`).
   Settings persistence/wiring remains a separate, explicitly out-of-scope
   follow-up.
4. **2026-08-27 — Therapists Tab Full HTML Mockup Parity** (`ohm#7m2k5v9q`).
   Rebuilt `/therapists` route to full HTML mockup parity matching `#panel-therapists` and design system:
   **Therapist Roster**: Default 10 therapists matching mockup (`Ron`, `Don`, `Tristan`, `Leo`, `Roy`, `Xander`, `Dan`, `Marco`, `Akio`, `Josh`),
   avatar initial badge, Most Requested badge (`✦ Most Requested`) for top-booked therapist, and daily schedule modal on header click.
   **Filter Bar**: Interactive Date picker, Time slot select (`16:00` to `01:00`), availability filter (`Select All`, `Available`, `Booked`),
   and `Show Archived` toggle.
   **Interactive Roster Controls**: Clickable Weekly Day(s) Off toggle pills (`Sun`–`Sat`) and Services Offered toggle pills (`Combi Massage`,
   `Signature Massage`, `Scrub`) with instant toast alerts.
   **Kebab Action Menu**: Dropdown on each therapist card supporting `Mark Absent Today` (with automated booking reassignment flagging),
   `Mark On Leave` (with start/end dates and optional reason), `Archive` (with required reason), `Unarchive`, and `Edit` (for in-place renaming).
   **Modals**: Add Therapist modal with multi-select Day Off / Services pills, Daily Schedule modal, Mark On Leave modal,
   Archive Therapist modal, and Edit Name modal.
5. **2026-08-27 — Settings Page Full HTML Mockup Parity** (`ohm#6j2v9s4k`).
   Rebuilt `/settings` route to full HTML mockup parity matching `#panel-settings` and design system:
   **Display & Appearance**: Interactive dark/light appearance toggle switch with sun/moon SVG icons
   and dynamic descriptive subtitle.
   **Account & Staff Simulation**: Signed-in staff badge with `Simulate Staff` dropdown selector that
   updates simulated actor and role permissions (`Front Desk` vs `Supervisor` / `Owner`).
   **Services & Pricing**: Dynamic lock notice, service items with editable points and prices (disabled
   for Front Desk), `+ Add Service` modal and delete actions (Supervisor/Owner).
   **Promo Codes**: Dynamic lock notice, promo items with editable discounts (disabled for Front Desk),
   `+ Add Promo` modal and delete actions (Supervisor/Owner).
   **Weekend Fixed Time Slots**: Fixed weekend slot list with formatted AM/PM times, `+ Add Slot` modal with
   HH:MM format validation, and delete action.
   **Add-ons**: Add-on item list with editable prices, `+ Add Add-on` modal, and delete action.
   **Capacity**: Locker count with `+ Add 10 Lockers` increment button and editable Room / Bed count input.
   **Toast Notifications**: Animated bottom-center toast alert with auto-fade timeout for all settings actions.

