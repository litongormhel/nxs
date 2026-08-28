# Handoff — Active Sprint

Not a history log — see `.ai/briefing.md` → "Last Completed Tasks" for that.
This file tracks only what's in flight right now.

## In progress

- **Closeout (`ohm#6w9d3n8h`) — Commit Reviewed Therapist-Tab Work + Fix
  Stale Settings State Doc** — **complete** as of 2026-08-28. Two-item
  closeout from audit `ohm#4t7b2k9w`:
  - **Item 1 (commit Therapist-tab work)**: no action needed. `git status`
    at the start of this session showed a clean working tree — the
    Therapist-tab work the audit described (`app/therapists/page.tsx`,
    `components/therapist-browser.tsx`, plus doc updates) was already
    committed as `90c5329` ("Thera Tab Audit") before this session began.
    The audit's snapshot had gone stale; verified via `git show --stat` that
    `90c5329`'s diff matches exactly what the audit described, so nothing
    further was committed.
  - **Item 2 (fix stale settings_state.md)**: `docs/state/settings_state.md`
    rewritten to describe current reality — full HTML mockup parity UI
    (theme toggle, staff-role simulation, services/promos/slots/add-ons/
    capacity editing, all from `components/settings-browser.tsx`) —
    while making explicit that it is **UI-only, no Supabase persistence**:
    verified directly against the code (`app/settings/page.tsx` only reads
    seed data; `settings-browser.tsx` has no `insert`/`update`/`delete`
    calls and no `actions.ts` file exists). Framed as a deliberate deferral,
    mirroring the "Staff Auth intentionally deferred" pattern. Settings
    persistence/wiring remains explicitly out of scope — a separate,
    larger follow-up.

- **Correction (`ohm#7m2k5v9q`) — Therapists Tab Full HTML Mockup Parity** —
  **complete** as of 2026-08-27. Explicitly corrects part of the Bookings/Therapists
  phase's (`ohm#9k4p7w2z`) original scope and follows the Squad Goals / Quick Walk-in
  implementation to achieve full HTML mockup parity for the Therapists panel (`#panel-therapists`):
  - **Therapist Roster**: Default 10 therapists matching mockup (`Ron`, `Don`, `Tristan`, `Leo`, `Roy`, `Xander`, `Dan`, `Marco`, `Akio`, `Josh`),
    avatar initial badge, Most Requested badge (`✦ Most Requested`) for top-booked therapist, and daily schedule modal on header click.
  - **Filter Bar**: Interactive Date picker, Time slot select (`16:00` to `01:00`), availability filter (`Select All`, `Available`, `Booked`),
    and `Show Archived` toggle.
  - **Interactive Roster Controls**: Clickable Weekly Day(s) Off toggle pills (`Sun`–`Sat`) and Services Offered toggle pills (`Combi Massage`,
    `Signature Massage`, `Scrub`) with instant toast alerts.
  - **Kebab Action Menu**: Dropdown on each therapist card supporting `Mark Absent Today` (with automated booking reassignment flagging),
    `Mark On Leave` (with start/end dates and optional reason), `Archive` (with required reason), `Unarchive`, and `Edit` (for in-place renaming).
  - **Modals**: Add Therapist modal with multi-select Day Off / Services pills, Daily Schedule modal, Mark On Leave modal,
    Archive Therapist modal, and Edit Name modal.
  - **Toast Alerts**: Bottom-center floating toast alert with auto-fade timeout for instant feedback on all roster mutations.

