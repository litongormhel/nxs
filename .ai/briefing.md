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

(Newest on top, keep only 5.)

1. **2026-08-30 — Therapist Absent/Leave status → Dashboard reassignment
   trigger** (`ohm#3f8q1w6z`). Plan + regression risk assessment presented
   and approved before any code/migration was written, per the prompt's
   mandatory gate. `Mark Absent Today`/`Mark On Leave` (menu wired
   `ohm#7k2m9x4p`, previously local-state-only) now persist for real:
   new `markAbsentToday()`/`markOnLeave()` server actions
   (`app/(staff)/therapists/actions.ts`) upsert/insert into
   `therapist_absence`/`therapist_leave` and flag that therapist's
   `Booked` bookings for the affected day(s) to `Needs Reassignment` —
   already an existing `bookings.status` enum value, already inside both
   GiST no-double-booking constraints' scope, so **no schema/enum change
   was needed** for the flagging itself. New migration
   `20260830024144_therapist_absence_leave_rls.sql` adds `staff_select`/
   `staff_insert` RLS to `therapist_absence`/`therapist_leave` (both had
   RLS enabled with zero policies since the baseline snapshot, same gap
   `therapist_day_off` had before `ohm#7k2m9x4p`) — applied live after
   explicit user confirmation (the auto-mode classifier blocked applying
   it directly, as expected for a live schema change). Dashboard
   (`app/(staff)/dashboard/page.tsx`, previously 4 static stat cards only)
   now also fetches `Needs Reassignment` bookings and non-archived
   therapists, rendering a new `components/reassignment-panel.tsx`
   (`ReassignmentPanel`) with a Transfer action per flagged booking.
   Transfer reuses the existing `changeBookingTherapist()` action
   (`app/(staff)/bookings/actions.ts`) unchanged in its exclusion-
   violation handling — the no-double-booking GiST constraints are
   untouched and unweakened. **Gap found and fixed**: that function never
   flipped a `Needs Reassignment` booking's status back to `Booked` after
   a successful reassignment (so the Bookings tab's own pre-existing
   `ohm#7k2m9xq4` "Reassign" button never actually resolved the flag
   either) — now it does, as part of the same UPDATE. No changes to
   Points Ledger, Sales, or Locker Board. `npx tsc --noEmit` and `eslint`
   both clean on all changed/new files. **Not verified live in-browser**
   this session — another chat's dev server was already running on
   :3000 and the login page requires real staff credentials this session
   doesn't have (same blocker as recent prior tasks); verified via code
   review, `tsc`/`eslint`, and the Supabase advisors check confirming the
   new RLS closed the flagged gap with no new issues introduced. See
   [[therapists_state]], [[bookings_state]], [[dashboard_state]].

2. **2026-08-30 — Therapist Roster — Copy Available-List to Clipboard**
   (`ohm#9d4r7t2h`). Plan + regression risk assessment presented and
   approved before any code was written, per the prompt's mandatory
   gate. Purely additive: one copy-icon button next to "Show Archived"
   in `components/therapist-browser.tsx`, one new `handleCopyAvailable`
   handler. Filters the already-computed `cardRows` for
   `slotStatus === "available"` (same status logic the cards already
   render from — no new filter/render logic), formats as
   `"{TIME} Available\n\n{Name}\n..."` using the existing `fmtTime()`
   helper (already produces `8:00PM`-style output), writes via
   `navigator.clipboard.writeText`, confirms via the existing toast
   system. No changes to filter dropdown, `cardRows` computation, or any
   other handler. Not verified live in-browser this session (no staff
   login credentials available); verified via code review + `tsc
   --noEmit` (no type errors). See [[therapists_state]].

