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

1. **2026-08-28 — Closeout: Commit Reviewed Therapist-Tab Work + Fix Stale
   Settings State Doc** (`ohm#6w9d3n8h`). Two-item closeout from audit
   `ohm#4t7b2k9w`. **Item 1**: no commit was made — `git status` showed a
   clean working tree at session start; the Therapist-tab work the audit
   described was already committed as `90c5329` before this session began
   (verified the diff matches exactly). **Item 2**: rewrote
   `docs/state/settings_state.md`, which still described an 8-line stub,
   to reflect the actual full-parity Settings UI (`ohm#6j2v9s4k`) while
   explicitly flagging it as UI-only with no Supabase persistence — verified
   directly against `app/settings/page.tsx` (read-only seed fetch) and
   `components/settings-browser.tsx` (no mutation calls, no `actions.ts`).
   Settings persistence/wiring remains a separate, explicitly out-of-scope
   follow-up.
2. **2026-08-27 — Therapists Tab Full HTML Mockup Parity** (`ohm#7m2k5v9q`).
   Rebuilt `/therapists` route to full HTML mockup parity matching `#panel-therapists` and design system:
   **Therapist Roster**: Default 10 therapists matching mockup (`Ron`, `Don`, `Tristan`, `Leo`, `Roy`, `Xander`, `Dan`, `Marco`, `Akio`, `Josh`),
   avatar initial badge, Most Requested badge (`✦ Most Requested`) for top-booked therapist, and daily schedule modal on header click.
   **Filter Bar**: Interactive Date picker, Time slot select (`16:00` to `01:00`), availability filter (`Select All`, `Available`, `Booked`),
   and `Show Archived` toggle.
   **Interactive Roster Controls**: Clickable Weekly Day(s) Off toggle pills (`Sun`–`Sat`) and Services Offered toggle pills (`Combi Massage`,
   `Signature Massage`, `Scrub`) with instant toast alerts.
   **Kebab Action Menu**: Dropdown on each therapist card supporting `Mark Absent Today` (with automated booking reassignment flagging),
   `Mark On Leave` (with start/end dates and optional reason), `Archive` (with required reason), `Unarchive`, and `Edit` (for in-place renaming).
   **Modals**: Add Therapist modal with multi-select Day Off / Services pills, Daily Schedule modal, Mark On Leave modal,
   Archive Therapist modal, and Edit Name modal.
3. **2026-08-27 — Settings Page Full HTML Mockup Parity** (`ohm#6j2v9s4k`).
   Rebuilt `/settings` route to full HTML mockup parity matching `#panel-settings` and design system:
   **Display & Appearance**: Interactive dark/light appearance toggle switch with sun/moon SVG icons
   and dynamic descriptive subtitle.
   **Account & Staff Simulation**: Signed-in staff badge with `Simulate Staff` dropdown selector that
   updates simulated actor and role permissions (`Front Desk` vs `Supervisor` / `Owner`).
   **Services & Pricing**: Dynamic lock notice, service items with editable points and prices (disabled
   for Front Desk), `+ Add Service` modal and delete actions (Supervisor/Owner).
   **Promo Codes**: Dynamic lock notice, promo items with editable discounts (disabled for Front Desk),
   `+ Add Promo` modal and delete actions (Supervisor/Owner).
   **Weekend Fixed Time Slots**: Fixed weekend slot list with formatted AM/PM times, `+ Add Slot` modal with
   HH:MM format validation, and delete action.
   **Add-ons**: Add-on item list with editable prices, `+ Add Add-on` modal, and delete action.
   **Capacity**: Locker count with `+ Add 10 Lockers` increment button and editable Room / Bed count input.
   **Toast Notifications**: Animated bottom-center toast alert with auto-fade timeout for all settings actions.
4. **2026-08-27 — Correction: Log Visit Modal, No-Show, and Cancel Action Wiring** (`ohm#4t7w1p9k`).
   Explicitly corrects part of the Bookings phase's (`ohm#9k4p7w2z`) original
   scope to enable the full **Log Visit** modal and wire up the **Log Visit**, **No-Show**, and **Cancel**
   action buttons on the Bookings Tab.
   **Log Visit Modal**: rebuilt to full HTML mockup parity matching `#modalScrim` and user screenshot:
   find/link open bookings with live search suggestions and `Linked: [Name] · Room [X]`, Date of Visit,
   Therapist dropdown (hidden for Wet Area), Locker assignment, Availed Service with Points preview and
   `Redeem: Combi Massage Reward (−100 pts)`, cash upgrade section for redemptions, Senior/PWD manual discount
   (Percentage / Fixed ₱, mutually exclusive with promo), Add-ons checklist, auto-calculated points delta and amount paid,
   payment method selector, and promo dropdown.
   **Action Buttons**: Clicking `Log Visit` opens the modal prefilled for that booking; clicking `No-show` or
   `Cancel` updates the booking status via `updateBookingStatus` server action and immediately reloads the view.
   **Server Action**: `logVisitBooking` server action executes atomic booking completion, sales record creation,
   sale_addons insertions, points transaction (either EARN points or REDEEM -100), locker occupancy check-in, and action logs.
5. **2026-08-27 — Correction: New Booking Modal & Booking List Row Full Mockup Parity** (`ohm#5q9x2m4p`).
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

