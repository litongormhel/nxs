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

### Last Completed Tasks

1. **2026-09-19 — Fix Missing void_reason Column Error in Sales Void and Convert Reason to Dropdown**
   (`ohm#8d4f2b1a`). Implementation plan presented and approved before code execution.
   - **Schema & Migration (`supabase/migrations/20260919110000_add_sales_void_reason.sql`)**: Generated migration adding `void_reason text` to `public.sales` with `if not exists` guard.
   - **Action Resilience (`app/(staff)/sales/actions.ts`)**: Updated `voidSale` and `restoreSale` to attempt updating `void_reason`, with automated fallback omitting `void_reason` if the column is not yet present in the live Supabase schema cache. Guaranteed audit log insertion into `action_logs` (`sale_void` / `sale_restore`) recording acting staff and void/restore reason.
   - **Standardized Dropdown UI (`components/sales-browser.tsx`)**: Replaced free-text void reason input with a `<select>` dropdown featuring 6 standard reasons: `Double booking / Duplicate entry`, `Client cancelled / No-show`, `Incorrect service / Amount encoded`, `Incorrect payment method`, `Test transaction`, and `Other`. Conditionally renders an optional details text input when `Other` is selected. Maintained immediate sales remittance card recalculation and table line-through state updates.
   - `npm run build` clean. See [[sales_state]] and `.ai/handoff.md`.

2. **2026-09-19 — Remove Assign to Client Section and Fix [object Object] Error in Locker Modal**
   (`ohm#9a4b2c8e`). Implementation plan presented and approved before code execution.
   - **UI Cleanup (`components/locker-board.tsx`)**: Removed the "Assign to Client" card and redirect button ("Go to Bookings / Check-in →"). Streamlined the Free Locker modal strictly to header status dot (`Locker #X • Available`), error banner, "Mark Out of Order" section (note input + submit button), and Cancel button. Removed redundant "Options" button from free locker cards, making each card directly clickable with centered label and gold hover effects.
   - **Error Handling & Serialization (`app/(staff)/lockers/actions.ts`, `components/locker-board.tsx`)**: Fixed `[object Object]` error alert by normalizing `fail()` helper in `actions.ts` to extract `.message` from Supabase `PostgrestError` and other error objects, wrapping `toggleLockerMaintenance` in `try...catch`, and defensively formatting `actionError` rendering in both Free and Maintenance locker modals.
   - `npm run build` clean. See [[lockers_state]] and `.ai/handoff.md`.

3. **2026-09-19 — Add Cancel Action Button Beside Reassign in Bookings Table**
   (`ohm#6c9d3e1a`). Implementation plan presented and approved before code execution.
   - **Bookings Action Cell UI (`components/booking-browser.tsx`)**: Added a `Cancel` action button beside `Reassign` for `Needs Reassignment` rows styled with `rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10`.
   - **Cancellation Confirmation Modal (`components/booking-browser.tsx`)**: Clicking Cancel opens a confirmation dialog showing client codename, service, room, date, and time, with an editable cancellation reason input (`"Client decided not to reschedule"`).
   - **Server Action (`app/(staff)/bookings/actions.ts`)**: Implemented and exported `cancelBooking(bookingId, staffId?, reason?)`. Sets booking `status: 'Cancelled'` (releasing room and slot from GiST exclusion constraints), logs to `action_logs` with staff attribution, and revalidates `/bookings`, `/dashboard`, and `/call-sheet`. Delegated `cancelReassignmentBooking` to `cancelBooking`.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-19 — Disable Time Slot Selection Until Therapist Is Selected in Quick Walk-in and New Booking**
   (`ohm#7d2a5f1e`). Implementation plan presented and approved before code execution.
   - **Quick Walk-in (`components/quick-walkin-modal.tsx`)**: Disabled all Time Slot pill buttons and the "Use a custom time instead" checkbox when no therapist is selected (`disabled={!isTherapistSelected}`). Applied `opacity-40 cursor-not-allowed` styling. Added visual helper text `"Select a therapist first to see available slots"`. Reset `slotTime` and `useCustomTime` when therapist selection changes to empty.
   - **New Booking Modal (`components/booking-form-modal.tsx`)**: Mirrored the exact same behavior: gated Time Slot buttons and custom time controls on active therapist selection, styled disabled states with `opacity-40 cursor-not-allowed`, displayed helper text when no therapist is selected, and automatically cleared time slot and custom time when therapist is deselected.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-19 — Add Maintenance / Out of Order Status and Notes for Lockers**
   (`ohm#4f7b9e2a`). Implementation plan presented and approved before code execution.
   - **Schema & Migration (`supabase/migrations/20260919100000_lockers_maintenance.sql`, `lib/types/database.ts`)**: Added `status`, `is_maintenance`, and `maintenance_note` to `public.lockers`. Added `staff_update` RLS policy permitting all staff (`is_staff()`) to toggle maintenance. Updated `quick_walkin` RPC to reject out-of-order lockers.
   - **Server Action (`app/(staff)/lockers/actions.ts`)**: Implemented `toggleLockerMaintenance(lockerNumber, isMaintenance, note?, staffId)`. Blocks marking active occupied lockers as out of order, updates locker status/note, audits into `action_logs`, and revalidates locker/booking paths. Added server guard in `app/(staff)/bookings/actions.ts`.
   - **Locker Board UI (`app/(staff)/lockers/page.tsx`, `components/locker-board.tsx`)**: Distinct red dashed border and badge display for out-of-order lockers with maintenance note preview. Clicking a free locker shows options to Assign Guest or Mark Out of Order (with note input); clicking an out-of-order locker allows viewing note and clearing maintenance. Header metric shows working capacity and out-of-order count.
   - **Check-in Selectors Exclusion (`components/quick-walkin-modal.tsx`, `components/log-visit-modal.tsx`, `components/booking-browser.tsx`)**: Excludes/disables out-of-order lockers with clear descriptive labels across Quick Walk-in, Log Visit, and Edit Booking modals with front-end and back-end validation.
   - `npm run build` clean. See [[lockers_state]] and `.ai/handoff.md`.

