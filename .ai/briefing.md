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

1. **2026-09-02 — New Booking — Status-Aware Therapist Dropdown + DB-Level
   Availability Gate** (`ohm#j4m8v2xq`). Fixes a bug where a Day-Off
   therapist (Leo) could be saved on a booking — the therapist dropdown had
   no availability awareness at all beyond live time/room conflicts, and
   `createBooking()` had zero server-side status validation. Confirmed live:
   "On Leave" was already a distinct table (`therapist_leave`, separate from
   `therapist_absence`/`therapist_day_off`) — no schema change needed.
   New DB trigger `check_therapist_availability()` (`BEFORE INSERT OR UPDATE
   OF therapist_id, booking_date, start_time ON bookings`, migration
   `20260902000000_bookings_therapist_availability_trigger.sql`) is the
   authoritative gate — table-level, so it also covers Quick Walk-in and
   Change/Reassign Therapist, not just New Booking (approved as intentional
   defense-in-depth). Column-scoped (not a bare `UPDATE` trigger) so the
   ~40 pre-existing bookings already assigned to Day-Off/Absent therapists
   in live data are never re-validated by an unrelated status transition —
   verified live. `booking-form-modal.tsx`'s Therapist `<select>` now shows
   `— Day Off`/`— Absent`/`— On Leave` suffixes and disables those options,
   alongside the pre-existing (already-correct, runtime-derived) `— Fully
   Booked`; default selection now skips to the first available therapist.
   No shared therapist-select component existed across modals (New Booking,
   Quick Walk-in, Log Visit, Sales each inline their own) — only New
   Booking's UI was touched; the others remain covered by the DB trigger
   only. `npx tsc --noEmit` clean; live-verified directly against Supabase
   (insert rejected for Leo, succeeded for an available therapist, status-
   only update on a pre-existing bad row unaffected) — dev-server preview
   hit the same recurring Windows working-directory bug as every other
   session this week. See [[bookings_state]] and [[therapists_state]].