- **Correction (`ohm#6j2v9s4k`) — Settings Page Full HTML Mockup Parity** —
  **complete** as of 2026-08-27. Explicitly corrects part of the Bookings
  phase's (`ohm#9k4p7w2z`) original scope and follows the Squad Goals / Quick Walk-in
  implementation to achieve full HTML mockup parity for the Settings panel (`#panel-settings`):
  - **Display & Appearance**: Interactive dark/light appearance toggle switch with sun/moon SVG icons
    and dynamic subtitle ("Dark mode — easier on the eyes for late shifts" vs "Light mode — brighter for daytime front-desk use"),
    properly toggling the `.light` class on document body.
  - **Account & Staff Simulation**: Displays active simulated staff (`Ana`, `Receptionist · Front Desk`, `Signed in`),
    with a `Simulate Staff` dropdown selector that dynamically switches active actor and role permissions (`Front Desk` vs `Supervisor` / `Owner`).
  - **Services & Pricing**: Dynamic permissions lock notice, list of services with editable Points and Price (₱)
    (disabled for Front Desk role), `+ Add Service` modal dialog, and service deletion (for Supervisor/Owner).
  - **Promo Codes**: Dynamic permissions lock notice, list of promos with editable discount values (-₱)
    (disabled for Front Desk role), `+ Add Promo` modal dialog, and promo deletion (for Supervisor/Owner).
  - **Weekend Fixed Time Slots**: Interactive list of weekend time slots with 12-hour AM/PM formatting,
    `+ Add Slot` modal dialog with 24-hr HH:MM validation and auto-sorting, and slot deletion.
  - **Add-ons**: List of add-ons with editable Price (₱), `+ Add Add-on` modal dialog, and add-on deletion (with minimum 1 safeguard).
  - **Capacity**: Interactive Lockers row with `+ Add 10 Lockers` increment button and Rooms / Beds row with editable number input.
  - **Toast Feedback**: Bottom-center floating toast alert with auto-fade timeout for instant feedback on all settings mutations.

- **Correction (`ohm#4t7w1p9k`) — Log Visit Modal, No-Show, and Cancel Action Wiring** —
  **complete** as of 2026-08-27. Explicitly corrects part of the Bookings
  phase's (`ohm#9k4p7w2z`) original scope to enable the full **Log Visit**
  modal and wire up the **Log Visit**, **No-Show**, and **Cancel** action buttons:
  - **Log Visit Modal (`components/log-visit-modal.tsx`)**: Rebuilt to full HTML mockup parity matching
    `#modalScrim` and user screenshot:
    - **Find Booking**: Autocomplete/live search of open bookings (`Booked` / `Needs Reassignment`) with
      `Linked: [Name] · Room [X]` badge and automatic prefilling of client, service, therapist, date, promo.
    - **Date & Therapist**: 2-column grid; Therapist select disabled when service is Wet Area.
    - **Locker Assignment**: Dropdown listing available free lockers (and current locker if already assigned).
    - **Availed Service**: Services with points preview and `Redeem: Combi Massage Reward (−100 pts)`.
    - **Redemption Upgrade**: Checkbox `Upgraded with cash top-up` revealing `Upgraded To` select + `Cash Top-up (₱)` input.
    - **Manual Discount**: Dashed Senior/PWD discount box (Percentage / Fixed ₱), mutually exclusive with promo codes.
    - **Add-ons**: Checkbox list of available add-ons (+₱50 Towel, etc.).
    - **Points & Amount**: Read-only auto-calculated Added Points and Amount Paid (₱) with free investor perk hint for Wet Area.
    - **Payment & Promo**: Payment method select (Cash, GCash, Card, Points) with conditional GCash Ref input, and Promo code select.
  - **Action Buttons (`components/booking-browser.tsx`)**:
    - `Log Visit` opens the `LogVisitModal` with that booking pre-linked and prefilled.
    - `No-show` calls `updateBookingStatus(id, "No-show")` and reloads.
    - `Cancel` calls `updateBookingStatus(id, "Cancelled")` and reloads.
  - **Server Actions (`app/bookings/actions.ts`)**:
    - `logVisitBooking` executes atomic booking completion (`status = 'Completed'`), sales insert, `sale_addons` inserts,
      `point_transactions` insert (EARN or REDEEM -100), `locker_occupancy` insert, and `action_logs` record.
    - `updateBookingStatus` updates booking status and revalidates `/bookings` and `/dashboard`.

