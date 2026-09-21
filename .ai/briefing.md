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

1. **2026-09-21 — Audit and Fix Service Name vs ID Mismatch in Therapist Booking Flow**
   (`ohm#1b4e9f7a`). Implementation plan presented and approved before code execution.
   - **Database & Catalog Resolution (`public.services`, `public.therapist_services`)**: Audited catalog records and identified discrepancy: inactive `Scrub` (`326e0b78-49cb-441c-aa03-e54453f2f67f`, `active: false`) vs active `Scrub + Massage` (`8c97c5db-eaa9-47b9-89c0-9db114000483`, `active: true`). Migrated 7 therapist capability records in `therapist_services` from the legacy inactive ID to the active `Scrub + Massage` ID.
   - **Roster Card & Browser Alignment (`components/therapist-browser.tsx`)**: Retained concise `"Scrub"` pill label on cards for layout parity. Mapped `"Scrub"` in `serviceIdMap` to `serviceIds["Scrub + Massage"] ?? serviceIds["Scrub"]`. Added `normalizeServiceNames` helper to translate incoming server-side `"Scrub + Massage"` strings into `"Scrub"` on card capabilities and sync effects, ensuring toggling and card display align with live database IDs.
   - **Quick Walk-in Modal Resilience (`components/quick-walkin-modal.tsx`)**: Added defense-in-depth normalization in `therapist_services` query handling, mapping legacy inactive `Scrub` ID to active `Scrub + Massage` ID. Verified bidirectional filtering: selecting a therapist offering scrub immediately includes `Scrub + Massage · 90min` in available services; selecting `Scrub + Massage` filters dropdown to qualified therapists.
   - `npm run build` clean (0 errors). See [[therapists_state]], [[bookings_state]], and `.ai/handoff.md`.

2. **2026-09-21 — Add Confirmation Modal for Weekly Days Off and Services Offered Changes**
   (`ohm#9d3b7e1a`). Implementation plan presented and approved before code execution.
   - **Badge Click Interception (`components/therapist-browser.tsx`, `components/therapist-card.tsx`)**: Intercepted day-off and service-offered badge clicks on therapist cards to prevent accidental immediate database mutations. Added `BadgeConfirmState` tracking action details (therapist name, target day or service, and action type: add vs remove).
   - **Confirmation Modal UX & Theme Parity**: Built confirmation modal using semantic theme tokens (`bg-surface`, `bg-surface-2`, `border-border`, `text-foreground`, `text-muted`, `bg-gold`). Clearly displays therapist name, targeted change (`"Add Wednesday as weekly day off"` / `"Remove Wednesday from weekly days off"`, `"Add Scrub to services offered"` / `"Remove Scrub from services offered"`), and warns when adding a day off that upcoming bookings will be flagged as `Needs Reassignment`.
   - **Guarded Mutation Execution**: Network mutations (`toggleDayOff`, `toggleTherapistService`) are executed strictly upon clicking "Confirm" with double-submission prevention (`isSubmittingBadge`). Clicking "Cancel" or backdrop dismisses the dialog leaving state and database untouched.
   - `npm run build` clean (0 errors). See [[therapists_state]] and `.ai/handoff.md`.

3. **2026-09-21 — Filter Service Dropdown in Quick Walk-in and Booking Modals by Therapist Services Offered**
   (`ohm#5c1a8d2e`). Implementation plan presented and approved before code execution.
   - **Bidirectional Service Filtering (`components/quick-walkin-modal.tsx`, `components/booking-form-modal.tsx`)**: Stored `therapistServicesMap` (`therapist_id -> Set<service_id>`) from `therapist_services`. Derived `availableServices`: if `therapistId` is selected, strictly filters `services` to those offered by that therapist; otherwise renders all active services. Added bidirectional synchronization effect: if the selected therapist does not offer the currently active `serviceId`, automatically resets/defaults `serviceId` to the therapist's first qualified service. Updated therapist dropdown `onChange` in both modals to immediately adjust `serviceId` to the newly selected therapist's qualified services.
   - **Card-to-Modal Integration Parity**: Verified pre-filled modal launch from therapist cards (e.g. Leo) strictly limits Service dropdown to offered services (`Combi Massage`, `Signature Massage`), excluding unoffered services (`Scrub`, `Wet Area`).
   - **Pricing & Room Recalculations**: Ensured `amount`, duration, room availability calculations, and split payment auto-balancing recalculate seamlessly on dynamic service adjustments.
   - `npm run build` clean (0 errors). See [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-19 — Fix Locker Out of Order Persistence and Board State Refresh**
   (`ohm#6e3a9c2d`). Implementation plan presented and approved before code execution.
   - **Mutation Verification (`app/(staff)/lockers/actions.ts`)**: Added `.select()` chained to `.update()` in `toggleLockerMaintenance` to verify rows were committed in Postgres and catch silent RLS denials (returning an explicit error if 0 rows are updated). Revalidated `/dashboard` alongside `/lockers`, `/bookings`, `/call-sheet`, and `/clients`.
   - **Resilient Cascading Query (`app/(staff)/lockers/page.tsx`)**: Replaced the abrupt `.select("number")` fallback with a cascading query in `fetchLockers` (`number, status, is_maintenance, maintenance_note` -> `number, status, maintenance_note` -> `number, status` -> `number`). Prevents missing `is_maintenance` schema cache columns (`PGRST204`) from dropping the `status` column. Correctly normalizes `isMaintenance` and passes populated items to `<LockerBoard>`.
   - **Board State Refresh & Sync (`components/locker-board.tsx`)**: Synced `occ` on `occupancy` prop changes. Preserved optimistic maintenance status so cards immediately render out of order without reverting to Free on refresh.
   - `npm run build` clean (0 errors). See [[lockers_state]] and `.ai/handoff.md`.

5. **2026-09-19 — Fix Therapist Cards Theme Styling to Support Light Mode**
   (`ohm#8e2c4b1d`). Implementation plan presented and approved before code execution.
   - **TherapistCard Semantic Tokens (`components/therapist-card.tsx`)**: Replaced all hardcoded dark-theme hex colors (`bg-[#14100c]`, `border-white/10`, `text-[#f2ede4]`, `text-[#8a8378]`, `bg-[#993556]`, `bg-[#3b6d11]`, `bg-white/5`, etc.) with semantic Tailwind CSS theme tokens (`bg-surface`, `border-border`, `text-foreground`, `text-muted`, `bg-accent-red`, `bg-accent-green`, `bg-surface-2`, etc.). Covers card container, avatar, name, status dot, kebab menu, dropdown, progress bar, section headers, all 5 slot button states (unavailable/selected/past/booked/free), day-off toggles, service toggles, and CTA buttons.
   - **TherapistBrowser Cleanup (`components/therapist-browser.tsx`)**: Replaced remaining hardcoded hex values (`border-[#a97e2e]`, `hover:bg-[#c89b3c]/10`, `from-gold to-[#a97e2e]`, `border-[#6b4f1f]`) with semantic tokens (`border-gold`, `hover:bg-gold/10`, `from-gold to-gold-hover`, `border-gold/50`).
   - **Light Mode Gold Tokens (`app/globals.css`)**: Added `--gold: #a07820` and `--gold-hover: #b8891a` to `body.light` block so gold accent adapts properly in light mode.
   - `npm run build` clean (0 errors). See [[therapists_state]] and `.ai/handoff.md`.

