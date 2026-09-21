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

1. **2026-09-21 — Restrict Sales Action Buttons After 3 Days to Owner Role Only**
   (`ohm#4a9e1d2c`). Implementation plan presented and approved before code execution.
   - **`isSaleLapsed` helper (`components/sales-browser.tsx`)**: Pure function returning `true` when `Date.now() - new Date(createdAt).getTime() > 3 * 24 * 60 * 60 * 1000`.
   - **Edit button**: `disabled={!editAllowed || editLocked}` where `editLocked = isSaleLapsed(s.created_at) && currentRole !== "Owner"`. Title switches between lapse message and role message. `onClick` double-guards both conditions.
   - **Void button**: gains `disabled={voidLocked}` and `title="Void locked after 3 days. Owner only"` (previously had no `disabled` state at all). `onClick` guards `!voidLocked`.
   - **`guardLapsedSale` helper (`app/(staff)/sales/actions.ts`)**: Fetches `created_at` via `adminClient`, checks 72-hour age. If lapsed, resolves caller via `auth.getUser()` → `staff.position`; rejects non-Owners with `"Sales older than 3 days can only be modified or voided by the Owner."`.
   - **`editSale`**: calls `guardLapsedSale` before DB update. **`voidSale`**: calls `guardLapsedSale` after PIN validation (Step 2b), before DB update. `restoreSale` untouched. No DB migrations.
   - `npm run build` clean (0 errors). See [[sales_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Display "Redeem" for Points Redemption Transactions in Sales Table**
   (`ohm#7d2a1c4e`). Implementation plan presented and approved before code execution.
   - **Promo Column (`components/sales-browser.tsx`)**: When `payment_method === 'Points'`, renders a gold `Redeem` badge (`bg-gold/15 text-accent-gold`, uppercase, matching the Voided badge style) instead of `—`. All non-Points rows continue to display `promo_label ?? "—"` — unaffected.
   - **Payment Column (`components/sales-browser.tsx`)**: When `payment_method === 'Points'`, renders `Points` in `text-accent-gold font-medium` so it is visually distinct from `Cash` / `GCash` / `Card`. All other payment methods render as plain muted text — unaffected.
   - **Signal used**: `payment_method = 'Points'` (DB-enforced check constraint on `sales`). No `points_redeemed` column exists in the schema.
   - **`app/(staff)/sales/page.tsx`**: No changes — `payment_method` was already fetched and mapped.
   - `npm run build` clean (0 errors). See [[sales_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Sort Call Sheet by Operating Shift Time (4:00 PM First, 1:00 AM Last)**
   (`ohm#3f8a2c1d`). Implementation plan presented and approved before code execution.
   - **Shift-Aware Sort (`components/call-sheet-browser.tsx`)**: Added `getOperatingMinutes(slotTime: string | null): number` helper that converts a `HH:MM` slot time to absolute minutes on the operating day. Post-midnight times (`h < 6`, e.g. `01:00`) are offset by `+24 h` so they rank after all PM slots. `null` slot_time returns `9999` (sinks to bottom). Updated the `useMemo` for `filtered` to spread-copy and `.sort()` with primary key = `getOperatingMinutes(slot_time)` ascending, secondary key = `locker_number` ascending. Filter pill buttons and the `availableSlots` array are completely untouched.
   - `npm run build` clean (0 errors). See [[operations_state]] and `.ai/handoff.md`.

4. **2026-09-21 — Fix Date Navigator Chevron Jumping and Align Status Tabs Beside Date Picker**
   (`ohm#9a4c2e1f`). Implementation plan presented and approved before code execution.
   - **Date Chevron Fix (`components/booking-browser.tsx`)**: Root cause was `.toISOString().slice(0, 10)` output on the chevron handlers converting local midnight back to UTC, causing a 1-day rollback in UTC+8. Fixed with strict local date arithmetic using `split('-').map(Number)`, `new Date(y, m - 1, d)`, `setDate(±1)`, and local `getFullYear()`/`getMonth()`/`getDate()` getters for the output string. Left chevron now decrements exactly 1 day; right chevron increments exactly 1 day — no UTC drift.
   - **Single-Row Header Layout (`components/booking-browser.tsx`)**: Removed standalone tab row below the date navigator. Merged date stepper, status tabs (`UPCOMING/CHECK-IN/CHECK-OUT`), and action buttons into one `flex flex-wrap items-center` row. Vertical divider (`h-6 w-px bg-border`) separates the stepper from the tabs; `sm:ml-auto` pushes action buttons to the far right. Active tab indicator, counts, and filtering behavior are fully preserved.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-21 — Prevent Owner and Current Staff from Archiving Themselves**
   (`ohm#8e1a4f2c`). Implementation plan presented and approved before code execution.
   - **Server Action Safeguards (`app/(staff)/staff/actions.ts`)**: In `archiveStaff`, resolved caller's authenticated staff identity (`callerStaff`) from `supabase.auth.getUser()`. Added Guard 1 rejecting self-archival (`target.id === callerStaff.id || target.user_id === user.id`) with `"You cannot archive your own account."`. Added Guard 2 rejecting last-owner archival (`target.position === 'Owner'` with 0 other active owners) with `"Cannot archive the only active Owner."`.
   - **Staff Directory UI (`components/staff-browser.tsx`)**: Resolved current staff identity from `useStaffSim()`. On the current staff member's own card, rendered the "Archive" dropdown option disabled with `title="You cannot archive your own account"` and muted styling, while keeping "Reset password" and "Edit details" fully functional and interactive. Added client-side defense-in-depth checks in `openArchiveModal` and `confirmArchive`.
   - `npm run build` clean (0 errors). See [[staff_state]] and `.ai/handoff.md`.

