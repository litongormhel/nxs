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

1. **2026-09-17 — Default Call Sheet to 'All' Tab, Add Time-based Status Badges, and Fix Missing Client Codename**
   (`ohm#cllshtstat`). Implementation plan presented and approved before code execution.
   - Updated `app/(staff)/call-sheet/page.tsx` query and mapping to use `extractCodename()` helper, robustly extracting `client_codename` across direct `locker_occupancy.client_id` and linked `bookings.client_id`, with fallback to `guest_label`. Passed `duration_minutes` to browser.
   - Updated `components/call-sheet-browser.tsx` default active tab state to `"all"`.
   - Added `getSlotStatus(slotTime, durationMinutes, checkedInAt)` to compute Asia/Manila status (In Progress, Done, Upcoming).
   - Rendered `TIME` and `STATUS` columns exclusively on the `"All"` tab view. Specific time slot tabs retain the standard 5-column layout. Canvas JPEG download export remains clean. `npm run build` clean. See [[operations_state]] and `.ai/handoff.md`.

2. **2026-09-17 — Add Client Codename Column to Call Sheet Table**
   (`ohm#cllshtclnt`). Implementation plan presented and approved before code execution.
   - Updated `app/(staff)/call-sheet/page.tsx` query to include `bookings(start_time, therapists(name), clients(codename))` in addition to `clients(codename)`, resolving `client_codename` via `o.clients?.codename ?? o.bookings?.clients?.codename ?? null`.
   - Updated `components/call-sheet-browser.tsx` subtitle to `CALL SHEET — LOCKER / ROOM / SERVICE / THERA / CLIENT`.
   - Added `CLIENT` header column (`<div>CLIENT</div>`) to the right of `THERA`, rendered `client_codename` styled with `font-semibold text-foreground` or fallback `—`.
   - Updated Canvas JPEG drawer `drawCallSheetJpeg` to render the `CLIENT` header and column values in downloaded images. `npm run build` clean. See [[operations_state]] and `.ai/handoff.md`.

3. **2026-09-17 — Fix Daily Sales Remittance Window to Include Daytime Check-Ins (8:00 AM – 2:00 AM)**
   (`ohm#slswndw8am`). Implementation plan presented and approved before code execution.
   - Updated `getSpaDayBounds(spaDateStr)` in `lib/analytics/spa-day.ts` start bound from `08:00:00Z` (16:00:00+08 / 4:00 PM PHT) to `00:00:00Z` (08:00:00+08 / 8:00 AM PHT), matching the 8:00 AM Spa Day turnover rule (`ohm#spaday8am`).
   - Updated badge in `components/sales-browser.tsx` to `Spa Operational Window (8:00 AM – 2:00 AM)`.
   - Ensures daytime check-in and walk-in sales logged from 8:00 AM onwards up to the 2:00 AM closing cutoff are included in the remittance tally. `npm run build` clean. See [[sales_state]] and `.ai/handoff.md`.

4. **2026-09-17 — Display Therapist Availability Suffixes & Grayed-Out Disabled States in Quick Walk-In Modal Dropdown**
   (`ohm#j4m8v2xq`). Implementation plan presented and approved before code execution.
   - Updated `components/quick-walkin-modal.tsx` to fetch `therapist_day_off`, `therapist_absence`, and `therapist_leave` for the modal date (`todayIso()`).
   - Formatted dropdown options with status labels (`Akio - Day Off`, `Josh - On Leave`, `Name - Absent`, `Name - Fully Booked`), set `disabled={disabled}`, and applied `text-stone-500` disabled styling.
   - Extended `canSubmit` to check `!unavailableTherapists.has(therapistId)`.
   - Verified server-side validation in `app/(staff)/bookings/actions.ts` (`quickWalkin` action) handling Postgres trigger `trg_bookings_check_therapist_availability` exception `THERAPIST_UNAVAILABLE` and returning a friendly error. `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-17 — Conditionally Display Leftmost Edit Column Strictly on CHECK-IN Tab**
   (`ohm#bkgupcedt`).
   - Updated `components/booking-browser.tsx` to conditionally render the leftmost "Edit" header (`<th>`) and body cell (`<td>`) only when `tab === "checkin"`.
   - On UPCOMING and CHECK-OUT tabs, the redundant leftmost Edit column is removed.
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.



