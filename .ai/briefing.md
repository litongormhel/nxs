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

1. **2026-08-29 — Settings 7B-3: Service/Promo Soft-Delete — Verified
   Already Complete** (`ohm#1d5r6nz4`). Read-only investigation (plan
   presented and approved before touching anything, per the prompt's
   mandatory gate) found soft delete, active-only dropdown filtering,
   FK-joined historical display, and no `ON DELETE CASCADE` risk on
   `services`/`promos` were all already in place from `ohm#5x1p8m3v`/6C-4.
   No migration or code change made. See [[settings_state]] and
   `.ai/handoff.md` for the full verification trail.
2. **2026-08-29 — Settings 7B-2: Confirm Dialogs + Global Theme Fix**
   (`ohm#4k9p2xq7` + `ohm#7t3m8vw1`). New reusable
   `components/confirm-dialog.tsx` replaces `window.confirm()` on
   Settings' 4 delete flows (Service/Promo/Weekend Slot/Add-on) — Add
   flows and Staff/Therapist Roster (add-only, no delete UI) needed no
   change. Separately, fixed light mode reverting when leaving the
   Settings tab: root cause was theme state living inside
   `SettingsBrowser`, whose unmount cleanup stripped the `.light` class
   from `document.body` on every navigation away from Settings. Moved
   theme state to a new root-level `lib/theme-context.tsx`
   (`ThemeProvider`/`useTheme()`), wrapped in `app/layout.tsx`.
   Localstorage-only persistence unchanged. Verified live: theme now
   holds across Dashboard/Sales/reload; confirm dialog tested end-to-end.
   See [[settings_state]] and `.ai/handoff.md` for detail.
3. **2026-08-29 — Client Portal 7A-2: Master QR & Registration Flow**
   (`ohm#4m8x1v6q`). First client-facing surface of the Client Portal —
   builds on 7A-1's schema. Plan + regression risk assessment presented and
   approved before any code was written, per the prompt's mandatory gate;
   a follow-up layout question (root layout unconditionally rendering the
   staff Sidebar around all routes) was flagged and approved separately
   before touching it.
   **One thing verified, not trusted, before starting**: the prompt claimed
   7A-1 (`ohm#7a1f9c2k`) was "completed and merged" — at first read this was
   false (no migration, no commit, no `docs/state/client_portal_state.md`
   anywhere in the repo; the ADR-001/briefing.md text describing it was an
   uncommitted working-tree edit with a literal unfilled `[DATE]`
   changelog placeholder). Flagged to the user before any implementation;
   the user then applied the actual 7A-1 migration live, confirmed via
   `list_migrations`/`list_tables` before proceeding — `client_portal_accounts`
   and the `clients.phone` unique constraint are real and committed.
   **Route-group refactor** (approved separately, not in the original
   plan): `app/layout.tsx` was the literal HTML root and unconditionally
   wrapped every route in the staff `Sidebar`/`StaffSimProvider`/staff
   session lookup — a portal page nested under it would still show staff
   nav and run a needless staff-session query. Moved all 13 existing route
   folders into `app/(staff)/` with their own layout carrying the exact
   same Sidebar/session logic (mechanical, same URLs — parenthesized route
   groups don't affect routing); slimmed `app/layout.tsx` to bare
   `html`/`body` + fonts. Every `@/app/<route>/actions` import across
   `components/*.tsx` updated to the new `@/app/(staff)/<route>/actions`
   path. **`proxy.ts`**: added an early return excluding `/portal/*` from
   the staff-session gate — the only touch to shared staff logic; the
   existing redirect/matcher logic for staff routes is unchanged.
   **New `/portal/*` surface**: registration (Phone/PIN/Name → match
   existing `clients.phone` or create new client, preserving points/history
   on match) and login (Phone+PIN), both via server-only Route Handlers
   using the service-role Supabase client — required because
   `client_portal_accounts` is RLS default-deny and `clients` INSERT
   requires `is_staff()`, so an anonymous visitor cannot register through
   the anon-key path the rest of the app uses; this is a deliberate,
   narrowly-scoped exception to the repo's anon-key-only convention,
   confined to two Route Handlers. PIN hashed with Node's built-in
   `crypto.scrypt` (no new dependency); portal session is a separate
   HMAC-signed cookie (`nxs_portal_session`, scoped to `/portal`,
   signed with `SUPABASE_SERVICE_ROLE_KEY`) — entirely distinct from
   Supabase Auth's staff session cookies. System-generated portal
   `username` (e.g. `NXS-XKUCU4`) shown on a minimal confirmation screen,
   never editable, never encoded in the QR. **Master QR**: static
   `qrcode`-rendered image (new dependency) on a staff-gated page at
   `/settings/master-qr`, linked from the existing Settings page — encodes
   `/portal/register` built from the live request host so it's correct in
   every environment without new env config. **Verified live in the
   browser, not just typechecked**: registration created a real client +
   portal account end-to-end, login with the same phone/PIN round-tripped
   to the same account, `/dashboard` and other staff routes still required
   the existing staff session and rendered the full Sidebar/Owner nav
   unaffected by the refactor, Master QR rendered and correctly encoded
   the registration URL. `npx tsc --noEmit` and `eslint` both clean.
   Explicitly out of scope per the prompt (next prompts): Member QR,
   `log_visit` RPC lookup integration, phone masking/reveal UI, points/
   history/promos views. One test artifact left live, matching this
   repo's established precedent of leaving harmless test data documented
   rather than deleting it via SQL: client "Test Client 7A2"
   (phone `09171234567`), portal account `NXS-XKUCU4`. See
   [[client_portal_state]] for the updated state.
4. **2026-08-29 — Client Portal 7A-1: Schema Foundation** (`ohm#7a1f9c2k`).
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
5. **2026-08-29 — Cleanup: Remove 6C-6 Regression Test Artifacts from Live
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
