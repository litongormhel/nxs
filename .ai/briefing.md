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

## Last Completed Tasks

1. **2026-09-17 — Fix Archiving Therapist "Needs Reassignment" on Historical Bookings**
   (`ohm#arcreassgn`). Implementation plan presented and approved before code execution.
   - Fixed `archiveTherapist` server action in `app/(staff)/therapists/actions.ts` by adding strict date guard `.gte("booking_date", spaDayNow())` so historical past bookings remain untouched.
   - Updated `toggleDayOff` server action to use `spaDayNow()` for consistent spa-day boundary calculation.
   - Fixed Dashboard query in `app/(staff)/dashboard/page.tsx` with `.gte("booking_date", spaDayNow())` so only current and future spa-day bookings surface on "NEEDS REASSIGNMENT".
   - Guarded local state update in `components/therapist-browser.tsx` (`handleConfirmArchive`) with `b.date >= currentSpaDate`.
   - Created DB cleanup migration `supabase/migrations/20260917110000_cleanup_stale_needs_reassignment.sql` executing `auto_cancel_lapsed_bookings()`. `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

2. **2026-09-17 — Fix Check-in Time & Locker missing data + Add leftmost Edit Booking action & modal**
   (`ohm#bkgchkedt`). Implementation plan presented and approved before code execution.
   - Fixed blank Check-in Time and Locker # rendering on CHECK-IN and CHECK-OUT tabs by querying `locker_occupancy` with fallback resolution for unlinked `booking_id` records in `components/booking-browser.tsx`.
   - Added leftmost "Edit" button column in the Bookings table and introduced `EditBookingModal` allowing receptionists to update Service, Therapist, Massage Time / Schedule, and Locker #.
   - Added `editBooking` server action in `app/(staff)/bookings/actions.ts` with therapist double-booking GiST validation, therapist availability checks, locker occupancy conflict checks, and `action_logs` audit entry creation.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

3. **2026-09-17 — Auto-cancel lapsed unvisited bookings past 2:00 AM cutoff**
   (`ohm#c4nc3lbk`). Implementation plan presented and approved before code execution.
   Added DB function `public.auto_cancel_lapsed_bookings()` (`20260917100000_auto_cancel_lapsed_bookings.sql`) that auto-cancels unvisited bookings (`Booked` / `Needs Reassignment`) for elapsed spa dates past 2:00 AM Asia/Manila cutoff, recording audit entries in `action_logs`.
   Created Vercel Cron route `/api/cron/auto-cancel-bookings` (`app/api/cron/auto-cancel-bookings/route.ts`) registered in `vercel.json` (`0 18 * * *`). Added log detail formatter in `lib/logs/format-detail.ts`. `npm run build` clean. See [[bookings_state]], [[logs_state]], and `.ai/handoff.md`.

4. **2026-09-16 — Log Visit: Link walk-in to client account (manual search + QR scan) & hide misleading points for unlinked guests**
   (`ohm#3k7yqxpz`). Implementation plan & regression risk assessment presented and approved before code execution.
   Confined strictly to `components/log-visit-modal.tsx`, reusing `ScanMemberQrModal` and `resolveMemberQr` action as-is.
   - Fix A: Added Points input renders disabled `"N/A — no account linked"` text when `!clientId`.
   - Fix B & C: Collapsible "Link to Client Account" search box (case-insensitive substring match on `clients` prop) and "Scan QR" button (opens `<ScanMemberQrModal>` as `z-[60]` overlay) when `!clientId`.
   - Unlink: Added "Unlink account (back to walk-in)" text button when `isGuestOrigin && clientId !== null`.
   - `npx tsc --noEmit` and `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-16 — Fix Walk-in Client Mis-link Bug & Reorder Log Visit Modal Fields**
   (`ohm#7f3k2m9p`). Implementation plan & regression risk assessment presented and
   approved before code execution. Fixed client state initialization in `LogVisitModal`
   (`components/log-visit-modal.tsx`) where walk-in guest bookings (`client_id: null`)
   erroneously fell back to `clients[0]?.id`. Reordered modal fields to: Availed
   Service → Upgrade Box → Manual Discount → Promo Code → Add-ons → Points/Amount Paid →
   Payment Method (standalone full-width) → GCash Ref → Staff. `npx tsc --noEmit` clean.
   See [[bookings_state]] and `.ai/handoff.md`.


