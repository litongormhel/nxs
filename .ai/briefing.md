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

1. **2026-08-29 — Bookings: Change Therapist action** (`ohm#7k2m9xq4`).
   Adds a "Change Therapist" action on any booking not `Completed`/
   `Cancelled` (`Booked`, `No-show`, `Needs Reassignment`) — reassigns
   `therapist_id` only, room/locker untouched. Plan + regression risk
   assessment presented and approved before any code was written, per the
   prompt's mandatory gate. **Confirmed, not assumed, before implementing**:
   the `no_double_book_therapist`/`no_double_book_room` GiST exclusion
   constraints are standard Postgres `EXCLUDE` constraints, which enforce
   on both INSERT and UPDATE inherently — no schema gap, no migration
   needed. New `changeBookingTherapist()` server action in
   `app/(staff)/bookings/actions.ts` writes one `action_logs` row
   (old→new therapist, timestamp, real authenticated staff, booking
   reference) on success. `components/booking-browser.tsx` wires the
   pre-existing unwired `Reassign` button stub (on `Needs Reassignment`
   rows) plus a new `Change Therapist` button (on `Booked`/`No-show` rows)
   to a shared confirm modal; the day-view fetch filter now also includes
   `No-show` (previously excluded from the list entirely), per the user's
   explicit choice when asked. No changes to Points Ledger or Sales.
   Verified live: reassignment round-tripped in the browser and the
   Activity Log entry appeared correctly. `npx tsc --noEmit` and `eslint`
   both clean. See [[bookings_state]].
2. **2026-08-29 — Client Portal 7A-3: Registration/Login Revision —
   Password Auth** (`ohm#9r3w7t5b`). Rework of the already-shipped 7A-2
   registration/login flow: replaces PIN-based auth with password-based
   auth and makes `username` user-chosen at registration (was
   system-generated). Plan + regression risk assessment presented and
   approved before any migration/code was written, per the prompt's
   mandatory gate. **Discrepancy caught before planning**: `clients.username`
   and `clients.password_hash` already exist live but pre-date the entire
   Client Portal feature (baseline snapshot) and are unrelated — flagged,
   left untouched. Migration
   `20260829123017_client_portal_password_auth.sql`: deleted the single
   7A-2 test row (`Test Client 7A2` / `NXS-XKUCU4`, confirmed with the
   user first), dropped `pin_hash` and the plain unique constraint on
   `username`, added `password_hash text not null` and a case-insensitive
   `unique index ... (lower(username))` (citext confirmed unused
   elsewhere, so a functional index was used instead). `lib/portal/pin.ts`
   renamed to `lib/portal/password.ts` (`hashPassword`/`verifyPassword`,
   same scrypt implementation, `MIN_PASSWORD_LENGTH = 6`). New
   `lib/portal/username.ts` for format validation + LIKE-safe
   case-insensitive uniqueness checks, backing a new
   `app/portal/api/check-username` route used by both a debounced
   client-side check and the authoritative server-side check. Registration
   fields are now Name/Username/Phone/Password; the `clients.phone`
   match-vs-create linking logic is unchanged, but the
   `client_portal_accounts.phone`-collision response was deliberately
   changed from a leaking message ("this phone is already registered") to
   a generic one, per the prompt's own leak-prevention requirement. Login
   is now a single "Username or Phone Number" + Password, backend
   regex-detects which. `lib/portal/session.ts` confirmed unaffected, not
   touched. SMS OTP / Forgot Password explicitly out of scope, no
   scaffolding added. Verified live: register → confirmation → logout →
   login by both username and phone, staff `/dashboard` unaffected.
   `npx tsc --noEmit` and `eslint` both clean. See [[client_portal_state]].

3. **2026-08-29 — Settings 7B-3: Service/Promo Soft-Delete — Verified
   Already Complete** (`ohm#1d5r6nz4`). Read-only investigation (plan
   presented and approved before touching anything, per the prompt's
   mandatory gate) found soft delete, active-only dropdown filtering,
   FK-joined historical display, and no `ON DELETE CASCADE` risk on
   `services`/`promos` were all already in place from `ohm#5x1p8m3v`/6C-4.
   No migration or code change made. See [[settings_state]] and
   `.ai/handoff.md` for the full verification trail.
4. **2026-08-29 — Settings 7B-2: Confirm Dialogs + Global Theme Fix**
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
5. **2026-08-29 — Client Portal 7A-2: Master QR & Registration Flow**
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
