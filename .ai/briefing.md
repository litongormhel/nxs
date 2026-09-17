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

1. **2026-09-17 — Hide Massage Time / Schedule Picker when Service Downgraded to Wet Area in Edit Booking Modal**
   (`ohm#editbkgwettimehide`). Implementation plan presented and approved before code execution.
   - **Conditional Schedule Picker Rendering (`components/booking-browser.tsx`)**: Wrapped **Massage Time / Schedule** section in `{isMassageService && (...)}`. When service is changed to "Wet Area", the schedule slot selector is completely hidden. Updated form payload in `handleConfirmSave` to pass `startTime: isMassageService ? startTime : null`.
   - **Server Action Handling (`app/(staff)/bookings/actions.ts`)**: Updated `EditBookingInput.startTime` type to `string | null`. Computed `finalStartTime` in `editBooking` action. When downgraded to Wet Area, clearing `therapist_id` and `room_number` immediately releases the booking from the `no_double_book_therapist` and `no_double_book_room` GiST exclusion constraints, freeing up the massage slot immediately for other bookings on that day.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

2. **2026-09-17 — Dynamic Room/Therapist Handling & Sales Adjustment in Edit Booking Modal**
   (`ohm#editbkgsvcroom`). Implementation plan presented and approved before code execution.
   - **Dynamic Form Fields (`components/booking-browser.tsx`)**: Extended `EditBookingModal` to inspect selected service (`isMassageService = selectedService.name !== "Wet Area"`). Renders `Assign Room` dropdown when Massage is selected, computes same-day room availability at `startTime`, marks occupied rooms, and requires selecting both a **Room** and a **Therapist**. Automatically resets `room_number = null` and `therapist_id = null` when downgraded to Wet Area. Added **Price & Remittance Banner** showing original service price vs new service price, price difference (+₱X / -₱X), and updated sales remittance total. Passed `rooms={rooms}` from `BookingBrowser`.
   - **Backend Action & Sales Sync (`app/(staff)/bookings/actions.ts`)**: Updated `editBooking` server action to accept `roomNumber`. Enforces required Room and Therapist for massage services and clears them for Wet Area. Updates `bookings.room_number` and `locker_occupancy.room_number` simultaneously so Call Sheet immediately reflects room changes. Automatically adjusts active non-voided `sales.amount` by the price difference when service changes and updates `sales.service_id` and `sales.therapist_id`.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

3. **2026-09-17 — Add Pre-Confirmation Summary Dialog in Log Visit Modal**
   (`ohm#logvstsummary`). Implementation plan presented and approved before code execution.
   - **Two-Step Form Validation & Review Flow (`components/log-visit-modal.tsx`)**: Updated primary "Confirm" button to validate required inputs (therapist unless Wet Area, locker assignment, split payment balance equality, and client portal account check) and transition to `showSummary = true` pre-confirmation view.
   - **Compact Scannable Receipt Card (`components/log-visit-modal.tsx`)**: Displayed client receipt card styled with `#0c0a09` charcoal background, `#292524` borders, and Gold/Ember font accents. Summarizes Client Codename (adhering strictly to client privacy rules), Therapist name (or `None (Wet Area)`), Massage Time (`fmtTime`), Locker number, Room number, Service Availed (with upgrade and add-ons formatted), and Total Payment with formatted payment method breakdown (`₱X (Cash)`, `₱X (GCash - Ref: Y)`, or `₱X (Cash: ₱A | GCash: ₱B)`).
   - **Action Buttons (`components/log-visit-modal.tsx`)**: Added "Back / Edit" button to return staff to form view with all inputs preserved, and "Finalize Check-in" primary gold button to trigger `logVisitBooking` server action with `isPending` loading state.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-17 — Drop `one_active_occupant_per_room` Constraint from `locker_occupancy` to Decouple Room Sessions from Locker Stays**
   (`ohm#droprmoccupancy`). Implementation plan presented and approved before code execution.
   - **Database Migration (`supabase/migrations/20260917130000_drop_room_occupancy_unique_index.sql`)**: Dropped partial unique index `public.one_active_occupant_per_room` on `locker_occupancy(room_number) WHERE checked_out_at IS NULL`.
   - **Server Action Handling (`app/(staff)/bookings/actions.ts`)**: Removed dead `one_active_occupant_per_room` unique violation error handling from `quickWalkin` and `logVisitBooking` (both update and insert branches). Decoupled 90-minute massage room session windows from all-day locker stays so consecutive clients in different time slots can occupy the same room on the same day without false "That room is already occupied" errors.
   - `npm run build` clean. See [[bookings_state]], [[operations_state]], and `.ai/handoff.md`.

5. **2026-09-17 — Format Activity Logs Action and Detail into Clean Human-Readable Entries**
   (`ohm#actloghuman`). Implementation plan presented and approved before code execution.
   - **Clean Action Labels**: Mapped raw snake_case database function keys (`quick_walkin`, `edit_booking`, `therapist_mark_on_leave`, `therapist_unarchive`, `therapist_archive`, `therapist_toggle_day_off`, `locker_checkout`, `cancel_reassignment_booking`, `therapist_create`, `sale_edit`, `sale_void`, etc.) to clean Title Case labels with fallback. Displayed in Action filter options and inside subtle gold badges (`inline-flex items-center rounded-md bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-accent-gold ring-1 ring-inset ring-gold/20`).
   - **Refined Detail Templates & Zero Technical ID Dumps**:
     - `cancel_reassignment_booking`: Formatted `Cancelled reassignment for booking on [Date] ([Reason]).`
     - `therapist_create`: Formatted `Created therapist [Therapist Name].`
     - `sale_edit` & `sale_void`: Formatted `Updated sale to ₱[Amount] ([Payment Method]).` and `Voided sale.`, eliminating secondary `sale_id=uuid` lines.
     - `quick_walkin`: Stripped technical IDs (`sale_id=...`, `booking_id=...`). Output formatted `Walk-in: [Client Codename] — [Service], [₱Amount]`.
     - Therapist Actions (`therapist_mark_on_leave`, `therapist_archive`, `therapist_unarchive`): Server-side lookup of therapist names via UUID batch collection in `app/(staff)/logs/page.tsx`. Formatted e.g., `Marked [Therapist Name] on leave from [Start] to [End]`, `Archived [Therapist Name]`, `Unarchived [Therapist Name]`.
     - `edit_booking`: Formatted diffs into human phrasing e.g. `Updated booking: Locker 19 assigned (4:00 PM)`. Stripped raw `booking_id=uuid`.
     - `locker_checkout`: Formatted to concise `Checked out Locker [Number]`. Stripped technical IDs.
     - **Fallback Sanitizer (`formatFallbackDetail`)**: For unmapped actions, filters out raw UUIDs/IDs and formats remaining key-value fields cleanly (e.g. `Date: 2026-08-30 · Reason: ...`).
   - **Default Date Filter to Current Date (`components/logs-browser.tsx`)**: Defaulted `dateFilter` state to `spaDayNow()`, filtering logs against `toSpaDay(created_at)`. Added interactive "All Dates" / "Today" toggle buttons enabling easy clearing or switching back to current date.
   - **Visual Hierarchy**: Primary detail text styled in crisp `text-foreground text-[12px]`.
   - `npm run build` clean. See [[logs_state]] and `.ai/handoff.md`.




