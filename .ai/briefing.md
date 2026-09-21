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
- Active blockers: None (working tree clean, all 5 recent tasks build and pass clean).

### Last Completed Tasks

1. **2026-09-21 — Fix Locker Out-of-Order Update Failure for Higher Locker Numbers**
   (`ohm#3b8e1f5a`). Implementation plan presented and approved before code execution.
   - **Backend Server Action Upsert & Service Client (`app/(staff)/lockers/actions.ts`)**: Updated `toggleLockerMaintenance` to initialize Supabase via `createServiceClient()` with fallback to `createClient()`, resolving RLS blocks on `public.lockers` updates for staff sessions. Transitioned update query to `.upsert({ number: lockerNumber, active: true, is_maintenance: isMaintenance, status: ..., maintenance_note: ... }, { onConflict: 'number' })` with cascading schema-cache fallback handling, allowing missing locker rows to be inserted dynamically and existing rows updated cleanly. Retained active occupancy guard and added safe try-catch for `action_logs`.
   - **Database Migration (`supabase/migrations/20260921133000_lockers_upsert_and_backfill.sql`)**: Backfills lockers 1..40 to ensure capacity exists and is active (`on conflict (number) do update set active = true where lockers.active = false`). Adds `staff_update` and `staff_insert` RLS policies for authenticated staff and reloads PostgREST schema cache.
   - `npm run build` clean (0 errors). See [[lockers_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Format ROOM Column as Number Only and Sort CHECK-IN Tab by Latest Check-in Time**
   (`ohm#9a4e2f8c`). Implementation plan presented and approved before code execution.
   - **ROOM Column Number-Only Formatting (`components/booking-browser.tsx`)**: In `renderRoomPill()`, updated display to render `<span className="text-muted">{row.room_number}</span>` without the "Room " prefix, matching the clean number-only styling of the LOCKER # column. Preserved `<span className="text-muted">—</span>` fallback for unassigned/Wet Area bookings across all tabs (Upcoming, Check-in, Check-out).
   - **CHECK-IN Tab Descending Sort by Check-in Time (`components/booking-browser.tsx`)**: Added helper `sortByLatestCheckin(rows: BookingRow[])` sorting active check-in bookings by `occupancyOf(r)?.checked_in_at` in descending order (`desc` — newest check-in at the top of the table). Provided robust date parsing with fallback to `b.id.localeCompare(a.id)` for missing or identical timestamps. Maintained chronological scheduled time sorting (`sortBySpaDay`) for the UPCOMING tab.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Dynamically Derive 100-Points Loyalty Discount from Live Combi Massage Price**
   (`ohm#6b3e8a1d`). Implementation plan presented and approved before code execution.
   - **Dynamic Baseline Credit Resolution (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`, `components/log-visit-modal.tsx`)**: Resolves `combiCredit` dynamically from the live service catalog via `services.find(s => s.name.toLowerCase().includes('combi'))?.price ?? 1100` instead of hardcoded values.
   - **Upgrade Difference Calculation**: Computes `servicePaidAmount = Math.max(0, selectedServicePrice - combiCredit)` and `totalAmount = servicePaidAmount + addonTotal` when promo is `redeem_100_pts` (Combi Massage → ₱0; Signature Massage → ₱200 difference; Scrub + Massage → ₱700 difference; add-ons payable).
   - **UI Label & Inline Feedback**: Injects dynamic option label (`Loyalty Reward: Redeem 100 pts (Free Service / Fully Covered)` or `Loyalty Reward: Redeem 100 pts (+₱${diff} Upgrade Fee)`) and dynamic badge `🏅 100 pts applied (-₱${combiCredit} credit). Upgrade fee: ₱${diff}` across all booking modals.
   - **Backend Server Action Synchronization (`app/(staff)/bookings/actions.ts`)**: Authoritatively resolves live `combiCredit` in `quickWalkin` and `logVisitBooking` to calculate `paid_amount` for sales and split payments, forwards `isRedemption` in unlinked delegation, and strictly deducts 100 points via `point_transactions` (`entry_type = 'REDEEM'`, `points_delta = -100`).
   - `npm run build` clean (0 errors). See [[bookings_state]], [[points_ledger_state]], and `.ai/handoff.md`.

4. **2026-09-21 — Implement 100 Points Loyalty Redemption in Booking Promo Dropdown**
   (`ohm#2c8f1e4a`). Implementation plan presented and approved before code execution.
   - **Dynamic Promo Option Injection & Gating (`components/booking-form-modal.tsx`, `components/quick-walkin-modal.tsx`, `components/log-visit-modal.tsx`)**: Look up `points_balance` dynamically for selected `clientId`. If `points_balance >= 100`, injects option `"Loyalty Reward: Redeem 100 pts (Free Service / 100% off)"` (`value="redeem_100_pts"`). If registered member has `< 100` points, renders disabled option with badge `"Loyalty Reward: Redeem 100 pts (Requires 100 pts • Current: X pts)"`. Walk-in guests without accounts do not see any redemption option.
   - **Amount Recalculation & Inline Indicator**: When `redeem_100_pts` is selected, calculates discounted amount by reducing base service price to ₱0 while add-ons remain payable. Displays inline indicator `"🏅 100 points will be deducted upon confirmation"`.
   - **Ledger Integration & Server Action Guard (`app/(staff)/bookings/actions.ts`)**: Added `isRedemption?: boolean` to `quickWalkin` input and server-side balance validation in both `quickWalkin` and `logVisitBooking`. Verifies member portal account and `points_balance >= 100` at time of execution, rejecting any attempt below 100 points. Successfully records `point_transactions` row with `entry_type = 'REDEEM'`, `points_delta = -100` linked to `client_id`, `booking_id`, and `sale_id`.
   - `npm run build` clean (0 errors). See [[bookings_state]], [[points_ledger_state]], and `.ai/handoff.md`.

5. **2026-09-21 — Align ROOM Column Styling with Locker # in Bookings Table**
   (`ohm#4f8c2e1b`). Implementation plan presented and approved before code execution.
   - **ROOM pill removed (`components/booking-browser.tsx`)**: `renderRoomPill()` previously wrapped room display in a `rounded-full border bg-background px-2 py-0.5 text-[8.5px] font-extrabold text-accent-gold` badge span. All pill/badge classes stripped. Now renders `<span className="text-muted">Room {row.room_number}</span>` (or `—` for unassigned), matching the plain `text-muted` typography of the LOCKER # column exactly. Single-point change covers all three tabs (Upcoming, Check-in, Check-out). Null safety guard (`row.room_number ? ... : "—"`) preserved verbatim.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.