- **Correction (`ohm#5q9x2m4p`) — New Booking Modal & Booking List Row Full Mockup Parity** —
  **complete** as of 2026-08-27. Explicitly corrects part of the Bookings
  phase's (`ohm#9k4p7w2z`) original scope (which followed
  the Squad Goals/Quick Walk-in correction `ohm#8r3n6y1q`) to match the HTML
  mockup (`#bookingModalScrim` and `#panel-bookings` / `.booking-row`):
  - **Client selection**: Replaced inline search with the mockup's dropdown
    select (`<select id="bClient">` with `— Walk-in / No account —` at top and
    registered clients) plus a conditional `Client Name (walk-in / no account)`
    text input shown when walk-in is selected.
  - **Service & Therapist**: Organized into a 2-column row, with Therapist
    cleanly hidden when "Wet Area" is selected.
  - **Promo dropdown**: Positioned below Service/Therapist (hidden for Wet Area),
    preserving Squad Goals promo derivation and the weekday soft-warning banner.
  - **Date validation**: Enforces past-date validation ("Cannot book a date in the past.").
  - **Time Slot Grid & Custom Time**: Interactive time slot grid with taken/conflicting
    slots struck through (`line-through opacity-50 cursor-not-allowed`) and gold
    active selection state; "Use a custom time instead" toggle with time input
    and live therapist/room availability hint.
  - **Room & Assignment Mode**: Room selector paired with `Assignment` mode
    (`Auto (recommended)` vs `Manual`), where Auto automatically selects the
    first available room from live conflict calculations.
  - **Booking List Row Parity**: Updated `BookingBrowser` item cards to render
    the exact HTML mockup / screenshot layout (`br-time` on left, client + room mini + squad pill
    and service/therapist in middle, uppercase status chip on right, plus `Log Visit`, `No-show`,
    `Cancel` action buttons).
  - **Server Actions**: `CreateBookingInput` updated in `app/bookings/actions.ts`
    to allow `therapistId: string | null` and `roomNumber: number | null`
    for non-therapist services like Wet Area, and added `updateBookingStatus` action.
  - **SMS Preview**: Re-verified that creating a booking for a registered client
    opens the SMS preview modal, while walk-in guest bookings complete directly.
