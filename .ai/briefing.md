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

1. **2026-09-21 — Fix SMS Confirmation Modal Not Appearing in New Booking Flow**
   (`ohm#1f4c7a9b`). Implementation plan presented and approved before code execution.
   - **Root Cause Resolution (`components/booking-form-modal.tsx`)**: Removed `isRegisteredClient` condition in `handleSubmit` that bypassed `setShowSmsPreview(true)` and prematurely invoked `onCreated()` on walk-in / guest bookings. Unified SMS preview generation across all new bookings using resolved client display name (`walkinName.trim() || "Guest"` or client codename).
   - **Robust Portaling & Modal Lifecycle (`components/sms-preview-modal.tsx`, `components/booking-form-modal.tsx`)**: Updated `SmsPreviewModal` to render via `createPortal(..., document.body)` with client-side hydration guard and `z-[60]` layer. Rendered alongside `BookingFormModal` without early unmount return. `onCreated()` and `showBookingToast` fire cleanly when staff clicks "Done" in the preview.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Allow Active Locker Reuse for Successive Bookings of Same Client**
   (`ohm#5e9a1b3d`). Implementation plan presented and approved before code execution.
   - **Active Locker Reuse Audit & Resolution (`app/(staff)/bookings/actions.ts`)**: Updated `quickWalkin` to audit target locker occupancy before booking. When `locker_occupancy` has an active occupant for `input.lockerNumber` belonging to the same client (`client_id === input.clientId` or matching `guest_label`), safely treats this as active locker reuse.
   - **Duplicate Occupancy Avoidance**: Reuses and updates the existing active `locker_occupancy` row with the new `booking_id`, `service_id`, `room_number`, and `checked_in_by` instead of attempting a duplicate insert, preventing `one_active_occupant_per_locker` (code `23505`) conflicts. If occupied by a different client, strictly returns `"That locker was just taken — pick another."`.
   - **Database Migration (`supabase/migrations/20260921120000_quick_walkin_active_locker_reuse.sql`)**: Updated `quick_walkin` PL/pgSQL function to support locker reuse on matching `p_locker_number` and client identity.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Refine Member Portal UI and Align Verified Past Visit Queries**
   (`ohm#8c1e4f9b`). Implementation plan presented and approved before code execution.
   - **UI Cleanup (`components/client-portal/member-dashboard.tsx`)**: Removed the `#M-XXXXXX` member code badge from the greeting/profile card while cleanly retaining `@username`. Removed the `DURATION` column header and duration text cells from both desktop table and mobile card views.
   - **Verified Past Visit Query Alignment (`app/portal/page.tsx`)**: Upgraded visit history query with relational joins to `point_transactions` and `sales`. Bookings are verified if status is `completed`, or if associated with active `EARN` ledger entries or non-voided sales. Strictly excludes genuinely cancelled/no-show bookings (such as unverified Sep 21 bookings). Verified that member `ohmpayatt` retrieves all 3 legitimate past visits from Sep 18 in chronological descending order, and the counter pill accurately displays `3 visits`.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

4. **2026-09-21 — Update Portal Login Redirect and Confirmation Flow to Member Dashboard**
   (`ohm#5d8f1e2c`). Implementation plan presented and approved before code execution.
   - **Login Redirect Update (`app/portal/login/page.tsx`)**: Updated successful login redirection handler from `/portal/confirmation` directly to `/portal` (Member Dashboard), enabling returning and logging-in members to immediately access their live points balance and past visit records.
   - **Registration Confirmation Bridge (`app/portal/confirmation/page.tsx`)**: Added a prominent primary CTA button ("Go to Dashboard →") leading to `/portal` styled with standard gold tokens (`bg-gold text-background hover:bg-gold-hover`), while retaining the "View my Member QR →" link.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

5. **2026-09-21 — Implement Member Portal Dashboard for Points Summary and Past Visit History**
   (`ohm#6b8a2c4e`). Implementation plan presented and approved before code execution.
   - **Member Portal Route & Authentication (`app/portal/page.tsx`, `app/portal/actions.ts`)**: Implemented dedicated dashboard at `/portal` for authenticated members. Session validated via HMAC token (`getPortalAccountId()`); unauthenticated requests redirect cleanly to `/portal/login`. Created `logoutPortalAction` to securely clear session and redirect.
   - **High-Performance Query Execution (`app/portal/page.tsx`)**: Parallelized queries with `Promise.all` via `createServiceClient()`. Looked up live points balance and member code directly from `clients` using primary key index (O(1), zero table scans or ledger aggregations). Queried verified past visits from `bookings` filtered by `client_id` and `status = 'Completed'`, sorted descending by date/time and capped at 10 records with indexed joins to `services` and `therapists`. Pre-generated QR data URL with `qrcode`.
   - **Responsive Member Dashboard UI (`components/client-portal/member-dashboard.tsx`)**: Built mobile-first member interface with NXS dark theme tokens (`bg-surface`, `bg-surface-2`, `text-gold`, `border-border`). Displays greeting with codename and `@username`, `#M-...` badge, prominent live Points Balance card, "Member QR" modal trigger, full QR code modal with front-desk instructions, and responsive past visits table/card list with empty state handling.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.



