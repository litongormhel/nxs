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

5. **Staff Auth — intentionally deferred; RLS state as of Core Loop
   (`ohm#7f3k9d2m`, 2026-08-27):** RLS is enabled (`ENABLE ROW LEVEL
   SECURITY`) on every `public` table. Public SELECT policies exist on
   `lockers`, `rooms`, `services`, `therapists` (pre-existing), plus
   `clients`, `staff`, `point_transactions` (added by Core Loop, all
   `USING (true)`). Public INSERT-only policies exist on
   `point_transactions`, `sales`, `action_logs` (added by Core Loop,
   `WITH CHECK (true)`) — deliberately no SELECT on `sales`/`action_logs`
   (nothing reads them from the app yet) and no UPDATE/DELETE anywhere.
   Every other table — `bookings`, `promos`, `addons`, `sale_addons`,
   `locker_occupancy`, the `therapist_*` tables — still has no policies at
   all: default-deny for `anon`/`authenticated`. **This is additive, not a
   re-open**: each policy was scoped to exactly what a Core Loop read/write
   needed, decided explicitly with the user rather than assumed. One
   related fix: `clients.points_balance` sync trigger
   (`apply_points_delta()`) had to be made `SECURITY DEFINER`, since
   `clients` intentionally has no UPDATE policy for `anon` and the trigger's
   internal update was otherwise silently blocked by RLS too — see
   [[points_ledger_state]]. Action Logs use a placeholder-actor dropdown in
   the interim (staff picked from a list, not an authenticated session),
   now actually built — see [[staff_state]] and [[logs_state]].

## Routing to more detail

- Module-by-module current behavior: `.ai/current_state.md` → `docs/state/*.md`
- Active sprint / in-progress: `.ai/handoff.md`
- Architecture docs: `docs/architecture/system.md`, `rbac.md`, `workflow.md`
- Compact invariant list: `.ai/architecture_locks/ADR-001-nxs-spa-architecture.md`

## Last Completed Tasks

(Newest on top, keep only 5.)

1. **2026-08-27 — Correction: New Booking Modal & Booking List Row Full Mockup Parity** (`ohm#5q9x2m4p`).
   Explicitly corrects part of the Bookings phase's (`ohm#9k4p7w2z`) original
   scope to achieve full HTML mockup parity for both the New Booking modal and the Bookings tab day list rows.
   **Client selection**: replaced inline search with the mockup's dropdown select
   (`— Walk-in / No account —` + registered clients) with conditional guest name
   input field for walk-ins without accounts.
   **Layout**: organized into 2-column Service & Therapist row (therapist hidden
   for Wet Area), Promo dropdown below (massage-only, with Squad Goals derivation
   and weekday soft warning banner), and Date picker with past date validation
   ("Cannot book a date in the past.").
   **Time & Rooms**: implemented visual Time Slot Grid with struck-through
   disabled styling for conflicting slots (`taken`) and gold active selection,
   "Use a custom time instead" toggle with live availability indicator, and
   Room & Assignment Mode (`Auto (recommended)` vs `Manual`) row with auto-selection
   of free rooms.
   **Booking Row List**: updated day list in `BookingBrowser` to match mockup
   card layout (`Aug 27, 2026 / 3:00 PM`, client name, room badge, squad pill,
   service + therapist, uppercase status pill badge, and `Log Visit` / `No-show` / `Cancel` action buttons).
   **Submission**: allows nullable therapist and room for Wet Area bookings;
   triggers SMS preview modal for registered clients upon creation.
2. **2026-08-27 — Correction: Squad Goals via Promo Dropdown + Quick Walk-in
   Full Mockup Parity** (`ohm#8r3n6y1q`). Explicitly corrects part of the
   Bookings phase's (`ohm#9k4p7w2z`) original scope — this reverses that
   phase's Squad Goals checkbox/pax-stepper decision, not a new feature.
   Plan (including which Quick Walk-in flow is in scope) presented and
   approved before any code, per the prompt's mandatory gate. The mockup
   the prompt cited (`nxs-spa-portal.html`) didn't match — the only copy
   findable on disk had no Quick Walk-in modal at all; flagged and blocked
   until the user supplied the correct file. **Squad Goals**: removed the
   checkbox/pax-stepper from New Booking; Squad Goals is now selected via
   the existing Promo dropdown (`Squad Goals 3pax`/`4pax`, already seeded
   in the live `promos` table at −₱150/−₱200 — no promo data change
   needed). `pax_count` is derived app-side from the selected promo label
   at submit time, so the existing `pax_count` check constraint (3 or 4)
   needed no schema change. The weekday soft-warning banner is preserved,
   now triggered by "Squad Goals promo selected + weekday" instead of the
   checkbox. **Quick Walk-in**: rebuilt to full mockup parity — client
   search with guest-name fallback, conditional therapist/room (hidden for
   Wet Area), time-slot grid + custom-time toggle (reusing
   `lib/bookings/slots.ts`), room auto-suggested from live conflicts,
   locker assignment, promo (mutually exclusive with manual discount),
   add-ons, auto-computed read-only Amount Paid, Payment Method, and a
   GCash reference field. Scoped to the mockup's `openQuickWalkin()` flow
   only — `completeWalkinBooking()` ("Complete Walk-in Visit," converting
   an existing `Booked` row) was explicitly excluded since it depends on
   the booking-status-transition UPDATE path the Bookings phase
   deliberately left unbuilt; confirmed with the user before scoping.
   **DB**: one new migration
   (`supabase/migrations/20260827133448_quick_walkin_promo_rls.sql`),
   smoke-tested via a rolled-back transaction (registered + guest walk-in,
   addon, ledger-only-for-registered, and the GiST exclusion constraint
   still firing through the new path) before applying for real. Adds
   narrow anon SELECT policies on `promos`/`addons`/`locker_occupancy` and
   INSERT policies on `locker_occupancy`/`sale_addons`, plus a new
   `public.quick_walkin(...)` function modeled directly on
   `log_visit()`'s atomic-transaction pattern (not `SECURITY DEFINER` —
   reachable via the same anon INSERT-policy shape) that writes booking +
   sale + optional sale_addons + optional ledger entry (registered clients
   only) + locker_occupancy + action_log in one transaction. No change to
   `bookings.pax_count` or its check constraint. Verified live in a
   browser: Squad Goals promo booking (weekday warning, correct
   `pax_count`/`promo_id`), Quick Walk-in for a massage service
   (therapist/room conflict-greying, addon, promo, locker), and Quick
   Walk-in for Wet Area (fields correctly hidden, no therapist/room) — all
   three confirmed via direct DB read, then cleaned up. Regression-checked:
   New Booking's conflict-greying and SMS preview still work.
