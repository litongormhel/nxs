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

1. **2026-09-19 — Remove Dashboard, Set Bookings as Default Landing, and Reorder Sidebar Navigation**
   (`ohm#8b3f1a9c`). Implementation plan presented and approved before code execution.
   - **Removed Dashboard Route (`app/(staff)/dashboard/`)**: Obsolete standalone dashboard page and error boundary removed. Added permanent redirect from `/dashboard` to `/bookings` in `next.config.ts`.
   - **Default Landing Route (`app/(staff)/page.tsx`, `proxy.ts`, `app/(auth)/login/`)**: Configured `/bookings` as the default landing route for root `/`, post-login redirection, and authenticated navigation.
   - **Reordered Sidebar Navigation (`lib/nav.ts`)**: Removed Dashboard and updated navigation order to exact sequence: Bookings, Call Sheet, Therapists, Lockers, Sales, Clients, Analytics, Staff, Logs, Settings.
   - **Relocated Needs Reassignment Alert (`app/(staff)/bookings/page.tsx`)**: Mounted `<ReassignmentPanel />` directly above the bookings table/browser with live therapist/absence/leave checks and keyed remount reactivity on `<BookingBrowser />`.
   - `npm run build` clean. See [[dashboard_state]], [[bookings_state]], and `.ai/handoff.md`.

2. **2026-09-18 — Allow Therapist Selection with Time Slot Picker in Reassign Modal**
   (`ohm#alignreassignmentslotsandselection`).
   - **Dropdown Selection Rules (`components/reassignment-panel.tsx`)**: In the "New Therapist" dropdown, disable ONLY therapists who are Day Off, Absent, On Leave, or Fully Booked. Label disabled options accordingly (`[Name] — Day Off`, `[Name] — Absent`, `[Name] — On Leave`, `[Name] — Fully Booked`). Working therapists with at least 1 free slot remain selectable even if booked at the original session time.
   - **Interactive Time Slot Picker (`components/reassignment-panel.tsx`)**: Added clickable time slot pills below the therapist selector pre-selecting the original booking time. Occupied slots for the selected therapist appear disabled, struck-through, red, and marked "Booked"; available slots appear with emerald/green accent styling and "Free" indicator.
   - **Reschedule & Validation Workflow**: If the pre-selected time is occupied, prompts the receptionist to pick an available slot and disables the Confirm button. Selecting a free slot displays a reschedule preview and enables the Confirm button.
   - **Server Action Update (`app/(staff)/bookings/actions.ts`)**: Updated `changeBookingTherapist` to accept an optional `newStartTime?: string`. Updates both `therapist_id` and (if changed) `start_time`, resets `Needs Reassignment` status back to `Booked`, and revalidates paths `/dashboard` and `/bookings`.
   - `npm run build` clean. See [[dashboard_state]], [[bookings_state]], and `.ai/handoff.md`.

3. **2026-09-17 — Replace Client Select Dropdown in New Booking Modal with Searchable Combobox**
   (`ohm#newbookingclientcombobox`).
   - **Active Members Filter (`components/client-combobox.tsx`)**: Excludes archived clients (`is_archived !== true && archived_at == null`) and filters records where `is_active !== false`.
   - **Searchable Combobox / Typeahead (`components/client-combobox.tsx`, `components/booking-form-modal.tsx`)**: Replaced native `<select>` dropdown with searchable combobox typeahead component. Defaults to `No Account` (`"— Walk-in / No account —"`).
   - **Typeahead & Keyboard Navigation**: Dynamically filters active members by codename, handle (`@username`), or member code (`#member_code`). Includes persistent `— Walk-in / No account —` top option and `✕` clear button. Fully supports keyboard navigation (ArrowUp/ArrowDown, Enter to select, Esc to close, click outside to close).
   - **Styling Consistency**: Matches modal dark theme (`bg-background`, `border-border`, gold accents on focus/selection, `text-sm`, `shadow-xl shadow-black/60`).
   - **Data Source Query (`app/(staff)/bookings/page.tsx`)**: Updated Supabase client query to include `member_code` for member code search matching.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-17 — Enforce Proportional Points Calculation & Display Earned Points in Confirm Check-in**
   (`ohm#proportionalpointscheckin`).
   - **Dynamic Proportional Calculation (`components/log-visit-modal.tsx`)**: Fetches `app_settings` on mount (defaulting to `"proportional"` if unset). Dynamically recomputes `pointsDelta` reactively using `computeLoyaltyPoints(mode, servicePaidAmount, price, basePoints, pesoPerPoint)` whenever service, promo, manual discount, or total amount changes.
   - **Points Earned Row in Confirm Check-in (`components/log-visit-modal.tsx`)**: Added `Points Earned: +X pts` (styled with gold accent text `text-accent-gold`) inside the `Confirm Check-in` receipt card for Member clients (`clientId`), while omitting points display for walk-ins without an account.
   - **Backend Action Alignment (`app/(staff)/bookings/actions.ts` & `lib/loyalty.ts`)**: Updated `resolveEarnedPoints` to default to `"proportional"` mode when `loyalty_formula_mode` is null in `app_settings`, and guarded `computeLoyaltyPoints` against zero-price division and negative results.
   - `npm run build` clean. See [[points_ledger_state]] and `.ai/handoff.md`.

5. **2026-09-17 — Universal Edit/Void/Restore with Mandatory Manager PIN on Daily Sales Remittance**
   (`ohm#salesvoidrestorepin`, `ohm#fixmissingsales`). Implementation plan presented and approved before code execution.
   - **Header Clean Up (`components/sales-browser.tsx`)**: Removed `(Spa Operational Window 8:00 AM – 2:00 AM)` pill/badge from title header.
   - **Universal Row Actions (`components/sales-browser.tsx`)**: Removed `is_walkin` action blocking (`No action — walk-in, no account`). All sales rows (members & walk-ins) feature `[Edit]` and `[Void]` buttons when active, and `[Restore]` button when voided.
   - **Mandatory Manager PIN Modal (`components/sales-browser.tsx`)**: Triggers a Security PIN Confirmation Modal before executing `Void` or `Restore`, prompting for 4 to 6 digit Manager/Owner PIN and required reason string.
   - **Backend Actions & RPC (`app/(staff)/sales/actions.ts` & `20260917170000_sales_void_restore_pin.sql`)**: Implemented `voidSale` and `restoreSale` server actions backed by SECURITY DEFINER RPCs (`void_sale_with_pin`, `restore_sale_with_pin`) validating PIN against `app_settings.void_auth_code_hash`, auditing into `action_logs`, and updating sales void status & `void_reason`.
   - **Query Resilience & Fallback (`app/(staff)/sales/page.tsx`)**: Added `salesResFirstTry.error` logging and automated fallback query without `void_reason`, ensuring sales records are never hidden even if DB migrations are unapplied.
   - `npm run build` clean. See [[sales_state]] and `.ai/handoff.md`.
