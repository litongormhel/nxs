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

1. **2026-08-29 — Client Portal 7A-1: Schema Foundation** (`ohm#7a1f9c2k`).
   Database layer only — no UI, no routes. Added a `UNIQUE` constraint to
   the already-existing `clients.phone` column (the prompt described it as
   a new column; live schema check caught it already existed, nullable,
   no duplicates), a new `client_portal_accounts` table (RLS enabled, zero
   policies = default-deny, matching existing precedent), a new singleton
   `app_settings` table for `allow_receptionist_manual_points`
   (Owner-editable; no generic settings table existed to reuse — Settings
   persistence in this codebase writes directly to catalog tables), and a
   `COMMENT ON COLUMN`-only relabel of `clients.codename`'s display label
   to "Name" (column name unchanged; zero `.tsx` files touched, per the
   prompt's explicit UI-regression-risk exclusion). `action_logs.action`
   is plain text with no enum, so the new `phone_number_revealed` event
   type is a convention, not a schema change. Both migrations applied live
   and verified via `pg_policies`/`get_advisors`. See [[client_portal_state]].
2. **2026-08-29 — Cleanup: Remove 6C-6 Regression Test Artifacts from Live
   DB** (`ohm#2c6h9x4d`). Data-only cleanup, no code/schema/RLS changes.
   Removed the 4 test artifacts named in `ohm#8r5m1v7z`'s "harmless test
   artifacts left in place" note: booking "6C-6 Regression Test", sale
   "6C-6 Walkin Test", staff row "6C-6 Regression Staff", weekend slot
   "2:15 PM". **One discrepancy caught by reading the live rows before
   deleting, not assumed from the prompt's description**: the prompt
   described the "6C-6 Walkin Test" sale as "edited by Diego, ₱700→₱725,"
   but the live row was unedited (₱700, `edited_by` null, processed by
   Ana). The real ₱700→₱725 Diego edit turned out to be on a separate,
   unlabeled sale with no "6C-6" marker — left untouched as real data,
   per the prompt's "don't delete anything that doesn't clearly match"
   rule. Flagged to the user before deleting anything; confirmed correct.
   **Two related test rows not named in the prompt** were found
   FK/action-log-linked to the "6C-6 Walkin Test" sale (same
   `quick_walkin` event): booking "6C-6 Walkin Test" (`sales.booking_id`)
   and a locker_occupancy row (already checked out) sharing the same
   guest label. Flagged and approved before deletion, since leaving them
   would've orphaned test residue with no delete UI to clean up later.
   All 6 rows confirmed live, shown for sign-off, then deleted
   individually (`sales` → `locker_occupancy` → both `bookings` → `staff`
   → `weekend_slots`) after explicit approval. `action_logs` entries
   referencing these artifacts (`quick_walkin`, `staff_add`) were left
   untouched per ADR-001's append-only invariant. Post-delete verification:
   table counts dropped as expected (bookings 13→11, sales 11→10, staff
   11→10, weekend_slots 8→7); the real ₱725 sale confirmed still present
   and unmodified. This closes out the Staff Auth phase (6A–6C-6) with no
   lingering test data in the live DB.
3. **2026-08-29 — Staff Auth 6C-6: Remove Simulate Staff + Full-System
   Regression Pass (Staff Auth Complete)** (`ohm#8r5m1v7z`). Final
   sub-step of the entire Staff Auth phase (6A through 6C-6) and the
   entire originally-scoped 6-phase roadmap. Repo-wide search for every
   Simulate Staff reference (12 code files) was presented and approved
   before any removal, per the prompt's mandatory gate.
   **`lib/staff-context.tsx`** simplified: `loginableStaff`/
   `selectedStaffId`/`setSelectedStaffId`/`simulatedStaff`/
   `FALLBACK_STAFF`/the `nxs_sim_staff_id` localStorage key are all gone —
   `currentStaff`/`currentRole`/`sessionStaff` now derive solely from the
   real Supabase Auth session (nullable only on `/login` pre-auth, since
   every other route is guaranteed one by `proxy.ts`). **One discrepancy
   caught live in the browser during the regression pass, not by the
   initial grep**: `components/analytics-browser.tsx`'s Owner-only
   blocking message split "Simulate\nStaff" across two lines, which a
   single-line grep pattern missed — caught when the Owner-only page was
   visited as Front Desk during regression testing, fixed, then verified
   clean with a multi-line-safe repo-wide grep. **`components/
   settings-browser.tsx`**: the Simulate Staff dropdown block deleted
   entirely; all 15 `selectedStaffId` call sites now resolve from a local
   `sessionStaff?.id ?? ""` derived const. **`app/layout.tsx`**: the
   full active-staff-list fetch (previously only used to feed the
   dropdown) removed — only the single-row `sessionStaff` lookup remains.
   `components/{locker-board,sales-browser,staff-browser}.tsx` switched
   from `selectedStaffId` to `sessionStaff?.id ?? ""`;
   `{log-visit,booking-form,quick-walkin}-modal.tsx` dropped the
   `?? staff[0]` fallback (now `actor = sessionStaff`, already
   null-safely rendered). Stale "Switch to Owner in Settings → Simulate
   Staff" copy fixed in `logs-browser.tsx`/`staff-browser.tsx`/
   `analytics-browser.tsx` to plain "Sign in with an Owner account"
   language. `npx tsc --noEmit` passes clean throughout.
   **Full-system regression pass, exhaustive per the prompt's explicit
   "not sampling" rule**: real login/logout cycles (no Simulate Staff) as
   all three roles, exercising every phase. Ana (Front Desk) — nav
   correctly hides Staff/Logs/Analytics, all three correctly DB-blocked
   with updated copy; Log Visit (Wet Area earn case, 216→219 pts), New
   Booking, and Quick Walk-in all succeeded live through the actual
   modals with correctly session-derived "Ana · Receptionist" actor
   labels; Sales Edit/Void buttons correctly disabled
   ("Supervisor or Owner only"/"Owner only"); Locker Board check-out
   succeeded; Call Sheet loaded correctly; Settings read-only, dropdown
   gone. Diego (Supervisor) — everything above, plus a real Sales Edit
   (₱700→₱725, "Edited by You") and a real Settings edit (Add Weekend
   Slot, "2:15 PM") both succeeded live with correct DB-level actor
   attribution; Void/Staff Directory/Activity Logs/Analytics correctly
   still Owner-only. J. Cruz (Owner) — everything above, plus Sales Void
   button correctly enabled, a real Add Staff succeeded
   ("6C-6 Regression Staff added as Receptionist"), Analytics loaded with
   correct figures, and Activity Logs correctly showed every regression
   action from all three roles' real sessions with correct attribution
   (`Ana`/`quick_walkin`, `Diego`/`sale_edit` +
   `settings_add_weekend_slot`, `J. Cruz`/`staff_add`) — direct proof the
   session-derived actor path works end-to-end across the whole app, not
   just per-component. No console or server errors observed at any point.
   Harmless test artifacts left in place (no delete UI/policy for any of
   these, same precedent as every prior 6C sub-step): booking
   "6C-6 Regression Test", sale "6C-6 Walkin Test" (₱700), staff row
   "6C-6 Regression Staff", weekend slot "2:15 PM".
   **Final doc pass**: ADR-001 invariant #6 rewritten from "deferred, RLS
   not identity-keyed" to reflect completion; `docs/architecture/rbac.md`
   rewritten in full from "Design Target (Not Yet Enforced)" to
   "Implemented"; every `docs/state/*.md` file still describing Simulate
   Staff as present/functional or carrying "app-level-only role gate"/
   "known gap" language updated to reflect real RLS + real session
   attribution (`staff_state.md`, `logs_state.md`, `sales_state.md`,
   `settings_state.md`, `clients_state.md`, `analytics_state.md`).
   **This closes the entire Staff Auth phase and the originally-scoped
   6-phase roadmap in full.** No RLS policy changes — none were needed,
   per scope; nothing surfaced by regression testing warranted one. See
   [[staff_state]] for the final state.
4. **2026-08-29 — Staff Auth 6C-5: Staff Directory + Activity Logs RLS**
   (`ohm#4t8w2j6q`). Fifth and final table-level RLS-lockdown sub-step of
   six planned — reused 6C-2's role helpers as-is (`is_staff()`,
   `is_owner()`), no new helpers created. Policy matrix, including the
   `staff` SELECT-scope question, was presented and approved before any
   SQL was written, per the prompt's mandatory gate.
   **One real discrepancy resolved by tracing usage directly in code, not
   assumed from the prompt's "Owner-only nav gating" framing**: the prompt
   asked whether `staff` SELECT should be Supervisor+ only, matching the
   Staff Directory *page*'s Owner-only nav gate. Grepping every
   `.from("staff")` call site showed `app/layout.tsx` queries `staff` on
   *every* page load for *every* role — both the full active-staff list
   (Simulate Staff dropdown) and the `sessionStaff` lookup that drives
   actor attribution app-wide — plus broad reads from `clients`/
   `bookings`/`sales`/`logs` pages for name/role display. Restricting
   SELECT below `is_staff()` would have broken session resolution itself
   for Front Desk on nearly every route. Flagged to the user before
   implementing; resolved as `is_staff()` (broad), with the Staff
   Directory page's Owner-only visibility staying app-level UI gating
   only, unchanged. Confirmed `current_staff_position()` is `SECURITY
   DEFINER` and reads `staff` directly, so tightening `staff`'s own SELECT
   policy can't break the role helpers everything else depends on.
   **Policy matrix**: `staff` — SELECT = `is_staff()`, INSERT =
   `is_owner()` (matches Owner-gated Add Staff modal), no UPDATE/DELETE
   (confirmed add-only, no staff-editing UI exists; also means `user_id`,
   the auth-linkage column set only via `service_role` in 6A, can never be
   altered through app RLS). `action_logs` — SELECT = `is_owner()`
   (matches Owner-gated Activity Logs page), INSERT = `is_staff()` (every
   mutating flow across the app writes here), no UPDATE/DELETE (audit
   trail stays append-only, matching the points-ledger immutability
   pattern). **Migration**
   (`supabase/migrations/20260829160000_staff_action_logs_rls.sql`),
   smoke-tested via a rolled-back transaction simulating `auth.uid()` as
   anon, Ana (Front Desk), Diego (Supervisor), and J. Cruz (Owner) —
   per the prompt's explicit "widest blast radius" flag, exercised real
   domain writes (a `log_visit()` RPC call, a real booking insert, a real
   sales edit) as each role, not just synthetic `action_logs` inserts —
   confirmed anon blocked entirely on both tables, Ana/Diego can read/
   write `staff` and insert `action_logs` but can't read `action_logs` or
   insert `staff`, Owner can do everything except mutate `action_logs`
   post-insert (an Owner UPDATE/DELETE attempt on `action_logs` was
   initially misread as "succeeding" because it raised no error — a
   `GET DIAGNOSTICS row_count` check caught that it was actually a silent
   0-row no-op, correctly blocked) — before applying live via
   `apply_migration`. Live policies read back afterward and confirmed to
   match exactly. Regression-tested end-to-end via real logins (not
   Simulate Staff): logged in as Ana — Owner-only nav absent, `/staff` and
   `/logs` correctly blocked by the existing app-level guard, a real Log
   Visit (Wet Area, 213→216 pts) succeeded with correct actor attribution.
   Logged in as Diego — same nav/route gating, a real New Booking
   succeeded (`created_by` confirmed via SQL to be Diego's staff id), a
   real Sales Edit succeeded ("Edited by You", ₱700→₱750). Logged in as
   J. Cruz — Analytics/Staff/Logs nav present, Activity Logs page
   correctly showed entries from all three roles' regression actions, a
   real Add Staff succeeded end-to-end. `npx tsc --noEmit` passes clean,
   no console errors at any tier. One harmless test artifact left in
   place, matching the "no delete policy/UI for `staff`" invariant: an
   Attendant record named "RLS Test Staff" from the live browser
   regression test — inert, directory-only, not deletable through the app
   (same precedent as 6C-3's kept test booking). **Simulate Staff still
   fully functional in the UI** — same pattern as 6C-2 through 6C-4:
   neutralized at the DB level, not removed from the UI itself. **6C is
   now complete for all five table-level RLS sub-steps — only 6C-6
   (removing Simulate Staff) remains.** See [[staff_state]],
   [[logs_state]] for the updated RLS detail.
5. **2026-08-29 — Staff Auth 6C-4: Settings/Catalog RLS (services, promos,
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