2. **2026-09-02 — Call Sheet / Lockers — Stale Occupancy Filter + Nudge**
   (`ohm#3n8w5tqf`, implements approaches A + C from audit `ohm#7q2m9xk4`;
   approach B, auto-checkout, stays explicitly out of scope pending its own
   future prompt). UI/display-layer only — no schema, RLS, writer, trigger,
   or cron changes; `checkOutLocker`, `quick_walkin`, `logVisitBooking`, and
   every `locker_occupancy` insert path are untouched. Mockup presented and
   plan + regression risk assessment approved before any code was written,
   per the prompt's mandatory gate.
   - **Staleness definition reused, not reinvented**: a `locker_occupancy`
     row is stale when `toSpaDay(checked_in_at) !== spaDayNow()` — the
     existing canonical Analytics-phase helper
     (`lib/analytics/spa-day.ts`), not new date math and not
     `lib/bookings/slots.ts` (that file's `toMinutesSinceOpen` only handles
     intra-day `HH:MM` slot strings, not timestamps — confirmed wrong tool
     before ruling it out).
   - **Call Sheet** (`app/(staff)/call-sheet/page.tsx`,
     `components/call-sheet-browser.tsx`): the `locker_occupancy` select
     now also fetches `client_id, guest_label, clients(codename)`. Entries
     split into `inProgress` (fresh) / `needsCheckout` (stale); all
     existing time-slot filtering, the "Total: X massages…" count, and the
     JPEG export are unchanged and now scoped to `inProgress` only. New
     read-only "Needs checkout — N from a prior spa-day" section renders
     below the existing table (locker, room, service, guest/client,
     checked-in-at) — no action buttons, matching the prompt's spec;
     checkout stays exclusively on the Lockers page.
   - **Lockers page** (`app/(staff)/lockers/page.tsx`,
     `components/locker-board.tsx`): each occupancy entry gains a `stale`
     boolean (same `toSpaDay` check). Locker Board tiles for stale
     occupants get a dashed rust border + red label + "Since yesterday"
     tag instead of the normal gold-solid-border styling — still blocked
     from reassignment and still use the same unmodified `checkOutLocker`
     Check-Out button. New "`N` lockers need checkout" badge next to the
     existing "`X / Y` occupied" count.
   - **Known residual gap, explicitly not fixed here (do-not-touch scope)**:
     `components/booking-browser.tsx`'s Check-in/Check-out tab derivation
     (keyed off `bookings.status` + `occupancyOf()`) still shows a stale
     row stuck in "Check-in" for that booking's date indefinitely — a
     separate read path from Call Sheet/Lockers, untouched by this prompt.
   - `npx tsc --noEmit` clean. **Not verified live in-browser** — no
     `.env.local`/Supabase env vars configured in this sandbox (confirmed
     `next dev` itself starts and compiles cleanly under Turbopack; the
     500 is `proxy.ts` throwing on missing
     `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — same
     recurring environment gap as every other session this week. Verified
     instead via `tsc` and direct trace of the render logic. See
     [[operations_state]].

3. **2026-09-02 — Quick Walk-in — Live Time-Slot Greying by Therapist**
   (`ohm#9x4k2wr7`). UI-only — no schema/writer/RLS changes. Plan +
   regression risk assessment presented and approved before any code was
   written, per the prompt's mandatory gate. Reference implementation was
   `booking-form-modal.tsx` (New Booking), already correct and left
   read-only. Added a `takenSlots` useMemo to `quick-walkin-modal.tsx`
   (`components/quick-walkin-modal.tsx:150`), logic ported verbatim from
   New Booking's version: a slot is taken if the selected `therapistId`
   has an overlapping conflict (via `slotsOverlap`) or zero free rooms
   remain for that slot. Time Slot grid buttons
   (`components/quick-walkin-modal.tsx:449`) now `disabled={taken ||
   useCustomTime}` and use the same taken/selected/default className
   branching as New Booking (dashed/struck-through/greyed for taken,
   gold gradient for selected). The pre-existing `takenTherapists`
   greying (selected time → taken therapists in the dropdown) is
   untouched — both directions now coexist, matching New Booking's dual
   `takenSlots` + `conflictingTherapists` pattern. No changes to
   `app/(staff)/bookings/actions.ts`, `quickWalkin()`, the
   `public.quick_walkin(...)` RPC, `lib/bookings/slots.ts`, or
   `booking-form-modal.tsx`. `npx tsc --noEmit` clean. See
   [[bookings_state]] and `.ai/handoff.md`.

4. **2026-09-02 — Log Visit — Conditional Therapist Field** (`ohm#7n4k9wx3`).
   UI-only — no schema/writer/RLS changes. Plan + regression risk
   assessment presented and approved before any code was written, per the
   prompt's mandatory gate. `LogVisitModal`'s Therapist field reused the
   existing `linkedBooking` memo (the same condition driving the
   `Linked: [Name] · Room [X]` badge) to render read-only text
   (`therapists.find(t => t.id === linkedBooking.therapist_id)?.name`,
   falls back to `"— unassigned —"`) once a booking is linked via Find
   Booking search, instead of the always-editable dropdown — the
   therapist was already assigned at New Booking time and shouldn't be
   re-editable from Log Visit. Wet Area exemption (checked first) and the
   walk-in editable-dropdown path are both unchanged. No new state —
   `therapistId` is still populated by the existing `linkBooking()` call
   and is what's actually submitted to `logVisitBooking`, so the write
   path is untouched. `npx tsc --noEmit` clean. **Not verified live
   in-browser** — same recurring Windows preview-harness
   working-directory bug noted in prior entries (unrelated to this
   change). See [[bookings_state]] and `.ai/handoff.md`.

5. **2026-09-02 — Activity Logs — Human-Readable Detail Formatting**
   (`ohm#i35wdbgr`). Display-layer only — no writer/schema/RLS changes.
   New `lib/logs/format-detail.ts` (`formatLogDetail`) turns each row's
   raw `key=value` `detail` text into a human sentence, keyed off
   `action`; templates for 19 action types (the prompt's 17 confirmed-live
   plus 2 more found live during verification — `therapist_toggle_service`,
   `staff_archive`); any unmapped action falls back to the raw string
   (today's behavior), never a crash. Batched one-time-per-page-load joins
   (`therapists`/`services`/`addons`/`clients`/`locker_occupancy`) in
   `app/(staff)/logs/page.tsx`, with graceful fallback text for dangling
   ids. Two real bugs caught only by testing against live data (not the
   prompt's samples): (1) a naive space-split parser truncates multi-word
   values like "Combi Massage" — fixed to split on key boundaries instead;
   (2) `log_visit`'s direct-insert writer can put a raw guest-label string
   (not a UUID) in its `client=` field — detected via UUID-pattern test
   before attempting the join. `settings_update_room_count`'s
   `added=.../target=` semantics confirmed by reading the writer per the
   prompt's explicit instruction, not guessed from the sample. Filters
   (Action/Date/Staff) untouched — still operate on raw fields.
   `npx tsc --noEmit` clean; dry-run against the full live 95-row/19-action
   table via Supabase MCP showed zero bad output. **Not verified live
   in-browser** — same recurring Windows preview-harness
   working-directory bug as the prior entry (confirmed unrelated to this
   change: `npm run dev` runs cleanly from a direct terminal). See
   [[logs_state]] and `.ai/handoff.md`.

