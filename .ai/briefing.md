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

1. **2026-09-21 — Prevent Auto-Dismissal of SMS Preview Modal in New Booking Flow**
   (`ohm#2a5d8f3c`). Implementation plan presented and approved before code execution.
   - **Modal Persistence & Backdrop Protection (`components/sms-preview-modal.tsx`)**: Isolated mouse and click events (`stopPropagation`) on the modal backdrop scrim and card container, preventing accidental dismissals from window switching, background clicks, or document-level event listeners. Modal requires explicit staff action ("Done") to close.
   - **Visual Copy Feedback & Uninterrupted Preview (`components/sms-preview-modal.tsx`)**: Upgraded "Copy" button to robust async clipboard copy with `execCommand` fallback. Clicking "Copy" shows clear `"✓ Copied!"` visual feedback (emerald accent styling with 3-second auto-reset) while keeping the modal firmly open so staff can review or send the text without premature interruption.
   - **Lifecycle & Deferred Revalidation (`components/booking-form-modal.tsx`)**: Introduced explicit `showSmsPreview` modal state. Saving advance bookings for registered clients opens the SMS Preview dialog while deferring parent `onCreated()` revalidation and success toast dispatch until staff clicks "Done", ensuring zero premature unmounting.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Fix Client Selection and Portal Account Warning Handling in Quick Walkin Modal**
   (`ohm#7d2e4f1a`). Implementation plan presented and approved before code execution.
   - **Non-blocking Portal Account Advisory (`components/quick-walkin-modal.tsx`)**: Added amber advisory notice when selecting a registered client without an online portal account: *"Client has no online portal account — walk-in booking can be confirmed normally, but loyalty points cannot be earned or redeemed for this visit."* Added subtle `No Portal Account` badge in client search typeahead suggestion list. Updated fallback query (`!propClients`) to fetch `client_portal_accounts` via `Promise.all` so `has_portal_account` evaluates accurately. Form remains completely operable.
   - **Graceful Server Action Handling (`app/(staff)/bookings/actions.ts`)**: In `quickWalkin`: checks `client_portal_accounts` for `input.clientId`. When no portal account exists, sets `pointsAwarded: null` and returns `pointsReason: "no_portal_account"`, omitting points from `quick_walkin` RPC (`p_points_earned: null`). Completely eliminates DB trigger `trg_require_portal_account_for_earn_redeem` violation, allowing the walk-in booking, sale, and locker occupancy to be created cleanly with the selected `client_id`. In `QuickWalkinModal`, skips unconfigured formula dialog when `pointsReason === "no_portal_account"`, immediately displaying the context-rich success toast and closing modal.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Make Date Picker Calendar Indicator Visible and White on Dark Backgrounds**
   (`ohm#3f7a1b9e`). Implementation plan presented and approved before code execution.
   - **Calendar Picker Indicator Styling (`app/globals.css`)**: Styled `input[type="date"]::-webkit-calendar-picker-indicator` with `filter: invert(1)` and pointer cursor for crisp, white visibility against dark surfaces (`bg-surface`, `bg-surface-2`). Added smooth hover opacity transition (`opacity: 0.85` to `1.0`). Scoped `filter: invert(0)` under `body.light` to preserve standard dark indicator contrast on light backgrounds.
   - **Therapist Browser Interaction Parity (`components/therapist-browser.tsx`)**: Added `cursor-pointer` to the toolbar date filter input (`viewDate`) and Mark On Leave modal inputs (`leaveStart`, `leaveEnd`). Wired safe click handler calling `e.currentTarget.showPicker?.()` in a `try/catch` block so clicking anywhere on the input or icon smoothly triggers the native date picker popover. Preserved layout, padding, font styling, and focus borders.
   - `npm run build` clean (0 errors). See [[therapists_state]] and `.ai/handoff.md`.

4. **2026-09-21 — Implement Customizable SMS Confirmation Template in Settings with Official Nexus Spa Copy**
   (`ohm#4f8e1b2d`). Implementation plan presented and approved before code execution.
   - **Default Official Template & Variable Utility (`lib/bookings/sms.ts`)**: Established official Nexus Spa confirmation copy as default template (`DEFAULT_SMS_TEMPLATE`). Supported variables (`{booking_date}`, `{client_name}`, `{slot_time}`, `{therapist_name}`, optional `{service_name}` and `{amount}`) and added robust string placeholder interpolation helper (`interpolateSmsTemplate`).
   - **Settings Management UI (`app/(staff)/settings/page.tsx`, `components/settings-browser.tsx`)**: Added "SMS Confirmation Template" management card under the General tab in Settings. Features multiline monospace textarea, clickable variable chips inserting placeholders at cursor position, "Save Template", and "Reset to Default" actions with dirty-state tracking, toast notifications, and role-based permissions (Supervisor/Owner edit, Front Desk read-only).
   - **Database Persistence & Server Actions (`app/(staff)/settings/actions.ts`, `supabase/migrations/20260921100000_app_settings_sms_template.sql`, `lib/types/database.ts`)**: Added `sms_confirmation_template` column to `app_settings` singleton and exported `updateSmsTemplate` and `resetSmsTemplate` actions with `action_logs` audit tracking and `/settings` revalidation. Included resilient query fallback.
   - **SMS Preview Integration (`components/booking-form-modal.tsx`, `components/sms-preview-modal.tsx`)**: BookingFormModal queries active template from `app_settings` on mount, dynamically interpolates booking context upon creating advance registered client bookings, and mounts SmsPreviewModal with full textarea editability and copy-to-clipboard functionality.
   - `npm run build` clean (0 errors). See [[settings_state]], [[bookings_state]], and `.ai/handoff.md`.

5. **2026-09-21 — Add Context-Rich Success Toast Notifications for Bookings Creation**
   (`ohm#8b2f4c1e`). Implementation plan presented and approved before code execution.
   - **Quick Walk-in Modal Feedback (`components/quick-walkin-modal.tsx`)**: Added floating success toast notification triggered upon successful walk-in creation and modal closure (both immediate completion and post-points-warning dismissal). Formats context-rich message: Title: `"Walk-in logged successfully!"`, Subtitle: `Client Name • Service Name (Therapist Name) • Locker #[Num] • Room [Num]` (with null-safe handling for Wet Area without room/therapist).
   - **New Booking Modal Feedback (`components/booking-form-modal.tsx`)**: Added matching floating success toast notification triggered upon successful advance booking save and modal closure (both direct walk-in completions and post-SMS preview dismissal). Formats scheduling context: Title: `"Booking created successfully!"`, Subtitle: `Client Name • [Date], [Slot Time] • Service Name (Therapist Name)`.
   - **DOM-Mounted Toast Dispatcher (`showBookingToast`)**: Mounts toast container directly to `document.body` at `z-[100]` with NXS theme tokens (`border-gold`, `bg-surface-2`, `text-accent-gold`, `text-foreground`, `shadow-2xl`, `animate-fade-in`), ensuring toasts persist across modal unmounting with 4-second auto-fade and click-to-dismiss. Preserves existing inline error handling and server revalidation.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.



