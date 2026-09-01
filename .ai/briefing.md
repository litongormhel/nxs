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

1. **2026-09-01 — Member QR — Per-Account Token + Client-Facing QR Display
   (7B-1 of 2)** (`ohm#5t9k2mxr`). Plan + regression risk assessment
   presented and approved before any code/migration was written, per the
   prompt's mandatory gate. Discrepancy confirmed before planning:
   `log_visit()` RPC is confirmed dead code, not resurrected — this prompt
   only generates/displays the QR, no scan/lookup logic (that's 7B-2). See
   [[client_portal_state]] and `.ai/handoff.md` for full detail.

2. **2026-09-01 — Loyalty Points Formula — Wire Into Live Points-Award Flow
   (Part 2 of 2)** (`ohm#2r8w5nfz`). Plan + regression risk assessment
   presented and approved before any code was written, per the prompt's
   mandatory gate. Points are now formula-driven end-to-end. See
   [[points_ledger_state]], [[settings_state]], and `.ai/handoff.md` for
   full detail.

3. **2026-09-01 — Loyalty Points Formula — Settings Schema + Configuration
   UI (Part 1 of 2)** (`ohm#9k3m7qxc`). Plan + regression risk assessment
   presented and approved before any code/migration was written, per the
   prompt's mandatory gate.

4. **2026-09-01 — Points EARN/REDEEM Guard — Require Client Portal
   Account** (`ohm#4x8k2p9d`). Plan + regression risk assessment presented
   and approved before any code/migration was written, per the prompt's
   mandatory gate.
   - **Live-schema + live-data check before any migration**: confirmed
     `point_transactions` triggers and `client_portal_accounts`'s zero RLS
     policies directly against project `zqwiqrvqyinacjozubtc`; found only
     1 of 78 `clients` rows has a linked `client_portal_accounts` row — the
     immediate blast radius (77 clients losing EARN/REDEEM until portal
     registration), surfaced and accepted before coding, shipped live with
     no feature flag.
   - New migration `20260901090000_point_transactions_portal_guard.sql`:
     `BEFORE INSERT` trigger `trg_require_portal_account_for_earn_redeem`
     on `point_transactions` blocks `EARN`/`REDEEM` rows for a `client_id`
     with no `client_portal_accounts` row (`ADJUSTMENT` exempt); plus one
     additive `staff_select` RLS policy on `client_portal_accounts` so the
     app can read portal-registration status. Covers all three existing
     write paths into the ledger (`log_visit()` RPC, `quick_walkin()` RPC,
     and `logVisitBooking()`'s direct insert) since it fires on every
     INSERT regardless of caller.
   - **App-level gating is a hard pre-flight block, not a catch of the DB
     exception** — `logVisitBooking()`'s linked-booking branch does
     booking-update → sale-insert → ledger-insert → locker-insert as
     separate non-atomic calls, so relying on the trigger alone would leave
     a booking marked `Completed`/sale recorded with no ledger entry or
     locker on rejection. `app/(staff)/clients/page.tsx` and
     `app/(staff)/bookings/page.tsx` now pass a `has_portal_account` flag
     per client; `client-browser.tsx`, `booking-browser.tsx`, and
     `log-visit-modal.tsx` all disable their Log Visit triggers (with an
     inline Tagalog note) before ever calling into the ledger. Guests/
     walk-ins with no `client_id` are unaffected.
   - Left untouched per instruction: the dead "Redeem" button in
     `client-browser.tsx` (no `onClick`, not wired to anything).
   - `get_advisors` showed no new findings after applying the migration.
     `npx tsc --noEmit` and `eslint` both clean on all changed files.
   - **Not verified live in-browser this session** — no `.env.local`
     present, same recurring credentials/env blocker as recent prior
     tasks; verified via the live-schema/live-data checks, `get_advisors`,
     and `tsc`/`eslint`. See [[points_ledger_state]] and
     [[client_portal_state]].

5. **2026-08-31 — Analytics — 5-Tab Restructure + Top Thera → Commission
   Deep Link** (`ohm#4k7n2wc9`). Plan + regression risk assessment
   presented and approved before any code was written, per the prompt's
   mandatory gate.
   - **Discrepancy surfaced and resolved before coding**: the prompt
     described building a net-new Commission tab computing commission as
     `sales.amount × commission_rates.percent` (joined via
     `sales.service_id`/`sales.created_at`), with "no admin UI for
     `commission_rates`" as out of scope. Both were already false —
     Commission (Rates + Report sub-tabs) shipped same-day in
     `ohm#4k8t2wq9`/`ohm#8x2m4tqz`, and the live Report computes
     commission from **`bookings`** (`Booked`/`Completed`,
     `booking_date`-filtered) × `services.price` × `percent`, not from
     `sales`. User decision: keep the shipped bookings-based formula
     as-is; fold the existing Rates/Report Commission tab into the new
     layout unchanged rather than rebuilding it. See [[commission_state]].
   - **Pure refactor, no calc changes**: `components/analytics-browser.tsx`
     kept its `useMemo` computation byte-for-byte identical — only the
     render was split via a new `section` prop
     (`"sales" | "most-availed" | "top-clients" | "top-thera"`) so each
     top-level tab renders one existing block instead of all four
     stacked. Sales tab keeps the Today/7-day/Month Sales + Client Visits
     cards (Client Visits had no other named home in the prompt, so it
     stayed with Sales) and gained a Per Day/Per Month toggle switching
     between the already-computed `salesPerDay`/`salesPerMonth` tables
     instead of showing both.
   - `components/analytics-tabs.tsx`: top tabs became **Sales | Most
     Availed Services | Top Clients | Top Thera | Commission** (was
     Overview | Commission). Owner-only gate moved up to this component
     (one blocking message for the page, not one per tab) — same
     `useStaffSim`/`currentRole` check, just relocated.
   - **Top Thera → Commission deep link**: each Top Thera row gained a
     "View Commission →" button (needed `id` added to the existing
     `therapistRanking` map entries, ranking order/values unchanged).
     Click sets top tab → Commission, sub-tab → Report, and a
     `filterTherapist` state passed into `CommissionReportBrowser`, which
     auto-runs `getCommissionReport` for the current default range and
     filters the already-returned rows to that therapist client-side — no
     new query. A "Filtering: {name} ×" chip clears it back to the full
     report. No route change, no new page, per the prompt.
   - No migration, no RLS change, no changes to `getCommissionReport`,
     `setCommissionRate`, or `commission_rates` — read-only tab-shell
     work only.
   - `npx tsc --noEmit` and `eslint` both clean on all changed files.
   - **Not verified live in-browser this session** — no `.env.local`
     present, same recurring credentials/env blocker as recent prior
     tasks; verified via code review and `tsc`/`eslint`. See
     [[analytics_state]].