3. **2026-08-27 — Version-Controlled Migration Files: retroactive baseline +
   going-forward convention** (`ohm#2m6x9j5f`). Closed the gap flagged
   across Core Loop, Bookings, and the original schema audit: no migration
   files existed anywhere, so all DB-layer changes lived only in Supabase
   with no version-controlled history. Tooling decision (presented and
   approved before generating anything): Supabase CLI is installed locally
   but this repo has no `supabase/` directory and isn't CLI-linked, so the
   baseline was hand-authored rather than generated via `supabase db diff`
   — written to the same path/naming convention (`supabase/migrations/`,
   timestamp-prefixed) so it stays compatible if the project is linked
   later. Live schema was pulled directly via the Supabase connector (not
   reconstructed from docs) and verified to match ADR-001's count: 18
   tables + 1 view (`loginable_staff`). Baseline file
   (`20260827130641_baseline_snapshot.sql`) covers all tables, both GiST
   exclusion constraints, the ledger immutability triggers, the
   `SECURITY DEFINER` fix on `apply_points_delta()`, `log_visit()`,
   `pax_count` + its check constraint, and all 12 current RLS policies —
   confirmed snapshot-only, not applied/re-run against the live DB.
   Documented the going-forward rule in `docs/architecture/workflow.md`:
   every DB change now ships its own migration file in the same commit as
   the dependent app code, and this is a standing Approval & Regression
   Gate check going forward.
4. **2026-08-27 — Bookings Phase: New Booking form, 90-min overlap engine,
   Quick Walk-in** (`ohm#9k4p7w2z`). Plan + regression assessment presented
   and approved before any code, per the prompt's mandatory gate; four open
   architectural questions (Quick Walk-in write path, operating hours/slot
   grid, SMS copy, Squad Goals pax storage) were surfaced and resolved with
   the user before scoping, rather than guessed. Built `app/bookings/page.tsx`
   (real, was a stub) with `BookingBrowser`/`BookingFormModal`/
   `QuickWalkinModal`/`SmsPreviewModal`, and `app/bookings/actions.ts`
   (`createBooking` server action). DB-level no-double-booking (GiST
   exclusion constraints, pre-existing) is verified as the enforcement
   source of truth; UI greys out conflicting therapist/room options as a
   UX layer only, and real conflicts surface a specific "therapist" or
   "room" error parsed from the exclusion-violation code, not a raw
   Postgres string. One additive schema change: `bookings.pax_count`
   (nullable smallint, check 3 or 4, for Squad Goals headcount) plus narrow
   `anon` SELECT/INSERT RLS policies on `bookings` — both smoke-tested via
   a rolled-back transaction first. Quick Walk-in inserts directly into
   `bookings` as `status = 'Completed'` (decided with the user), reusing
   the same conflict-checked insert path. SMS is a compose/preview-only
   step with placeholder copy (no gateway wired into this repo) — same
   placeholder-actor pattern as Core Loop for the staff picker. Status
   transitions (Booked→Completed/No-show/Cancelled) were explicitly left
   out of scope — no UPDATE policy was opened for `anon`. No migration
   files exist for this change either (flagged again, not resolved).
   Verified live in a browser: New Booking with SMS preview, a forced
   double-booking showing the specific conflict error, and Quick Walk-in —
   plus regression-checked Dashboard and Client Profile/Log Visit.
5. **2026-08-27 — Core Loop: Client Profile Actions, Points Ledger, Log
   Visit Modal** (`ohm#7f3k9d2m`). Plan presented and approved before any
   code, per the prompt's mandatory gate. Added `public.log_visit(...)`
   (atomic ledger + optional sale + action log insert in one transaction),
   Log Visit UI on Client Profile, and narrow additive RLS policies for the
   five tables this needed — see the RLS invariant above and
   [[points_ledger_state]] for detail. Fixed a latent bug this surfaced:
   `apply_points_delta()` needed `SECURITY DEFINER` to update `clients`
   under RLS. Verified with a rolled-back SQL transaction (earn, pure
   redemption, insufficient-balance guard, redemption-with-upgrade,
   immutability) before writing app code, then re-verified live through the
   real UI in a browser. Staff Auth still deferred; not a regression.
