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

1. **2026-09-17 — Update Spa Day Cutoff to 8:00 AM Current Date Switch**
   (`ohm#spaday8am`).
   - Updated `lib/analytics/spa-day.ts` (`toManilaDateParts`): shifted cutoff boundary from 4:00 PM to 8:00 AM PHT.
   - From 08:00 AM PHT onwards (`hour >= 8`), `spaDayNow()` evaluates to the current calendar date so reception can prepare for the upcoming shift. Subtracting 1 day (-1 day) applies strictly between 00:00 AM and 07:59 AM PHT (`hour < 8`).
   - Verified all 5 test cases (01:30 AM Sept 18 -> "2026-09-17", 07:59 AM Sept 18 -> "2026-09-17", 08:00 AM Sept 17 -> "2026-09-17", 10:45 AM Sept 17 -> "2026-09-17", 04:00 PM Sept 17 -> "2026-09-17"). `npm run build` clean. See [[operations_state]], [[analytics_state]], and `.ai/handoff.md`.

2. **2026-09-17 — Fix Desync Between Bookings Check-In Tab & Locker Board (Missing Nanon Occupancy + Stale Locker Rows)**
   (`ohm#lckstalesync`). Implementation plan presented and approved before code execution.
   - Reordered `logVisitBooking` in `app/(staff)/bookings/actions.ts` to assign locker occupancy before updating booking status, ensuring atomicity.
   - Added DB migration `20260917120000_auto_checkout_stale_lockers.sql` creating `public.auto_checkout_stale_lockers()` stored procedure to auto check-out unclosed lockers past 2:00 AM cutoff, auto-releasing JM (#9) and ohm (#18) and repairing Nanon (#8).
   - Updated `app/(staff)/lockers/page.tsx` to invoke `auto_checkout_stale_lockers()` on load.
   - Added log detail formatter for `auto_checkout_stale_locker` in `lib/logs/format-detail.ts`. `npm run build` clean. See [[lockers_state]], [[bookings_state]], and `.ai/handoff.md`.

3. **2026-09-17 — Daily Sales Remittance Page Redesign using SpaDay Window (4:00 PM – 2:00 AM)**
   (`ohm#slsremit`). Implementation plan presented and approved before code execution.
   - Added `getSpaDayBounds(spaDateStr)` and `shiftSpaDay(spaDateStr, days)` helpers in `lib/analytics/spa-day.ts` to compute 4:00 PM PHT to 2:00 AM PHT (+1d) UTC bounds (`08:00:00Z` to `18:00:00Z`).
   - Redesigned `app/(staff)/sales/page.tsx` to read `searchParams` for date (defaulting to `spaDayNow()`) and query `sales` bounded by the selected Spa Day.
   - Redesigned `components/sales-browser.tsx` with Spa Day date selector (Prev/Today/Next & operational window badge), Shift Remittance Summary Bar (Cash Remit, Online/E-Wallet, Total Shift Sales), PHT transaction time formatting (`fmtPhtTime`), and table presentation enhancements using design tokens (Fraunces headings, IBM Plex Mono amounts/times). `npm run build` clean. See [[sales_state]] and `.ai/handoff.md`.

4. **2026-09-17 — Fix EditBookingModal Self-Locker False Conflict & Therapist Availability Dropdown**
   (`ohm#edtmodbfix`). Implementation plan presented and approved before code execution.
   - Fixed self-locker conflict detection in `EditBookingModal` (`components/booking-browser.tsx`) by excluding the current session's locker occupancy in client state and allowing `<option disabled={occupied && !isCurrent}>`.
   - Refined `editBooking` action (`app/(staff)/bookings/actions.ts`) to resolve active `locker_occupancy`, skip conflict check when locker is unchanged, and exclude self-session records.
   - Added therapist status suffixing (`Akio - Day Off`, `Josh - On Leave`, `Name - Absent`) for `booking.booking_date` and disabled unavailable options unless assigned to that booking. `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-17 — Fix Archiving Therapist "Needs Reassignment" on Historical Bookings**
   (`ohm#arcreassgn`). Implementation plan presented and approved before code execution.
   - Fixed `archiveTherapist` server action in `app/(staff)/therapists/actions.ts` by adding strict date guard `.gte("booking_date", spaDayNow())` so historical past bookings remain untouched.
   - Updated `toggleDayOff` server action to use `spaDayNow()` for consistent spa-day boundary calculation.
   - Fixed Dashboard query in `app/(staff)/dashboard/page.tsx` with `.gte("booking_date", spaDayNow())` so only current and future spa-day bookings surface on "NEEDS REASSIGNMENT".
   - Guarded local state update in `components/therapist-browser.tsx` (`handleConfirmArchive`) with `b.date >= currentSpaDate`.
   - Created DB cleanup migration `supabase/migrations/20260917110000_cleanup_stale_needs_reassignment.sql` executing `auto_cancel_lapsed_bookings()`. `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.



