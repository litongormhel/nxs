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

1. **2026-09-17 — Remove ACTION column and Check Out buttons from Call Sheet**
   (`ohm#remcallsheetact`). Implementation plan presented and approved before code execution.
   - **Operational Read-Only Separation (`components/call-sheet-browser.tsx`, `app/(staff)/call-sheet/page.tsx`)**: Converted Call Sheet view into a strictly operational read-only display for floor dispatching (Locker, Room, Service, Thera, Client, Time, Status). Removed `ACTION` table header (`<th>ACTION</th>`), row-level `Check Out` buttons, `CheckoutConfirmModal` import and bindings, and stale `needsCheckout` section.
   - **Clean Horizontal Grid Alignment (`components/call-sheet-browser.tsx`)**: Re-aligned grid columns cleanly: 7 columns on `"All"` tab (`LOCKER` | `ROOM` | `SERVICE` | `THERA` | `CLIENT` | `TIME` | `STATUS`, `"0.8fr 0.8fr 1.5fr 1fr 1.2fr 1fr 1.1fr"`), and 5 columns on specific time slot tabs (`LOCKER` | `ROOM` | `SERVICE` | `THERA` | `CLIENT`, `"0.8fr 0.8fr 1.5fr 1fr 1.2fr"`).
   - **Protected Check-out Functionality (`components/locker-board.tsx`)**: Retained full locker check-out functionality protected by `CheckoutConfirmModal` under the **Lockers Tab** and Bookings Check-in tab.
   - `npm run build` clean. See [[operations_state]] and `.ai/handoff.md`.

2. **2026-09-17 — Add Check-out Confirmation Modal with Early/Pre-Massage Alert**
   (`ohm#checkoutconfirm`). Implementation plan presented and approved before code execution.
   - **Check-Out Confirmation Dialog (`components/checkout-confirm-modal.tsx`)**: Created reusable `CheckoutConfirmModal` component displaying Client Codename, Assigned Locker, and Room & Service. Evaluates client operating status (`getSlotStatus`). Displays high-visibility amber warning box `⚠ Scheduled Massage Alert: Client has a massage scheduled for [Start Time] with [Therapist]. Are you sure you want to check them out early?` when current time is before or during the 90-minute massage window. Displays standard confirmation prompt for Wet Area or completed massages.
   - **Cross-View Trigger Interceptors (`components/booking-browser.tsx`, `components/call-sheet-browser.tsx`, `components/locker-board.tsx`, `app/(staff)/lockers/page.tsx`, `app/(staff)/call-sheet/page.tsx`)**: Intercepted Check Out button clicks on Bookings Check-in tab, Call Sheet (In Progress & Needs Checkout tables), and Locker Board cards. Expanded server queries to pass room, service, start_time, duration_minutes, and therapist details to feed the modal dialog.
   - `npm run build` clean. See [[operations_state]] and `.ai/handoff.md`.

3. **2026-09-17 — Link all Room dropdowns to configured Room Capacity (18) instead of hardcoded 20**
   (`ohm#roomcapdynamic`). Implementation plan presented and approved before code execution.
   - **Frontend Dynamic Sourcing (`app/(staff)/bookings/page.tsx`, `components/booking-browser.tsx`, `components/booking-form-modal.tsx`, `components/quick-walkin-modal.tsx`)**: Query active rooms from Supabase `rooms` table (`active = true`). Compute `effectiveRooms` fallback defaulting strictly to 18 (1 to 18) when room queries are empty or loading instead of hardcoding 20 rooms. Updated free room availability checks and option dropdown mappings across all modals (`New Booking`, `Quick Walkin`, `Edit Booking`).
   - **Backend Server Action Guard (`app/(staff)/bookings/actions.ts`)**: Added `getMaxRoomCapacity(supabase)` helper to retrieve active room count (defaulting to 18). Enforced room capacity validation guard in `createBooking`, `quickWalkin`, and `editBooking` server actions to reject any assigned `room_number` exceeding configured room capacity (or `< 1`).
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-17 — Hide Massage Time / Schedule Picker when Service Downgraded to Wet Area in Edit Booking Modal**
   (`ohm#editbkgwettimehide`). Implementation plan presented and approved before code execution.
   - **Conditional Schedule Picker Rendering (`components/booking-browser.tsx`)**: Wrapped **Massage Time / Schedule** section in `{isMassageService && (...)}`. When service is changed to "Wet Area", the schedule slot selector is completely hidden. Updated form payload in `handleConfirmSave` to pass `startTime: isMassageService ? startTime : null`.
   - **Server Action Handling (`app/(staff)/bookings/actions.ts`)**: Updated `EditBookingInput.startTime` type to `string | null`. Computed `finalStartTime` in `editBooking` action. When downgraded to Wet Area, clearing `therapist_id` and `room_number` immediately releases the booking from the `no_double_book_therapist` and `no_double_book_room` GiST exclusion constraints, freeing up the massage slot immediately for other bookings on that day.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-17 — Dynamic Room/Therapist Handling & Sales Adjustment in Edit Booking Modal**
   (`ohm#editbkgsvcroom`). Implementation plan presented and approved before code execution.
   - **Dynamic Form Fields (`components/booking-browser.tsx`)**: Extended `EditBookingModal` to inspect selected service (`isMassageService = selectedService.name !== "Wet Area"`). Renders `Assign Room` dropdown when Massage is selected, computes same-day room availability at `startTime`, marks occupied rooms, and requires selecting both a **Room** and a **Therapist**. Automatically resets `room_number = null` and `therapist_id = null` when downgraded to Wet Area. Added **Price & Remittance Banner** showing original service price vs new service price, price difference (+₱X / -₱X), and updated sales remittance total. Passed `rooms={rooms}` from `BookingBrowser`.
   - **Backend Action & Sales Sync (`app/(staff)/bookings/actions.ts`)**: Updated `editBooking` server action to accept `roomNumber`. Enforces required Room and Therapist for massage services and clears them for Wet Area. Updates `bookings.room_number` and `locker_occupancy.room_number` simultaneously so Call Sheet immediately reflects room changes. Automatically adjusts active non-voided `sales.amount` by the price difference when service changes and updates `sales.service_id` and `sales.therapist_id`.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.