3. **2026-08-30 — Therapist Roster — Kebab Menu / Day-Off Persistence /
   Date Default** (`ohm#7k2m9x4p`). Plan + regression risk assessment
   presented and approved before any code was written, per the prompt's
   mandatory gate. Kebab "does nothing" turned out to be React's own
   delegated click listener and the component's click-outside-to-close
   `document.addEventListener` both sitting on `document` — a sibling
   listener isn't stopped by `e.stopPropagation()`, so the menu closed
   itself in the same tick it opened; fixed with an explicit
   `data-kebab-root` target check instead of relying on
   `stopPropagation()`. Day-off toggle never persisted because
   `components/therapist-browser.tsx` had zero Supabase calls anywhere —
   pure local mock state — and `therapist_day_off` had RLS enabled with
   **no policies at all** since the baseline snapshot; flagged as a
   required migration mid-task (none was expected) and approved before
   applying. New migration
   `20260830000000_therapist_day_off_rls.sql` (staff read, supervisor+
   write, same pattern as Settings' catalog RLS), new
   `app/(staff)/therapists/actions.ts` (`toggleDayOff`), `page.tsx` now
   fetches real therapist `id`s + `therapist_day_off` rows. Date filter's
   stale `"2026-08-26"` default was swapped for the existing-but-unused
   `todayISO()` helper — which itself had a bug found live (used UTC via
   `toISOString()` instead of local date), fixed to use local-time date
   getters. Verified live end-to-end (menu open/close, DB round-trip
   survives a hard reload, correct local date at a real UTC/local-day
   skew moment). No changes to Locker Board, Call Sheet, or Sales. See
   [[therapists_state]].
4. **2026-08-29 — Bookings Tab — 3-Tab Restructure** (`ohm#7q2x9m4k`).
   Restructures the flat Bookings list + status pill into 3 tabs
   (Upcoming / Check-in / Check-out); tab membership is derived from
   existing `bookings.status` joined with `locker_occupancy` checkout
   state — no new status enum value. Plan + regression risk assessment
   presented and approved before any migration/code was written, per the
   prompt's mandatory gate. Migration
   `20260829180000_locker_occupancy_booking_id.sql` adds nullable,
   additive `locker_occupancy.booking_id uuid references bookings(id)`
   (no backfill, no NOT NULL, GiST exclusion constraints and
   `trg_bookings_set_computed_fields` untouched) and updates the
   `quick_walkin()` RPC to populate it (`v_booking_id` already in scope);
   verified in a rolled-back transaction before applying live, per the
   `pax_count` precedent. `logVisitBooking()`'s `locker_occupancy` insert
   now also writes `booking_id: input.bookingId`. `components/booking-browser.tsx`
   rewritten: tab bar with per-tab counts, table-based columns per tab
   (Upcoming: Massage Time/Client/Service/Room/Therapist/Action;
   Check-in: + Check-in Time/Locker #; Check-out: + Check-out Time),
   Date column and per-row status pill removed (redundant with the date
   picker and tab membership), sort reuses `compareSlotTimes()` from
   `lib/bookings/slots.ts` (spa-day-aware, minutes-since-4PM ordering —
   already extractable, not reimplemented). Locker Board and Call Sheet
   confirmed unaffected (both use explicit column selects and their own
   `checked_out_at IS NULL` filter, no `booking_id` reference).
   `lib/types/database.ts` regenerated from live schema (also restored
   pre-existing nullable annotations on `quick_walkin`'s RPC Args that a
   fresh codegen pass drops but call sites rely on). `npx tsc --noEmit`
   and `eslint` both clean; browser verification blocked by Staff Auth
   login (no test credentials available in this session) — flagged, not
   bypassed. See [[bookings_state]] and [[operations_state]].
5. **2026-08-29 — Bookings: Change modal extension** (`ohm#8p4t2vk6`).
   Extends the Change Therapist feature: renames "Change Therapist"
   button/modal title to "Change" on `Booked`/`No-show` rows ("Reassign"
   on `Needs Reassignment` unchanged); adds a `Start Time` input to the
   modal pre-filled with the booking's current time; excludes the currently
   assigned therapist from the dropdown entirely; adds a debounced
   (300 ms) live availability `useEffect` that re-queries same-day
   bookings and uses `slotsOverlap()` to grey out / disable conflicting
   therapists with a "— Unavailable" suffix (room availability explicitly
   excluded per task instructions); extends `changeBookingTherapist()`
   server action with a `newStartTime` parameter — writes `start_time` to
   the DB (trigger recomputes `start_ts`/`end_ts`, GiST constraint enforces
   the new window), and conditionally logs only the fields that actually
   changed (`old_therapist → new_therapist`, `old_time → new_time`, or
   both). No migration required. `npx tsc --noEmit` and `eslint` both
   clean. See [[bookings_state]].
