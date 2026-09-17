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

1. **2026-09-17 — Scale down Call Sheet typography and row density to match Bookings table styling**
   (`ohm#callsheettypography`).
   - **Table Header & Filter Controls (`components/call-sheet-browser.tsx`)**: Standardized header text size to `text-xs font-medium tracking-wider uppercase text-muted` with `px-4 py-2.5` padding. Scaled filter pill buttons to `px-3.5 py-1.5 text-xs font-semibold`.
   - **Row Cell Density & Typography (`components/call-sheet-browser.tsx`)**: Reduced row padding from `px-6 py-5` to `px-4 py-2.5 text-sm`. Scaled Locker/Room to `font-mono text-sm font-medium text-foreground`, Service to `text-sm font-medium text-gold`, Therapist to `text-sm text-foreground`, Client to `text-sm font-semibold text-foreground`, Time to `font-mono text-xs text-muted`, and Status badges to `px-2.5 py-0.5 text-xs`.
   - `npm run build` clean. See [[operations_state]] and `.ai/handoff.md`.

2. **2026-09-17 — Align Quick Walk-in Split Payment UI to dropdown option "Split (Cash + GCash)"**
   (`ohm#quickwalkindropdownsplit`). Implementation plan presented and approved before code execution.
   - **Split Payment Dropdown Option (`components/quick-walkin-modal.tsx`)**: Removed standalone `Split Payment` checkbox. Added `Split (Cash + GCash)` directly to Payment Method dropdown options (`Cash`, `GCash`, `Card`, `Maya`, `Split (Cash + GCash)`).
   - **Dual Column Inputs & Auto-balancing (`components/quick-walkin-modal.tsx`)**: Renders side-by-side `Cash Amount (₱)` and `GCash Amount (₱)` inputs with auto-balancing and validation feedback. Reference number field displayed when GCash amount > 0.
   - **Backend Action Parameter Alignment (`app/(staff)/bookings/actions.ts`)**: Updated `quickWalkin` action to extract `splitCashAmount` and `splitGcashAmount`, preserving backend split sales ledger logic.
   - `npm run build` clean. See [[bookings_state]], [[sales_state]], and `.ai/handoff.md`.

3. **2026-09-17 — Remove ACTION column and Check Out buttons from Bookings page**
   (`ohm#rembookingact`).
   - **Check-in Tab Cleanup (`components/booking-browser.tsx`)**: Removed `ACTION` table header (`<th>ACTION</th>`) and `Check Out` button cell (`<td><button ...>Check Out</button></td>`) under the **Check-in** tab table.
   - **Unused State & Modal Clean Up (`components/booking-browser.tsx`)**: Removed `CheckoutConfirmModal` import and `checkoutTarget` state binding from `BookingBrowser`.
   - **Clean Grid Alignment (`components/booking-browser.tsx`)**: Re-aligned Check-in table columns cleanly to 8 columns: `EDIT`, `MASSAGE TIME`, `CLIENT`, `SERVICE`, `ROOM`, `THERAPIST`, `CHECK-IN TIME`, `LOCKER #`. Locker checkout remains strictly protected in the Lockers tab (`components/locker-board.tsx`).
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-17 — Add Quick Search Bar and Time Slot Filters to Bookings Page**
   (`ohm#bookingfilterbar`). Implementation plan presented and approved before code execution.
   - **Quick Search & Filter Controls (`components/booking-browser.tsx`)**: Placed responsive Filter Bar controls directly above active tab table. Added `searchQuery` (instant client-side substring search on client codename/guest label and locker number with clear 'x' button) and `selectedTimeSlot` (`All` + operating-day sorted time slot pills with active gold highlight).
   - **Record Counter & Empty State (`components/booking-browser.tsx`)**: Displays reactive record counter (`Showing X of Y bookings` / `Showing Y bookings`). Displays inline empty state `No bookings match your search or filter criteria.` when no records match filter criteria.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-17 — Port Split Payment support to Quick Walk-in Modal**
   (`ohm#quickwalkinsplitpay`). Implementation plan presented and approved before code execution.
   - **Split Payment UI & Auto-balancing (`components/quick-walkin-modal.tsx`)**: Added `Split Payment` checkbox toggle with state for `isSplitPayment`, `splitMethod1`, `splitAmount1`, `splitMethod2`, `splitAmount2`, and `lastEditedSplitField`. Added auto-balancing logic (`Method 1 + Method 2 === Total Amount`) and validation error badge.
   - **Backend Action Support (`app/(staff)/bookings/actions.ts`)**: Updated `QuickWalkinInput` type to support split payment fields. Updated `quickWalkin` action to insert 2 distinct `sales` entries for split payment channels, guaranteeing accurate shift remittance.
   - `npm run build` clean. See [[bookings_state]], [[sales_state]], and `.ai/handoff.md`.
