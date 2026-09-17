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

1. **2026-09-17 — Add Massage Time & Enforce 12-Hour Format in Walk-In Visit History Drawer**
   (`ohm#walkindrawertimeformat`). Implementation plan presented and approved before code execution.
   - **12-Hour Time Format Helper (`components/client-browser.tsx`)**: Created `formatTime` helper using `toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })` to format `"HH:mm"` / `"HH:mm:ss"` times into standard 12-hour AM/PM format (e.g. `11:30 PM`). Updated visit card header to display date and formatted time (e.g., `Sep 17, 2026 · 11:30 PM`).
   - **Massage Time Details Block (`components/client-browser.tsx`)**: Added a dedicated `MASSAGE TIME` block inside each visit item card details grid displaying formatted 12-hour massage start time or `None (Wet Area)`.
   - `npm run build` clean. See [[clients_state]] and `.ai/handoff.md`.

2. **2026-09-17 — Add Pagination and Page Size Selector to Logs, Top Clients, and Top Thera Tables**
   (`ohm#walkinpagination`). Implementation plan presented and approved before code execution.
   - **Activity Logs Pagination (`components/logs-browser.tsx`)**: Added `pageSize` (default 10) and `currentPage` (default 1) state with auto-reset on action/date/staff filter or page size changes. Rendered paginated slice (`paginatedLogs`) and added dark token pagination bar.
   - **Analytics Top Clients & Top Thera Pagination (`components/analytics-browser.tsx`)**: Added independent `pageSize` (default 10) and `currentPage` (default 1) states for Top Clients and Top Thera sections. Preserved rank indexing across pages (`startIndex + i + 1`) and appended responsive dark token pagination bars below both cards.
   - `npm run build` clean. See [[logs_state]], [[analytics_state]], and `.ai/handoff.md`.

3. **2026-09-17 — Add Pagination and Page Size Selector to Walk-In Without Account Table**
   (`ohm#walkinpagination`). Implementation plan presented and approved before code execution.
   - **Pagination State & Slicing (`components/client-browser.tsx`)**: Added `pageSize` (default 10) and `currentPage` (default 1) state with auto-reset to page 1 on search or page size changes. Computed paginated slice of filtered walk-ins (`paginatedWalkIns`).
   - **Responsive Pagination Controls Bar (`components/client-browser.tsx`)**: Placed below the walk-in table. Includes status indicator (`Showing X–Y of Z guests`), dark token rows per page dropdown (`bg-[#141210] border-[#292524] text-[#f5f5f4]` with options 10, 20, 50, 100), page indicator (`Page X of Y`), and page navigation buttons (`Previous` & `Next`).
   - `npm run build` clean. See [[clients_state]] and `.ai/handoff.md`.

4. **2026-09-17 — Restrict Members Tab strictly to Clients with Portal Accounts & Purge Non-Portal Client Rows**
   (`ohm#clienttabsandpurge`). Implementation plan presented and approved before code execution.
   - **Strict Portal Account Filtering (`app/(staff)/clients/page.tsx`)**: Filtered `registeredMembers` in `ClientsPage` to strictly require `portalAccountClientIds.has(c.id)` (`has_portal_account === true`). Prevents mock/legacy clients without portal credentials from polluting the **Members** tab.
   - **Data Cleanup Migration (`supabase/migrations/20260917160000_purge_clients_without_portal_account.sql`)**: Created safe SQL cleanup script that purges clients without a `client_portal_accounts` row from `clients` table. Safely converts their historical `bookings`, `sales`, and `locker_occupancy` into non-account walk-in records (`guest_label = c.codename`, `client_id = NULL`), preserving revenue and operational reporting history.
   - `npm run build` clean. See [[clients_state]] and `.ai/handoff.md`.

5. **2026-09-17 — Separate "Members" and "Walk-In Without Account" tabs in Client Profile + Purge legacy clients without bookings today**
   (`ohm#clienttabsandpurge`). Implementation plan presented and approved before code execution.
   - **Database Migration (`supabase/migrations/20260917150000_purge_legacy_clients.sql`)**: Safe SQL cleanup script preserving active clients with bookings or locker occupancy on today's operating date (`2026-09-17` Manila time). Disassociates `client_id` (`NULL`) while copying client `codename` to `guest_label` across historical `bookings`, `sales`, and `locker_occupancy` rows for purged clients, preserving revenue and operational reporting integrity.
   - **Backend Data Sourcing (`app/(staff)/clients/page.tsx`)**: Queries registered members for the **Members** tab and non-member walk-in guest visits from `bookings` (`client_id IS NULL` & `guest_label IS NOT NULL`) joining `services`, `therapists`, `sales`, and `locker_occupancy` for the **Walk-In Without Account** tab.
   - **Top-Level Two Tabs Layout & Walk-In View (`components/client-browser.tsx`)**: Added top-level tab switcher (**Members** vs **Walk-In Without Account**). Search bar filters registered members by `@username`, codename, or member code on **Members**, and filters walk-ins by guest codename or date on **Walk-Ins**. Added structured table for non-account walk-in guests (`Codename`, `Last Visit Date`, `Total Visits`, `Latest Service`, `Latest Therapist`, `Locker`, `Amount Paid`) with a slide-over drawer to inspect full past visit history for any walk-in guest codename.
   - `npm run build` clean. See [[clients_state]] and `.ai/handoff.md`.
