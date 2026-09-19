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

1. **2026-09-19 — Implement Past Time Grace Period and Booked Slots Gating in Booking Modals**
   (`ohm#7f3b1e9a`). Implementation plan presented and approved before code execution.
   - **Time Slot Utilities (`lib/bookings/slots.ts`)**: Added `getSlotStartMs` and `isSlotPastGracePeriod` helpers. Supports full midnight-crossing operational window awareness (mapping post-midnight slots 00:00, 00:30, 01:00 to the morning after the spa day anchor). Evaluates 20-minute grace period on the active spa day window (`spaDayNow()`), while leaving future dates completely open.
   - **Past Time & Booked Slots Gating (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**: Incorporated 30s interval ticker `currentTime` for live grace period evaluation. Differentiated slot states: past slots render in faded dark gray (`border-border/40 bg-background/50 text-foreground/30 opacity-25 cursor-not-allowed`) without line-through; booked slots render struck-through with red/muted outline (`border-dashed border-red-500/30 bg-red-950/10 text-red-400/60 line-through opacity-60 cursor-not-allowed`) and marked with a `Booked` sub-label. Added submission guards against past and booked slots. Quick Walk-in date initialized via `spaDayNow()`.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

2. **2026-09-19 — Fix Therapist Services Offered Persistence and Filter Therapist by Service in Bookings**
   (`ohm#4a8d2f1b`). Implementation plan presented and approved before code execution.
   - **Services Offered Persistence (`components/therapist-browser.tsx`, `app/(staff)/therapists/actions.ts`)**: Fixed state initialization in `therapistMeta` to use `initialServices[r.id] ?? []` when real DB therapist records are loaded, preventing unselected services from resetting to defaults on page refresh. Added `router.refresh()` and relaxed staff session gating in `handleToggleService`. Added `initialServices` prop sync in `useEffect`. Updated `toggleTherapistService` to use service role client mutation fallback, upsert on conflict, and revalidate both `/therapists` and `/bookings`.
   - **Service-Based Therapist Filtering in Booking Modals (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**: Fetched `therapist_services` alongside availability data. Derived `qualifiedTherapists` matching selected service; therapist dropdown renders only qualified therapists. Automatically resets therapist selection (and disables time slot selection) if the selected therapist does not offer the newly selected service. Therapist dropdown is disabled when no service is selected (`disabled={!serviceId}`).
   - `npm run build` clean (0 errors). See [[therapists_state]], [[bookings_state]], and `.ai/handoff.md`.

3. **2026-09-19 — Set Default Manual Discount Percentage to 20%**
   (`ohm#3c8f1e2a`). Implementation plan presented and approved before code execution.
   - **Quick Walk-in Modal (`components/quick-walkin-modal.tsx`)**: Updated initial `discountValue` state from `25` to `20`. Updated `onManualDiscountToggle` and type switch dropdown `onChange` so that checking the manual discount box or switching type back to "pct" immediately resets/defaults `discountValue` to `20`. Amount calculations immediately reflect the 20% discount.
   - **Log Visit Modal (`components/log-visit-modal.tsx`)**: Confirmed initial `discountValue` is `20`. Updated `onManualDiscountToggle` and type switch dropdown `onChange` so toggling manual discount or selecting percentage resets/defaults `discountValue` to `20`. Amount calculations immediately recompute using 20%.
   - `components/booking-form-modal.tsx` confirmed untouched (no manual discount support).
   - `npm run build` clean. See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-19 — Fix Schema Cache Error for Lockers is_maintenance Column**
   (`ohm#5b7c2e9a`). Implementation plan presented and approved before code execution.
   - **Schema & Migration (`supabase/migrations/20260919100000_lockers_maintenance.sql`)**: Appended `notify pgrst, 'reload schema';` to the migration to ensure PostgREST immediately invalidates its schema cache upon migration execution.
   - **Action Resilience & Graceful Fallback (`app/(staff)/lockers/actions.ts`)**: Updated `toggleLockerMaintenance` with graceful schema cache fallback: if PostgREST returns a schema cache missing column error for `is_maintenance` (`PGRST204`), logs a diagnostic warning and cleanly falls back to updating `status` (`'out_of_order'` / `'available'`) and `maintenance_note` (or `status` only). If all attempts fail, returns a clean error directing schema cache reload rather than failing unhandled. Maintained complete audit logging in `action_logs` and path revalidations.
   - `npm run build` clean. See [[lockers_state]] and `.ai/handoff.md`.

5. **2026-09-19 — Fix Missing void_reason Column Error in Sales Void and Convert Reason to Dropdown**
   (`ohm#8d4f2b1a`). Implementation plan presented and approved before code execution.
   - **Schema & Migration (`supabase/migrations/20260919110000_add_sales_void_reason.sql`)**: Generated migration adding `void_reason text` to `public.sales` with `if not exists` guard.
   - **Action Resilience (`app/(staff)/sales/actions.ts`)**: Updated `voidSale` and `restoreSale` to attempt updating `void_reason`, with automated fallback omitting `void_reason` if the column is not yet present in the live Supabase schema cache. Guaranteed audit log insertion into `action_logs` (`sale_void` / `sale_restore`) recording acting staff and void/restore reason.
   - **Standardized Dropdown UI (`components/sales-browser.tsx`)**: Replaced free-text void reason input with a `<select>` dropdown featuring 6 standard reasons: `Double booking / Duplicate entry`, `Client cancelled / No-show`, `Incorrect service / Amount encoded`, `Incorrect payment method`, `Test transaction`, and `Other`. Conditionally renders an optional details text input when `Other` is selected. Maintained immediate sales remittance card recalculation and table line-through state updates.
   - `npm run build` clean. See [[sales_state]] and `.ai/handoff.md`.