- **Correction (`ohm#8r3n6y1q`) — Squad Goals via Promo Dropdown + Quick
  Walk-in Full Mockup Parity** — **complete** as of 2026-08-27. This
  explicitly corrects part of the Bookings phase's (`ohm#9k4p7w2z`)
  original scope, not a new feature: reverses that phase's Squad Goals
  checkbox/pax-stepper decision. Plan (including the "which Quick Walk-in
  flow is in scope" design question) was presented and approved before any
  code, per the prompt's mandatory gate. The mockup file the prompt cited
  didn't match on first check — the only `nxs-spa-portal.html` findable
  on disk had no Quick Walk-in modal at all and a different Squad Goals
  UI; flagged to the user and blocked until they supplied the correct
  file, rather than guessing from the prompt's text alone.
  - **Squad Goals**: removed the standalone checkbox/pax-stepper from
    `components/booking-form-modal.tsx`. Squad Goals is now selected via
    the Promo dropdown (`Squad Goals 3pax`/`4pax`, already present in the
    live `promos` table at −₱150/−₱200 — no promo data change needed),
    hidden for non-massage services (Wet Area) same as the mockup.
    `pax_count` is derived app-side from the selected promo's label
    (`squad3`→3, `squad4`→4, else `null`) at submit time — the existing
    `pax_count` check constraint (3 or 4) needed no schema change or
    rollback. The weekday soft-warning banner is preserved, now keyed off
    "Squad Goals promo selected + weekday" instead of the old checkbox.
  - **Quick Walk-in**: `components/quick-walkin-modal.tsx` rebuilt to full
    mockup parity — client search with guest-name fallback (one modal, not
    a two-toggle split), conditional therapist/room (hidden for Wet Area),
    time-slot grid + "use a custom time instead" toggle (reusing
    `lib/bookings/slots.ts`, not duplicated), room auto-suggested from a
    live same-day conflict query, locker assignment (required), promo
    (mutually exclusive with manual discount — selecting one disables the
    other), manual discount (pct/fixed), add-ons (multi-select), an
    auto-computed read-only Amount Paid field, Payment Method, and a GCash
    reference field shown only for GCash. Scoped to the mockup's
    `openQuickWalkin()` flow only — `completeWalkinBooking()` ("Complete
    Walk-in Visit," for converting an existing `Booked` row) was
    explicitly excluded and confirmed with the user before building: it
    depends on the booking-status-transition `UPDATE` path the Bookings
    phase deliberately left unopened, and building it here would silently
    reopen that gate as a side effect.
  - **DB change** (own migration file,
    `supabase/migrations/20260827133448_quick_walkin_promo_rls.sql`,
    smoke-tested via a rolled-back transaction — registered-client walk-in
    with promo+addon, guest walk-in with manual discount, and confirming
    the GiST exclusion constraint still fires through the new path — before
    applying for real): narrow additive `anon` SELECT policies on
    `promos`/`addons`/`locker_occupancy` and INSERT policies on
    `locker_occupancy`/`sale_addons`; new `public.quick_walkin(...)`
    function modeled directly on `log_visit()`'s atomic-transaction
    pattern (not `SECURITY DEFINER` — reachable via the same anon
    INSERT-policy shape already granted) that writes booking (status
    `Completed`) + sale + optional `sale_addons` + optional points-ledger
    EARN entry (only when a registered client was found — guests get no
    ledger entry) + `locker_occupancy` + `action_logs`, all in one
    transaction. `app/bookings/actions.ts` gained a `quickWalkin()` server
    action calling this RPC, parsing the same `23P01` exclusion-violation
    cases as `createBooking` plus a new `23505` case for locker/room
    occupancy conflicts. No change to `bookings.pax_count` or its check
    constraint.
  - Regenerated `lib/types/database.ts` from the live schema after
    applying the migration (new `quick_walkin` RPC + updated table types);
    hand-adjusted the generated `quick_walkin` `Args` type to mark the
    genuinely-nullable parameters `| null` since Supabase's codegen
    doesn't infer that from a plain (non-`default`) SQL parameter.
  - Verified live in a browser (not just typecheck — `npx tsc --noEmit`
    passes clean): a Squad Goals promo booking on today's (weekday) date
    showed the warning banner and saved with correct `pax_count`/
    `promo_id`; a Quick Walk-in for a massage service exercised
    therapist/room conflict-greying, an add-on, a promo, and locker
    assignment, with the amount auto-computing correctly at each step; a
    Quick Walk-in for Wet Area correctly hid therapist/room/promo and
    booked with `therapist_id`/`room_number` both `null`. All three
    confirmed by reading the actual `bookings`/`sales`/`sale_addons`/
    `locker_occupancy`/`action_logs` rows directly, then the test rows
    were cleaned up from the live DB. Regression-checked and confirmed
    intact: New Booking's therapist/room conflict-greying and the SMS
    preview step for registered-client bookings.
- **Migration files (`ohm#2m6x9j5f`) — retroactive baseline + going-forward
  convention** — **complete** as of 2026-08-27. Tooling decision (Supabase
  CLI installed but project not CLI-linked here, no `supabase/` directory)
  was presented and approved before generating anything. Pulled the live
  schema directly from Supabase (not from docs — those can drift) and
  confirmed it matches ADR-001: 18 tables + 1 view (`loginable_staff`), both
  GiST exclusion constraints, ledger immutability triggers, `pax_count`,
  the `SECURITY DEFINER` fix on `apply_points_delta()`, `log_visit()`, and
  all 12 current RLS policies. Wrote one hand-authored snapshot file,
  `supabase/migrations/20260827130641_baseline_snapshot.sql` — **DB
  migrations are now version-controlled starting from this baseline.** This
  file is a snapshot only: everything in it is already applied live; it was
  never run against the database (no `apply_migration` call was made this
  session — read-only pulls only). Added the going-forward rule to
  `docs/architecture/workflow.md`: every DB-layer change ships its own
  migration file in the same commit as the dependent app code, now a
  standing Approval & Regression Gate check. Noted where migrations live in
  `docs/architecture/system.md`. No schema, RLS, triggers, or functions were
  changed — this task only captured current state as version-controlled
  files.
- **Bookings phase (`ohm#9k4p7w2z`) — New Booking form, 90-min overlap
  engine, Quick Walk-in** — **complete** as of 2026-08-27. Plan +
  regression assessment presented and approved before implementation.
  Delivered: `app/bookings/page.tsx` is now real (was a stub) with a
  day-view list, New Booking modal, and Quick Walk-in modal. New Booking:
  client search (registered only), service/therapist/room/date/hourly-slot
  picker (4:30 PM open, last call 1:00 AM), UI-layer conflict greying for
  therapist/room, Squad Goals pax stepper (3/4) with a non-blocking weekday
  warning banner, and an editable SMS preview (placeholder copy, no
  gateway — compose/preview only) shown after a successful booking for a
  registered client, using the service's non-discounted price. Quick
  Walk-in: single-step modal, toggles between walk-in guest (free-text
  label) and registered-member search, manual room dropdown, inserts
  directly into `bookings` as `status = 'Completed'` — decided with the
  user over the alternative of bypassing `bookings` entirely. Both paths
  go through one `createBooking` server action
  (`app/bookings/actions.ts`) that lets the DB's GiST exclusion
  constraints be the real enforcement and parses `23P01` violations into a
  specific "therapist" or "room" conflict message rather than surfacing
  the raw Postgres error.
  - **DB change**: `bookings.pax_count` (nullable smallint, check
    constraint `IN (3,4)`) — additive, smoke-tested via a rolled-back
    transaction (valid 3/4 inserts, invalid value correctly rejected,
    both GiST exclusion constraints confirmed still intact) before
    applying for real. New narrow `anon` SELECT/INSERT RLS policies on
    `bookings` (same shape as Core Loop's), no UPDATE/DELETE.
  - **Explicitly out of scope, flagged not forgotten**: status transitions
    (Booked→Completed/No-show/Cancelled) need an `anon` UPDATE policy on
    `bookings` that was not opened this phase — left out of the UI
    entirely rather than added ad hoc. No version-controlled migration
    file exists for the `pax_count` column or the new RLS policies — same
    gap as every prior phase, still unresolved, still worth a real
    decision.
  - **Discrepancies resolved with the user before building** (none were
    guessed): operating hours/slot grid, SMS copy format, and Squad Goals
    pax storage were all undocumented anywhere in this repo — confirmed
    directly rather than assumed. See [[bookings_state]] for the
    surgical detail.
  - Verified live in a browser (not just typecheck/build): created a
    registered-client booking end-to-end including the SMS preview,
    forced a real double-booking to confirm the specific conflict message,
    ran a Quick Walk-in end-to-end, and regression-checked
    Dashboard and Client Profile/Log Visit — both unaffected. Test rows
    cleaned up from the live DB after verification.
- **Core Loop phase (`ohm#7f3k9d2m`) — Client Profile Actions, Points
  Ledger, Log Visit Modal** — **complete** as of 2026-08-27. Plan was
  presented and approved before implementation, per the prompt's mandatory
  gate. Delivered: Log Visit button + last-10 activity list on Client
  Profile, `public.log_visit(...)` atomic write RPC (ledger + optional sale
  + action log in one transaction), narrow additive RLS policies for `anon`
  on `clients`/`staff`/`point_transactions` (SELECT) and
  `point_transactions`/`sales`/`action_logs` (INSERT), and a one-line fix
  making `apply_points_delta()` `SECURITY DEFINER` (pre-existing trigger,
  broken for any RLS-scoped caller until this surfaced it in manual
  smoke-testing). See [[points_ledger_state]], [[clients_state]],
  [[sales_state]], [[staff_state]], [[logs_state]] for the surgical detail.
  **Staff Auth intentionally deferred** — RLS now has narrow anon
  SELECT/INSERT policies scoped to exactly what Core Loop needs, not a
  general re-open; `clients` still has no UPDATE policy. Action Logs uses
  a placeholder actor dropdown (`// TEMP: placeholder actor pending Staff
  Auth phase` — grep this). Not a regression, not forgotten.
- Doc scaffold bootstrap (`ohm#3q8n5t1x`) — **complete** as of 2026-08-27.
  `.ai/`, `docs/state/*.md`, `docs/architecture/*.md`, and the ADR-001
  invariants file are all in place, sourced from the live Supabase schema
  and the actual app tree (not assumed content).

## Session notes

- `app/dashboard` and `app/clients` have real implementations. Every other
  route under `app/` (`bookings`, `sales`, `therapists`, `staff`, `logs`,
  `analytics`, `settings`, `lockers`, `call-sheet`) is still an 8-line
  "Coming soon." stub — Core Loop did not touch any of them. Do not assume
  any behavior exists there beyond the stub unless you've re-read the file.
- Staff auth is still not wired up anywhere in the app code (no login page,
  no session in `app/layout.tsx`/`sidebar.tsx`). The app's server/browser
  Supabase clients use the anon key. RLS now has narrow, additive
  SELECT/INSERT policies for the five tables Core Loop needed (see above) —
  everything else is unchanged from the doc-scaffold bootstrap's findings:
  enabled, no policy, default-deny.
