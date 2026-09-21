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

1. **2026-09-21 — Redesign Member Profile Drawer with Streamlined Header and 2-Column Stats**
   (`ohm#5c8e1a4f`). Implementation plan presented and approved before code execution.
   - **Streamlined Header (`components/client-browser.tsx`)**: Replaced standalone "MOBILE NUMBER" and "MEMBER SINCE" full-width cards with a consolidated 3-tier header: (1) Member codename with close `[✕]` button, (2) Combined username and mobile number (`@{username} • {phone}`), and (3) `Member since {date}` directly beneath in muted text.
   - **2-Column Stats Grid (`components/client-browser.tsx`)**: Unified key member metrics into a side-by-side 2-column card layout: Left Card "AVAILABLE POINTS" with bold gold accent value (`{points} pts`), Right Card "CURRENT STATUS" with active locker check-in badge (`Locker {locker}` in gold or muted `Not Checked In`).
   - **Compact QR Code Container & Actions (`components/client-browser.tsx`)**: Reduced QR code footprint (`130px`) with centered padding and truncated token string with click-to-copy button and `✓ Copied` feedback. Structured action buttons cleanly (+ Log Visit for Member, Claim Past Walk-in Visit honoring disabled toggle and tooltip, and Close).
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

2. **2026-09-21 — Fix Persistence and State Binding for Walk-in Claims Settings Toggle**
   (`ohm#4b8e2a1d`). Implementation plan presented and approved before code execution.
   - **Settings Server Action (`app/(staff)/settings/actions.ts`)**: In `updateWalkinClaimsSetting`, resolved active singleton row using `.limit(1).maybeSingle()` instead of rigid `id = true` assumption. Added fallback to `createServiceClient()` when authenticated client encounters RLS or when 0 rows are updated. Updated return signature to `{ success: true, ok: true, enabled }` and error objects.
   - **Settings Page Query (`app/(staff)/settings/page.tsx`)**: Replaced `.eq("id", true).single()` with `.limit(1).maybeSingle()`. Added fallback to `createServiceClient()` if authenticated client fails or returns null. Preserved actual `allow_walkin_claims` setting from database during schema cache fallback rather than unconditionally defaulting to `true`.
   - **Settings UI State Binding (`components/settings-browser.tsx`)**: Updated `handleToggleWalkinClaims` to evaluate both `res.success` and `res.ok`, and set local state to `res.enabled`. Added `useEffect` hook listening to `initialAllowWalkinClaims` to keep client state synchronized upon server revalidation and page reload.
   - `npm run build` clean (0 errors). See [[settings_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Add Owner-Only Feature Toggle to Enable/Disable Past Walk-in Visit Claims**
   (`ohm#3d8a1c9e`). Implementation plan presented and approved before code execution.
   - **Database & Schema (`supabase/migrations/20260921170000_add_walkin_claim_toggle.sql`)**: Added `allow_walkin_claims boolean not null default true` column to `public.app_settings`. Dispatched `NOTIFY pgrst, 'reload schema'` to refresh PostgREST schema cache.
   - **Settings Server Action & Page (`app/(staff)/settings/actions.ts`, `app/(staff)/settings/page.tsx`)**: Added `updateWalkinClaimsSetting` action strictly gated by `requireOwner(supabase)` with service client fallback, `action_logs` auditing, and path revalidation (`/settings`, `/clients`). Updated `app_settings` query in settings page to select `allow_walkin_claims` with resilient fallback.
   - **Settings UI (`components/settings-browser.tsx`)**: In Promos & Security tab, added "Allow Walk-in Visit Claims" toggle card gated strictly to `isOwner`. Displays informative disabled state for non-owner staff roles.
   - **Client Drawer & Action Enforcement (`app/(staff)/clients/actions.ts`, `app/(staff)/clients/page.tsx`, `components/client-browser.tsx`)**: In `requestWalkinClaim`, checks `allow_walkin_claims` and rejects new claim creation with `"Past walk-in claims are currently disabled."` when false. In `ClientBrowser`, disables "Claim Past Walk-in Visit" in Member Profile Drawer with clear tooltip `"Walk-in claiming is currently disabled by Owner"` when disabled. Pending claims approval actions remain untouched and fully actionable.
   - `npm run build` clean (0 errors). See [[settings_state]], [[clients_state]], and `.ai/handoff.md`.

4. **2026-09-21 — Refine Layout of Pending Claims Table Columns**
   (`ohm#6d1f3e8a`). Implementation plan presented and approved before code execution.
   - **Target Member Column (`components/client-browser.tsx`)**: Removed `#M-...` member code badge from the table cell, retaining clean display of member codename and handle (`@{username}`).
   - **Original Walk-In Details Column (`components/client-browser.tsx`)**: Reordered cell hierarchy: (1) Line 1: Accent badge `Codename: {codename}`, (2) Line 2: Date and 12-hour formatted Time, (3) Line 3: `Service • Therapist: {therapist} • Locker {locker} • ₱{amount}`, removing the payment method tag.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.

5. **2026-09-21 — Display Used Walk-in Codename in Pending Claims Details and Search**
   (`ohm#2f7a9d4c`). Implementation plan presented and approved before code execution.
   - **Data Query & Typings (`app/(staff)/clients/page.tsx`, `components/client-browser.tsx`)**: Extended `visit_claims` query to join `bookings` (`guest_label`, `locker_occupancy`, `services`, `therapists`, `sales`). Resolved `guest_label` with cascading fallbacks to `rawWalkIns`, `sales`, and `allHistoricalOccupancy`. Extended `PendingClaim` and `PendingClaimRow` types with `walkin_codename: string | null` and `guest_label?: string | null`. Mapped `walkin_codename` and `locker_number` onto all pending claims.
   - **Pending Claims UI & Search (`components/client-browser.tsx`)**: In the Pending Claims tab table, redesigned the "ORIGINAL WALK-IN DETAILS" column into a clean 3-tier layout: (1) Top: Date & 12-hour Time, (2) Middle: highlighted gold badge `Codename: {claim.walkin_codename ?? "Walk-in Guest"}`, and (3) Bottom: Service • Therapist • Locker # (if available) • Amount (Payment Method). Included `walkin_codename` in `filteredPendingClaims` client-side search predicate and updated the search placeholder.
   - `npm run build` clean (0 errors). See [[clients_state]] and `.ai/handoff.md`.



