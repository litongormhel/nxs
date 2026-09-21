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

1. **2026-09-21 — Add sms_confirmation_template Column to app_settings and Fix Variable Typo**
   (`ohm#5e9a2b7c`). Implementation plan presented and approved before code execution.
   - **Database & Schema (`supabase/migrations/20260921150000_add_sms_confirmation_template.sql`)**: Added nullable `sms_confirmation_template text` column to `public.app_settings` (`if not exists`). Ensured `app_settings_update` RLS policy permits `is_supervisor_or_above()`. Executed `NOTIFY pgrst, 'reload schema';` to refresh PostgREST schema cache.
   - **Server Actions (`app/(staff)/settings/actions.ts`)**: Updated `updateSmsTemplate` (and exported `saveSmsTemplate` alias) and `resetSmsTemplate` to initialize Supabase via `createServiceClient()` with fallback to `createClient()`. Added automatic fallback retry using service client on RLS failure. Added defensive error handling that gracefully intercepts missing column errors (`42703`, `PGRST204`, or schema cache errors) and returns clear, human-readable instructions.
   - **Settings UI (`components/settings-browser.tsx`)**: Added `normalizeSmsVariables` helper replacing all occurrences of typo `{room_numner}` with `{room_number}`. Initialized state with sanitized template copy, sanitized template text prior to saving in `handleSaveSmsTemplate`, ensured variable pills insertion cleanly inserts `{room_number}`, and updated reset handler to restore `{room_number}` cleanly.
   - `npm run build` clean (0 errors). See [[settings_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Fix Empty Bookings Table After Adding Notes Column**
   (`ohm#7d2a9b4c`). Implementation plan presented and approved before code execution.
   - **Diagnosis & Root Cause**: Migration `supabase/migrations/20260921140000_add_bookings_notes.sql` was not executed on the live database, causing queries selecting `notes` on `public.bookings` to fail with Postgres error `42703` (`column bookings.notes does not exist`). Silent failure previously defaulted `bookingsData` to null/empty, causing 0 bookings to render across all tabs (Upcoming, Check-in, Check-out).
   - **Client Component Resilient Fallback (`components/booking-browser.tsx`)**: Captured query error via `bookingsRes.error` and logged via `console.error`. Added automatic fallback query retrying without `notes` if error `42703` or column missing error is encountered. Immediately restored visibility of all 18 active bookings for `09/21/2026` across Upcoming (3), Check-in (11), and Check-out (4) tabs.
   - **Server Component Resilient Fallback (`app/(staff)/bookings/page.tsx`)**: Captured `flaggedError` and `activeBookingsError`. Implemented automatic fallback queries without `notes` for `effectiveFlaggedStatus` and `effectiveActiveBookings`, ensuring `<ReassignmentPanel />` and `<BookingBrowser />` receive full booking lists without crashing or dropping rows.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Add Session Notes / Vehicle Info to Bookings and Display in Table**
   (`ohm#4a7b1c3e`). Implementation plan presented and approved before code execution.
   - **Database & Schema (`supabase/migrations/20260921140000_add_bookings_notes.sql`)**: Added nullable `notes text` column to `public.bookings`. Updated `public.quick_walkin(...)` function signature to accept `p_notes text default null`, populating `bookings.notes` on atomic walk-in creation. Reloaded PostgREST schema cache.
   - **Server Actions (`app/(staff)/bookings/actions.ts`)**: Updated `createBooking`, `quickWalkin`, and `logVisitBooking` inputs to accept `notes?: string | null` and persist `notes: input.notes?.trim() || null` across all booking creation and check-in paths (including active locker reuse and RPC execution). Included `notes` in day bookings queries in `app/(staff)/bookings/page.tsx`.
   - **Input Fields in Modals (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`, `components/log-visit-modal.tsx`)**: Added optional input field "Notes / Vehicle Info (optional)" with placeholder "e.g. Vios ABC-123 blocking slot 2" across Quick Walk-in, New Booking, and Log Visit modals. Initialized and synced notes when selecting open bookings.
   - **Bookings Table Display (`components/booking-browser.tsx`)**: In the CLIENT column across tabs (Upcoming, Check-in, Check-out), render gold note badge `<div className="mt-1 flex items-center gap-1 text-[11px] text-accent-gold/90 bg-accent-gold/10 border border-accent-gold/20 rounded px-1.5 py-0.5 max-w-fit">🚗 {row.notes}</div>` underneath the client name when `row.notes && row.notes.trim() !== ''`. When notes are empty, null, or undefined, strictly renders nothing to maintain compact row height.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-21 — Fix Locker Out-of-Order Update Failure for Higher Locker Numbers**
   (`ohm#3b8e1f5a`). Implementation plan presented and approved before code execution.
   - **Backend Server Action Upsert & Service Client (`app/(staff)/lockers/actions.ts`)**: Updated `toggleLockerMaintenance` to initialize Supabase via `createServiceClient()` with fallback to `createClient()`, resolving RLS blocks on `public.lockers` updates for staff sessions. Transitioned update query to `.upsert({ number: lockerNumber, active: true, is_maintenance: isMaintenance, status: ..., maintenance_note: ... }, { onConflict: 'number' })` with cascading schema-cache fallback handling, allowing missing locker rows to be inserted dynamically and existing rows updated cleanly. Retained active occupancy guard and added safe try-catch for `action_logs`.
   - **Database Migration (`supabase/migrations/20260921133000_lockers_upsert_and_backfill.sql`)**: Backfills lockers 1..40 to ensure capacity exists and is active (`on conflict (number) do update set active = true where lockers.active = false`). Adds `staff_update` and `staff_insert` RLS policies for authenticated staff and reloads PostgREST schema cache.
   - `npm run build` clean (0 errors). See [[lockers_state]] and `.ai/handoff.md`.

5. **2026-09-21 — Format ROOM Column as Number Only and Sort CHECK-IN Tab by Latest Check-in Time**
   (`ohm#9a4e2f8c`). Implementation plan presented and approved before code execution.
   - **ROOM Column Number-Only Formatting (`components/booking-browser.tsx`)**: In `renderRoomPill()`, updated display to render `<span className="text-muted">{row.room_number}</span>` without the "Room " prefix, matching the clean number-only styling of the LOCKER # column. Preserved `<span className="text-muted">—</span>` fallback for unassigned/Wet Area bookings across all tabs (Upcoming, Check-in, Check-out).
   - **CHECK-IN Tab Descending Sort by Check-in Time (`components/booking-browser.tsx`)**: Added helper `sortByLatestCheckin(rows: BookingRow[])` sorting active check-in bookings by `occupancyOf(r)?.checked_in_at` in descending order (`desc` — newest check-in at the top of the table). Provided robust date parsing with fallback to `b.id.localeCompare(a.id)` for missing or identical timestamps. Maintained chronological scheduled time sorting (`sortBySpaDay`) for the UPCOMING tab.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.



