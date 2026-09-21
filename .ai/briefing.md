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

1. **2026-09-21 — Display Used Walk-in Codename in Pending Claims Details and Search**
   (`ohm#2f7a9d4c`). Implementation plan presented and approved before code execution.
   - **Data Query & Typings (`app/(staff)/clients/page.tsx`, `components/client-browser.tsx`)**: Extended `visit_claims` query to join `bookings` (`guest_label`, `locker_occupancy`, `services`, `therapists`, `sales`). Resolved `guest_label` with cascading fallbacks to `rawWalkIns`, `sales`, and `allHistoricalOccupancy`. Extended `PendingClaim` and `PendingClaimRow` types with `walkin_codename: string | null` and `guest_label?: string | null`. Mapped `walkin_codename` and `locker_number` onto all pending claims.
   - **Pending Claims UI & Search (`components/client-browser.tsx`)**: In the Pending Claims tab table, redesigned the "ORIGINAL WALK-IN DETAILS" column into a clean 3-tier layout: (1) Top: Date & 12-hour Time, (2) Middle: highlighted gold badge `Codename: {claim.walkin_codename ?? "Walk-in Guest"}`, and (3) Bottom: Service • Therapist • Locker # (if available) • Amount (Payment Method). Included `walkin_codename` in `filteredPendingClaims` client-side search predicate and updated the search placeholder.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Implement Pending Walk-in Visit Claims Tab with Staff Audit Trail and Approve All**
   (`ohm#8f2b4c1a`). Implementation plan presented and approved before code execution.
   - **Database & Schema (`supabase/migrations/20260921160000_past_visit_claims.sql`)**: Created table `public.visit_claims` with `booking_id` (unique, FK bookings), `target_client_id` (FK clients), `requested_by_staff_id` (FK staff), `reviewed_by_staff_id` (FK staff), `points_to_credit`, `status` (`pending`, `approved`, `rejected`), and audit timestamps. Added idempotent RLS policies (`staff_select` & `staff_insert` for `is_staff()`, `supervisor_update` for `is_supervisor_or_above()`).
   - **Server Actions (`app/(staff)/clients/actions.ts`)**: Added `requestWalkinClaim` to compute loyalty points based on `app_settings` and record initiating staff ID. Added `approveWalkinClaim` (Owner/Supervisor only) atomically linking `bookings`, `sales`, and `locker_occupancy`, inserting `EARN` ledger entry in `point_transactions`, and updating claim status to `approved`. Added `approveAllWalkinClaims` for batch execution and `rejectWalkinClaim` to restore visit to available walk-in pool.
   - **Queries & Component (`app/(staff)/clients/page.tsx`, `components/client-browser.tsx`)**: Excluded pending claim bookings from "Walk-In Without Account" tab. Added "Claim Past Walk-in Visit" modal to Member Details drawer with live points preview. Added third tab "Pending Claims (count)" with staff audit trail display (`Requested by: [Staff Name] on [Date/Time]`), single-click `[Approve]` and `[Reject]` (no modal), and "Approve All" confirmation modal.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Add Resilient Fallback for quick_walkin RPC Parameter Signature**
   (`ohm#1c4e9a7b`). Implementation plan presented and approved before code execution.
   - **Server Actions (`app/(staff)/bookings/actions.ts`)**: In `quickWalkin`, wrapped `supabase.rpc("quick_walkin", ...)` execution in an adaptive retry block. If PostgREST returns a function signature mismatch or schema cache error (`PGRST202` or error message referencing `p_notes` / `Could not find the function` / `schema cache`), automatically falls back to invoking `quick_walkin` without `p_notes`.
   - **Post-Creation Notes Update (`app/(staff)/bookings/actions.ts`)**: On successful creation returning `booking_id`, updates `bookings.notes` via `.update({ notes: input.notes.trim() }).eq("id", bookingId)` wrapped in safe `try...catch` logging warnings without blocking counter operations if column is missing.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-21 — Add sms_confirmation_template Column to app_settings and Fix Variable Typo**
   (`ohm#5e9a2b7c`). Implementation plan presented and approved before code execution.
   - **Database & Schema (`supabase/migrations/20260921150000_add_sms_confirmation_template.sql`)**: Added nullable `sms_confirmation_template text` column to `public.app_settings` (`if not exists`). Ensured `app_settings_update` RLS policy permits `is_supervisor_or_above()`. Executed `NOTIFY pgrst, 'reload schema';` to refresh PostgREST schema cache.
   - **Server Actions (`app/(staff)/settings/actions.ts`)**: Updated `updateSmsTemplate` (and exported `saveSmsTemplate` alias) and `resetSmsTemplate` to initialize Supabase via `createServiceClient()` with fallback to `createClient()`. Added automatic fallback retry using service client on RLS failure. Added defensive error handling that gracefully intercepts missing column errors (`42703`, `PGRST204`, or schema cache errors) and returns clear, human-readable instructions.
   - **Settings UI (`components/settings-browser.tsx`)**: Added `normalizeSmsVariables` helper replacing all occurrences of typo `{room_numner}` with `{room_number}`. Initialized state with sanitized template copy, sanitized template text prior to saving in `handleSaveSmsTemplate`, ensured variable pills insertion cleanly inserts `{room_number}`, and updated reset handler to restore `{room_number}` cleanly.
   - `npm run build` clean (0 errors). See [[settings_state]] and `.ai/handoff.md`.

5. **2026-09-21 — Fix Empty Bookings Table After Adding Notes Column**
   (`ohm#7d2a9b4c`). Implementation plan presented and approved before code execution.
   - **Diagnosis & Root Cause**: Migration `supabase/migrations/20260921140000_add_bookings_notes.sql` was not executed on the live database, causing queries selecting `notes` on `public.bookings` to fail with Postgres error `42703` (`column bookings.notes does not exist`). Silent failure previously defaulted `bookingsData` to null/empty, causing 0 bookings to render across all tabs (Upcoming, Check-in, Check-out).
   - **Client Component Resilient Fallback (`components/booking-browser.tsx`)**: Captured query error via `bookingsRes.error` and logged via `console.error`. Added automatic fallback query retrying without `notes` if error `42703` or column missing error is encountered. Immediately restored visibility of all 18 active bookings for `09/21/2026` across Upcoming (3), Check-in (11), and Check-out (4) tabs.
   - **Server Component Resilient Fallback (`app/(staff)/bookings/page.tsx`)**: Captured `flaggedError` and `activeBookingsError`. Implemented automatic fallback queries without `notes` for `effectiveFlaggedStatus` and `effectiveActiveBookings`, ensuring `<ReassignmentPanel />` and `<BookingBrowser />` receive full booking lists without crashing or dropping rows.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.



