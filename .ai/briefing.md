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

1. **2026-09-21 — Exclude Upcoming and Unchecked-in Advance Bookings from Walk-in Guests Profile Tab**
   (`ohm#9f3e1b7c`). Implementation plan presented and approved before code execution.
   - **Audit & Status Filter (`app/(staff)/clients/page.tsx`)**: Filtered `rawWalkIns` in Manila time (`Asia/Manila`, UTC+8). Excluded scheduled future bookings (`booking_date > todayManila`) and un-checked-in advance bookings. A walk-in booking is strictly included only if status is `completed`, `in_service`, or has a direct `locker_occupancy` or `sales` record linked by `booking_id`. Excluded un-checked-in bookings with status `Booked`, `Needs Reassignment`, `Cancelled`, `No-show`, `confirmed`, or `pending`.
   - **Verified History Counts & Grouping (`components/client-browser.tsx`)**: Added defensive status/locker/payment checks to `groupedWalkIns`. Ensured `TOTAL VISITS` count (`visitCount`) and `LAST VISIT DATE` (`lastVisitDate`) strictly reflect actual past/completed visits.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Fix Walk-In Guest History Click Action, Locker Resolution, and Zero Amount Formatting**
   (`ohm#4c9e2b1a`). Implementation plan presented and approved before code execution.
   - **Interactive History Drawer (`components/client-browser.tsx`)**: Mounted slide-over drawer triggered by "View Past Stays →" button or table row click for walk-in guests (`activeWalkInGroup`). Renders detailed visit cards showing Visit #, Date, 12-hour Time, Service, Therapist, Massage Time, Room (`Room [Num]` or `None (Wet Area)`), Locker (`Locker [Num]` or `None`), explicit Amount Paid & Payment Method, Status, and Booking ID. Fully styled with theme tokens (`bg-surface`, `bg-surface-2`, `border-border`, gold accents).
   - **Cascading Locker & Amount Resolution (`app/(staff)/clients/page.tsx`, `components/client-browser.tsx`)**: Audited queries and added parallel fetching for historical `locker_occupancy` and `sales`. Resolved locker numbers via cascading fallback (direct join by `booking_id` -> historical occupancy by `booking_id` -> historical occupancy by `guest_label` and date -> latest historical locker for guest), eliminating "—" for past walk-ins like "L", "jave", and "VINCE".
   - **Zero Amount Formatting (`components/client-browser.tsx`, `app/(staff)/clients/page.tsx`)**: Replaced truthy checks with strict null/undefined checks (`amount != null`), explicitly formatting zero amounts as `₱0` (with payment method if available) across both table rows and history drawers.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Prevent Auto-Dismissal of SMS Preview Modal in New Booking Flow**
   (`ohm#2a5d8f3c`). Implementation plan presented and approved before code execution.
   - **Modal Persistence & Backdrop Protection (`components/sms-preview-modal.tsx`)**: Isolated mouse and click events (`stopPropagation`) on the modal backdrop scrim and card container, preventing accidental dismissals from window switching, background clicks, or document-level event listeners. Modal requires explicit staff action ("Done") to close.
   - **Visual Copy Feedback & Uninterrupted Preview (`components/sms-preview-modal.tsx`)**: Upgraded "Copy" button to robust async clipboard copy with `execCommand` fallback. Clicking "Copy" shows clear `"✓ Copied!"` visual feedback (emerald accent styling with 3-second auto-reset) while keeping the modal firmly open so staff can review or send the text without premature interruption.
   - **Lifecycle & Deferred Revalidation (`components/booking-form-modal.tsx`)**: Introduced explicit `showSmsPreview` modal state. Saving advance bookings for registered clients opens the SMS Preview dialog while deferring parent `onCreated()` revalidation and success toast dispatch until staff clicks "Done", ensuring zero premature unmounting.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-21 — Fix Client Selection and Portal Account Warning Handling in Quick Walkin Modal**
   (`ohm#7d2e4f1a`). Implementation plan presented and approved before code execution.
   - **Non-blocking Portal Account Advisory (`components/quick-walkin-modal.tsx`)**: Added amber advisory notice when selecting a registered client without an online portal account: *"Client has no online portal account — walk-in booking can be confirmed normally, but loyalty points cannot be earned or redeemed for this visit."* Added subtle `No Portal Account` badge in client search typeahead suggestion list. Updated fallback query (`!propClients`) to fetch `client_portal_accounts` via `Promise.all` so `has_portal_account` evaluates accurately. Form remains completely operable.
   - **Graceful Server Action Handling (`app/(staff)/bookings/actions.ts`)**: In `quickWalkin`: checks `client_portal_accounts` for `input.clientId`. When no portal account exists, sets `pointsAwarded: null` and returns `pointsReason: "no_portal_account"`, omitting points from `quick_walkin` RPC (`p_points_earned: null`). Completely eliminates DB trigger `trg_require_portal_account_for_earn_redeem` violation, allowing the walk-in booking, sale, and locker occupancy to be created cleanly with the selected `client_id`. In `QuickWalkinModal`, skips unconfigured formula dialog when `pointsReason === "no_portal_account"`, immediately displaying the context-rich success toast and closing modal.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-21 — Make Date Picker Calendar Indicator Visible and White on Dark Backgrounds**
   (`ohm#3f7a1b9e`). Implementation plan presented and approved before code execution.
   - **Calendar Picker Indicator Styling (`app/globals.css`)**: Styled `input[type="date"]::-webkit-calendar-picker-indicator` with `filter: invert(1)` and pointer cursor for crisp, white visibility against dark surfaces (`bg-surface`, `bg-surface-2`). Added smooth hover opacity transition (`opacity: 0.85` to `1.0`). Scoped `filter: invert(0)` under `body.light` to preserve standard dark indicator contrast on light backgrounds.
   - **Therapist Browser Interaction Parity (`components/therapist-browser.tsx`)**: Added `cursor-pointer` to the toolbar date filter input (`viewDate`) and Mark On Leave modal inputs (`leaveStart`, `leaveEnd`). Wired safe click handler calling `e.currentTarget.showPicker?.()` in a `try/catch` block so clicking anywhere on the input or icon smoothly triggers the native date picker popover. Preserved layout, padding, font styling, and focus borders.
   - `npm run build` clean (0 errors). See [[therapists_state]] and `.ai/handoff.md`.



