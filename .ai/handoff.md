# Handoff — Active Sprint

Not a history log — see `.ai/briefing.md` → "Last Completed Tasks" for that.
This file tracks only what's in flight right now.

## In progress

- **Sidebar Nav — Collapsible Hamburger Menu for Mobile/Tablet — complete**
  (`ohm#757d5b08`, 2026-08-30). Plan + regression risk assessment
  presented and approved before any code was written, per the prompt's
  mandatory gate. UI/layout only, no backend/DB/auth changes.
  - **Bug fixed**: `components/sidebar.tsx`'s `<aside>` was a
    `w-60 shrink-0` flex sibling of `<main>` under `app/layout.tsx`'s
    `<body className="flex">` at every viewport width, squeezing page
    content on mobile (confirmed via screenshot on nxsspa.vercel.app).
  - **Fix**: `<aside>` is now `fixed inset-y-0 left-0` (out of flex flow)
    and `-translate-x-full` by default below `sm:`, with
    `sm:static sm:translate-x-0` restoring exactly today's in-flow,
    always-visible desktop layout. No changes needed to
    `app/layout.tsx` or `app/(staff)/layout.tsx` — the fixed positioning
    alone stops the squeeze on mobile.
  - **New `useState<boolean>` (`isOpen`, default `false`)** drives: a
    `sm:hidden` 44×44px fixed hamburger button (top-left) that opens the
    drawer; while open, a close ("×") button inside the sidebar's own
    header (next to the logo, `sm:hidden`) replaces it; a `sm:hidden`
    full-screen backdrop (`bg-black/60`) that closes the drawer on tap;
    and an `onClick={() => setIsOpen(false)}` on every nav `<Link>`
    (including the footer Sign-out form's link/button path) so tapping a
    destination closes the drawer. All of this state has zero visual
    effect at `sm:` and up (`sm:translate-x-0`/`sm:hidden` override it),
    matching the "regression not allowed" requirement.
  - **Touch targets**: nav item `<Link>` padding `py-2.5` → `py-3
    sm:py-2.5`; footer Sign-out/Log-in `py-1.5` → `py-2.5 sm:py-1.5` —
    mobile-only bump, resets to the exact prior desktop size at `sm:`.
  - **Role-gating untouched**: the
    `navItems.filter((item) => !("ownerOnly" in item && item.ownerOnly)
    || currentRole === "Owner")` line is unchanged — same items
    (Analytics/Staff/Logs stay Owner-only), same conditional, only the
    container it renders into changed.
  - **No other file touched**: `lib/nav.ts`, `app/layout.tsx`,
    `app/(staff)/layout.tsx`, and every other component (including the
    `ohm#68b329da` booking modals) untouched.
  - `npx tsc --noEmit` and `eslint` on `components/sidebar.tsx` both
    clean.
  - **Not verified live in-browser this session** — same recurring
    blocker as `ohm#68b329da`: another chat's dev server already running
    on `:3000`, Staff Login requires real credentials this session
    doesn't have. Verified via code review, `tsc`/`eslint`, and manual
    trace of the `fixed`-vs-`sm:static`/`translate-x`/`sm:translate-x-0`
    logic against both breakpoints. Requesting a live ~375px check per
    the prompt's own note once credentials or the port are available.
  - No dedicated `docs/state/*.md` file exists for sidebar/nav (absent
    from `.ai/current_state.md`'s routing index) — no state-file update
    made for this task, per the prompt's own fallback instruction.

- **Booking Flow — Mobile/Tablet Responsive Pass — complete** (`ohm#68b329da`,
  2026-08-30). Plan + regression risk assessment presented and approved
  before any code was written, per the prompt's mandatory gate. UI/layout
  only — no backend, DB, or business-logic changes.
  - **Scope**: `components/booking-form-modal.tsx` (New Booking) and
    `components/quick-walkin-modal.tsx` (Quick Walk-in). No dedicated
    Room/Therapist "selector" component exists — the grid-like UI in scope
    is the inline time-slot button grid inside each of these two files.
  - **Changes** (Tailwind `sm:` breakpoints only, no new component tree):
    modal card padding `p-6` → `p-4 sm:p-6`; the Service/Therapist,
    Discount Type/Value, and Amount/Payment two-column rows changed from
    fixed `grid-cols-2` to `grid-cols-1 sm:grid-cols-2` so fields stack on
    narrow phones; `quick-walkin-modal.tsx`'s fixed `grid-cols-4` time-slot
    grid changed to `grid-cols-3 sm:grid-cols-4` to match
    `booking-form-modal.tsx`'s existing responsive grid; time-slot
    buttons, the client-search suggestion rows, and add-on checkbox rows
    gained `min-h-[44px] sm:min-h-0` for touch-target sizing on mobile
    only; the bottom Cancel/Save action row became `sticky bottom-0
    sm:static` so primary actions stay reachable without scrolling to the
    bottom of the (especially long) Quick Walk-in form on mobile.
  - **Conflict-error visibility**: the existing red error `<p>` (rendered
    from the same `23P01`/`23505` parsing already done in
    `app/(staff)/bookings/actions.ts` — untouched) gained `text-sm
    sm:text-xs` (larger on mobile) plus a `ref` + `useEffect` that calls
    `scrollIntoView({block: "nearest"})` when `error` is set, so a
    double-booking conflict is immediately visible on a small viewport
    instead of requiring a manual scroll. No change to error text or
    parsing logic.
  - **Desktop unaffected**: every mobile-only class is paired with an
    `sm:` reset back to the exact pre-existing desktop classes (`sm:p-6`,
    `sm:grid-cols-2`, `sm:grid-cols-4`, `sm:min-h-0`, `sm:static`,
    `sm:text-xs`). No desktop class removed or altered.
  - **No DB/schema/migration touch**: `no_double_book_room`/
    `no_double_book_therapist` GiST exclusion constraints, `quick_walkin()`
    RPC, and `createBooking`/`quickWalkin` server actions untouched.
    Booking submission stays live/synchronous — no local queueing or
    offline behavior added.
  - **Out of scope confirmed untouched**: `components/booking-browser.tsx`
    (day-list table), `app/(staff)/bookings/actions.ts`, all Supabase
    files.
  - `npx tsc --noEmit` and `eslint` on both changed files clean (two
    pre-existing `staff` unused-prop warnings, unrelated to this change).
  - **Not verified live in-browser this session** — same recurring
    blocker as recent prior tasks: another chat's dev server is already
    running on `:3000` and the Staff Login page requires real credentials
    this session doesn't have. Verified via code review, `tsc`/`eslint`,
    and manual trace of every changed class against the Tailwind
    breakpoint semantics (mobile-first: unprefixed = below `sm`, `sm:` =
    ≥640px) rather than a live resize test. See [[bookings_state]].

- **Therapist Absent/Leave status → Dashboard reassignment trigger —
  complete** (`ohm#3f8q1w6z`, 2026-08-30). Plan + regression risk
  assessment presented and approved before any code/migration was
  written, per the prompt's mandatory gate.
  - **Mark Absent Today / Mark On Leave now persist.** Both kebab actions
    on `components/therapist-browser.tsx` (wired but local-state-only
    since `ohm#7k2m9x4p`) now call new server actions
    `markAbsentToday(therapistId, date, staffId)` /
    `markOnLeave(therapistId, startDate, endDate, reason, staffId)`
    (`app/(staff)/therapists/actions.ts`). Each upserts/inserts into
    `therapist_absence`/`therapist_leave` (unique-constraint conflict on
    `therapist_absence` ignored, so marking the same therapist absent
    twice for the same date is a no-op, not an error), then updates
    `bookings SET status = 'Needs Reassignment' WHERE therapist_id = …
    AND status = 'Booked'` scoped to that day (absence) or date range
    (leave). Logs one `action_logs` row each, revalidates `/therapists`
    and `/dashboard`.
  - **No schema/enum change for the flagging itself** — `Needs
    Reassignment` already existed as a `bookings.status` enum value and
    was already inside both `no_double_book_room`/
    `no_double_book_therapist` GiST exclusion constraints' scope
    (confirmed directly from the baseline migration before assuming, not
    guessed).
  - **Migration required and flagged before writing it**: `therapist_absence`/
    `therapist_leave` had RLS enabled with **no policies at all** since the
    baseline snapshot — same gap `therapist_day_off` had before
    `ohm#7k2m9x4p`, confirmed via `docs/state/therapists_state.md`'s RLS
    section before assuming. New
    `supabase/migrations/20260830024144_therapist_absence_leave_rls.sql`:
    `staff_select` (`is_staff()`) + `staff_insert`
    (`is_supervisor_or_above()`) on both tables, no UPDATE/DELETE (append-
    only for this phase — unmarking wasn't requested). Applying it via
    the Supabase MCP tool was blocked once by the session's auto-mode
    classifier (as expected for a live schema/RLS change); applied
    successfully after the user explicitly chose "apply it now via MCP"
    when asked. Confirmed via `get_advisors` afterward: the
    `rls_enabled_no_policy` findings for both tables are gone, no new
    issues introduced.
  - **`app/(staff)/therapists/page.tsx`** now also fetches
    `therapist_absence`/`therapist_leave` and seeds
    `TherapistBrowser`'s new `initialAbsence`/`initialLeave` props —
    previously the roster always loaded with "who's absent/on leave"
    reset to empty, since nothing was ever persisted or re-fetched.
  - **Dashboard** (`app/(staff)/dashboard/page.tsx`, previously 4 static
    stat cards only) now also fetches `bookings` where
    `status = 'Needs Reassignment'` (joined to therapist/service/client/
    room) and non-archived therapists, passed into a new
    `components/reassignment-panel.tsx` (`ReassignmentPanel`) rendering a
    "Needs Reassignment (N)" list with a **Transfer** action per row
    (therapist-select modal, excludes the current/archived therapist,
    reuses `changeBookingTherapist()` with the booking's unchanged
    `start_time` — no time-change UI here, narrower than the Bookings
    tab's own Change modal by design). No new RLS needed — the existing
    `bookings.staff_update` (`is_staff()`) policy already covers it, and
    the prompt's named roles (Owner/Supervisor/Receptionist) are exactly
    the three staff positions able to authenticate at all, so no
    additional role gate was needed.
  - **Real gap found and fixed in `changeBookingTherapist()`**: the
    function's UPDATE never wrote `status` back to `Booked` after
    reassigning a `Needs Reassignment` booking — so even the Bookings
    tab's own pre-existing `ohm#7k2m9xq4` "Reassign" button never
    actually resolved the flag, a latent bug since that feature shipped.
    Fixed by adding `status: 'Booked'` to the same UPDATE, conditionally,
    only when the booking's current status is `Needs Reassignment`. No
    new parameter; the `23P01` exclusion-violation handling and the GiST
    constraints themselves are untouched.
  - No changes to Points Ledger, Sales, or Locker Board — confirmed no
    code path here touches `point_transactions`, `sales`, or
    `locker_occupancy`.
  - `npx tsc --noEmit` and `eslint` both clean on every changed/new file.
    **Not verified live in-browser** this session — another chat's dev
    server was already running on `:3000` (this session's own preview
    attach failed with "Another next dev server is already running"),
    and navigating to it hit the Staff Auth login page with no test
    credentials available in this session — same blocker as several
    recent prior tasks; flagged, not bypassed. See
    [[therapists_state]], [[bookings_state]], [[dashboard_state]].

- **Therapist Roster — Copy Available-List to Clipboard — complete**
  (`ohm#9d4r7t2h`, 2026-08-30). Plan + regression risk assessment
  presented and approved before any code was written, per the prompt's
  mandatory gate. Added a copy-icon button next to "Show Archived" in
  `components/therapist-browser.tsx` and a `handleCopyAvailable`
  handler: filters the already-computed `cardRows` array for
  `slotStatus === "available"` (the same status the cards already
  render from, so no changes to filter/render logic), formats as
  `"{TIME} Available\n\n{Name}\n..."` via `navigator.clipboard.writeText`
  (time via the existing `fmtTime()` helper, already `8:00PM`-style, no
  space before AM/PM), confirms via the existing toast state/effect —
  no new toast component. Purely additive: no changes to `cardRows`
  computation, the filter dropdown, or any existing handler. **Not
  verified live in-browser** this session — no staff login credentials
  were available (another chat's dev server was already running on
  :3000, and the login page requires real staff credentials this
  session doesn't have); verified instead via code review and
  `npx tsc --noEmit` (clean, no errors in the changed file). See
  [[therapists_state]].

- **Therapist Roster — 3 bug fixes — complete** (`ohm#7k2m9x4p`,
  2026-08-30). Root cause + fix approach + regression risk presented and
  approved before any code was written, per the prompt's mandatory gate.
  - **Bug 1 — kebab menu "does nothing"**: code inspection initially
    showed the menu already fully wired (open/close state, all 4 items,
    modals) — flagged as a discrepancy before assuming the bug report was
    right. Live browser testing (logged in as Diego, Supervisor) then
    found the *actual* root cause, which code-reading alone missed: React's
    delegated click listener and the component's own
    `document.addEventListener("click", handleDocClick)` (click-outside-
    to-close) are both attached to `document` in this React/Next version.
    `e.stopPropagation()` on the kebab wrapper only blocks bubbling to
    *ancestor* nodes — it can't stop a sibling listener on the exact same
    node, so `handleDocClick` fired right after the button's own onClick
    opened the menu, closing it in the same tick, every time. Fixed by
    having `handleDocClick` explicitly ignore clicks whose target is
    inside a new `data-kebab-root` marker on the kebab wrapper, instead of
    relying on `stopPropagation()`. Verified live: menu opens, stays open,
    closes on outside click, and "Mark Absent Today" round-trips through
    its (intentionally local-only, per prompt scope) toast + state.
  - **Bug 2 — Weekly Day(s) Off doesn't persist**: root cause was that
    `components/therapist-browser.tsx` had zero Supabase calls anywhere —
    the whole component was local mock state seeded from
    `initialTherapists`/`initialBookings` props only. Deeper than the
    single toggle: `therapist_day_off` (and `therapist_leave`,
    `therapist_absence`, `therapist_services`) had `ENABLE ROW LEVEL
    SECURITY` from the baseline snapshot but **no policies at all**,
    ever — flagged to the user immediately as a required migration (the
    prompt said no migration was expected) before writing any app code.
    - **Migration** `supabase/migrations/20260830000000_therapist_day_off_rls.sql`
      (verified in a rolled-back transaction first, per the `pax_count`/
      3-tab-restructure precedent): adds `staff_select` (`is_staff()`),
      `staff_insert`/`staff_delete` (`is_supervisor_or_above()`) on
      `therapist_day_off` only — matches the identity-keyed pattern from
      `20260829150000_settings_catalog_rls.sql`. `therapist_leave`/
      `therapist_absence`/`therapist_services` deliberately left alone —
      out of scope (Mark On Leave/Archive stay local-only stubs per the
      prompt's explicit "do NOT build the reassignment logic here"
      instruction). Applied live after explicit user confirmation (the
      auto-mode classifier blocked applying it directly, as expected for
      a live schema change).
    - `app/(staff)/therapists/page.tsx` now fetches `therapists.id`
      (previously `name` only) and `therapist_day_off`, building a
      `therapist_id -> weekday[]` map passed to the component as a new
      `initialDayOff` prop.
    - New `app/(staff)/therapists/actions.ts` (`toggleDayOff`), same
      shape as `app/(staff)/settings/actions.ts`: insert-or-delete on
      `therapist_day_off` by `(therapist_id, weekday)`, one `action_logs`
      row per toggle, `revalidatePath("/therapists")`.
    - `TherapistBrowser` gained a `therapistIds` (name → real DB id) map
      alongside the existing name-keyed `therapistMeta`, rather than a
      full id-rekey of the whole component — kept the change scoped to
      the day-off path; Mark Absent/Leave/Archive/Edit/Add stay name-keyed
      and local-only, unchanged. Rename (Edit) now also moves the
      `therapistIds` entry alongside `therapistMeta`.
    - Verified live: toggled Dan's Tuesday off, confirmed the row landed
      in `therapist_day_off` via direct SQL, hard-reloaded the page, and
      confirmed the pill was still marked off after a fresh SSR fetch —
      then deleted the test row (plain join-table row, no audit-trail
      invariant against hard delete here, unlike bookings/sales).
  - **Bug 3 — date filter defaults stale**: `viewDate` was hardcoded to
    `"2026-08-26"` instead of using the already-defined-but-unused
    `todayISO()` helper. Fixing this surfaced a second, related bug in
    that helper itself: it used `new Date().toISOString().slice(0,10)`,
    which is a UTC date, not the device/local date the prompt asked for —
    caught live when the browser's local clock (PHT, UTC+8) read
    2026-08-30 just after midnight while `toISOString()` still returned
    2026-08-29 (UTC hadn't rolled over yet). Rewrote `todayISO()` to build
    the date string from `getFullYear()`/`getMonth()`/`getDate()`
    (local-time getters) instead. Verified live at the actual skew moment
    (00:23 local) that the date input now shows the correct local date.
  - `npx tsc --noEmit` and `eslint` both clean (pre-existing lint findings
    in this file — 2 unescaped-entity errors, 1 unused-var warning, all
    outside the touched code — confirmed unchanged via `git stash` diff,
    not introduced by this change). No changes to Locker Board, Call
    Sheet, or Sales. See [[therapists_state]].

- **Bookings Tab — 3-Tab Restructure — complete** (`ohm#7q2x9m4k`,
  2026-08-29). Restructures the Bookings tab from a single flat list +
  status pill into 3 tabs (Upcoming / Check-in / Check-out); tab
  membership is derived from existing `bookings.status` joined with
  `locker_occupancy` checkout state — no new booking status enum value.
  Plan + regression risk assessment presented and approved before any
  migration/code was written, per the prompt's mandatory gate.
  - **Migration** `supabase/migrations/20260829180000_locker_occupancy_booking_id.sql`:
    adds `locker_occupancy.booking_id uuid references bookings(id)` —
    nullable, no default, no backfill, no NOT NULL. GiST exclusion
    constraints (`no_double_book_room`/`no_double_book_therapist`) and
    `trg_bookings_set_computed_fields` confirmed untouched, both before
    and after applying (checked live). Also `create or replace function
    public.quick_walkin(...)` — signature unchanged, its
    `locker_occupancy` INSERT now also writes `booking_id` (from the
    already-in-scope `v_booking_id` local). Verified in a rolled-back
    transaction before applying live, per the `pax_count` precedent
    ([[bookings_state]]); applied live after verification passed.
  - **RLS**: no new policy. `locker_occupancy`'s existing
    `staff_select`/`staff_insert`/`staff_update` policies
    (`ohm#3f7n9c1k`) are unconditional `is_staff()` gates, not scoped to
    specific columns, so they already cover the new column — confirmed
    by reading the policy definitions before skipping the "add RLS"
    step the prompt called out as conditional.
  - **`app/(staff)/bookings/actions.ts`**: `logVisitBooking()`'s
    `locker_occupancy` insert (the linked-booking branch) now also
    writes `booking_id: input.bookingId` — that field is guaranteed
    non-null in that branch (the no-linked-booking case delegates to
    `quickWalkin()` earlier in the function and returns before reaching
    this insert). No other behavior change to either write path.
  - **`components/booking-browser.tsx`**: rewritten around 3 tabs
    (`upcoming` / `checkin` / `checkout` state) with per-tab counts in
    the tab bar. Day-view query now embeds
    `locker_occupancy(checked_in_at, checked_out_at, locker_number)` via
    the new FK. Tab membership: Upcoming = status in
    (Booked, Needs Reassignment, No-show); Check-in = status Completed
    AND `checked_out_at IS NULL`; Check-out = status Completed AND
    `checked_out_at IS NOT NULL` — computed client-side per render, not
    stored. Rows rendered as a table with per-tab columns per the spec
    (Upcoming: Massage Time/Client/Service/Room/Therapist/Action;
    Check-in adds Check-in Time/Locker #; Check-out adds Check-out
    Time). Date column and per-row status pill removed (redundant with
    the existing date picker and tab membership respectively). Action
    buttons (Log Visit/No-show/Cancel/Change/Reassign) unchanged in
    behavior, now render only in the Upcoming tab. Wet Area rows
    continue to render "—" for Room/Therapist via the pre-existing
    `renderRoomPill`/`therapistName` null-coalescing — no change needed
    there since `locker_occupancy` rows are confirmed to still exist for
    Wet Area check-ins/outs.
  - **Sort**: spa-day-aware (4 PM open through 1 AM last call), reusing
    `compareSlotTimes()` from `lib/bookings/slots.ts` rather than
    reimplementing — that function's `toMinutesSinceOpen()` already
    treats times before 16:00 as the tail end of the same operating day,
    which is exactly the ordering rule asked for.
    `lib/analytics/spa-day.ts` was evaluated first per the prompt's
    instruction to reuse a shared helper if extractable, but it only
    provides day-*bucketing* (which calendar date a timestamp belongs
    to), not an intra-day sort key — not a fit, so it was left
    untouched and `compareSlotTimes()` used instead.
  - **Regression check — done, not assumed**: `app/(staff)/lockers/page.tsx`
    and `app/(staff)/call-sheet/page.tsx` (Locker Board, Call Sheet) both
    read `locker_occupancy` via explicit column selects and their own
    independent `checked_out_at IS NULL` filter — neither references
    `booking_id`, so both are unaffected by the additive column. No test
    suite exists in this repo to check against (grepped for
    `*.test.*`/`*.spec.*`, none found).
  - **Types**: `lib/types/database.ts` regenerated from the live schema
    after the migration. In the process, restored nullable annotations
    on `quick_walkin`'s RPC `Args` (`p_client_id`, `p_guest_label`,
    `p_manual_discount_type`, `p_manual_discount_value`, `p_payment_ref`,
    `p_promo_id`, `p_room_number`, `p_therapist_id`) that a fresh
    codegen pass emits as non-nullable even though the function body
    accepts (and call sites pass) `null` for guest/Wet-Area/no-promo
    cases — a pre-existing generator quirk, not something this change
    introduced; caught via `tsc --noEmit` before it could ship broken.
  - **Verified**: `npx tsc --noEmit` and `eslint` both clean. Live
    browser verification of the tabbed UI was **not completed** — Staff
    Auth (6C) gates every route behind a real Supabase Auth session and
    no test staff credentials were available in this session; flagged
    rather than bypassed. Recommend a manual pass in the browser before
    relying on this in production.

- **Bookings: Change modal extension — complete** (`ohm#8p4t2vk6`,
  2026-08-29). Extends the existing Change Therapist feature into a
  general "Change" action: renames button and modal title to "Change",
  adds a `Start Time` input (pre-filled from booking's current time),
  excludes the current therapist from the picker, and adds live therapist
  availability greying that re-checks on every time change (debounced
  300 ms, client-side Supabase query + `slotsOverlap()`).
  - **No schema change / no migration** — `trg_bookings_set_computed_fields`
    fires on `BEFORE INSERT OR UPDATE`, so writing `start_time` in the
    UPDATE payload recomputes `start_ts`/`end_ts` automatically. The
    existing `no_double_book_therapist` GiST constraint then enforces on
    the new time window. Confirmed from migration before writing code.
  - **Files changed**:
    - `app/(staff)/bookings/actions.ts` — `changeBookingTherapist()` gains
      a fourth param `newStartTime: string`; UPDATE payload now writes both
      `therapist_id` and `start_time`; activity log detail is conditional
      (`old_therapist → new_therapist` / `old_time → new_time` / both),
      logged only for changed fields. No-op guard now covers both fields.
    - `components/booking-browser.tsx` — "Change Therapist" button →
      "Change"; modal title "Change Therapist" → "Change"; `reassignStartTime`
      + `availabilityMap` + `availabilityLoading` state added; live
      availability `useEffect` (debounced, with `cancelled` flag to prevent
      stale state); therapist picker excludes current therapist; disabled
      options labelled "— Unavailable"; time input in modal resets
      therapist selection on change.
  - **Room availability**: explicitly NOT checked — only therapist
    conflicts matter here, as specified. Room reassignment on time change
    is out of scope.
  - **Verified**: `npx tsc --noEmit` and `eslint` both clean.

- **Bookings: Change Therapist action — complete** (`ohm#7k2m9xq4`,
  2026-08-29). Adds a "Change Therapist" action on an existing booking,
  reassigning `therapist_id` only — room/locker untouched. Plan +
  regression risk assessment presented and approved before any code was
  written, per the prompt's mandatory gate; a follow-up scoping question
  (whether `No-show` bookings should be included, since the day-view
  fetch excluded them entirely before this change) was also asked and
  approved before implementing.
  - **No schema change** — confirmed before writing any code, not assumed:
    `no_double_book_therapist`/`no_double_book_room` are standard Postgres
    `EXCLUDE USING gist` constraints (`supabase/migrations/20260827130641_baseline_snapshot.sql`),
    which Postgres enforces on both INSERT and UPDATE inherently (same
    mechanism as a unique constraint) — unlike the Points Ledger's
    trigger-based immutability. No migration needed or written.
  - **Scope**: action available whenever `status` is `Booked`,
    `No-show`, or `Needs Reassignment` (i.e. not `Completed`/`Cancelled`).
    `components/booking-browser.tsx`'s `ACTIVE_STATUSES` day-view fetch
    filter — which previously excluded `No-show` (and `Cancelled`)
    entirely from the list — now also includes `No-show`, per the user's
    explicit choice when asked; this is a small additive UI-behavior
    change (No-show bookings now visibly appear in the day list, which
    they did not before).
  - **`app/(staff)/bookings/actions.ts`**: new `changeBookingTherapist(bookingId, newTherapistId, staffId)`
    server action. Re-fetches the booking, rejects `Completed`/`Cancelled`
    (defense-in-depth — the UI already won't offer the action there) and
    a no-op reassignment to the same therapist, then does a plain
    `UPDATE bookings SET therapist_id = ...` (room/locker columns not
    touched). Parses Postgres `23P01` (exclusion violation) into the same
    "that therapist is already booked" message used elsewhere in this
    file. On success, writes one `action_logs` row (`action:
    "change_therapist"`, `detail` encoding booking id/date/time and
    old→new therapist name — matches the existing plain-text convention
    documented in [[logs_state]], no enum to extend). Revalidates
    `/bookings`, `/dashboard`, `/call-sheet`.
  - **`components/booking-browser.tsx`**: new "Change Therapist" button on
    `Booked`/`No-show` rows; the pre-existing but previously-unwired
    `Reassign` button stub on `Needs Reassignment` rows (no `onClick`
    before this change) is now wired to the same flow rather than adding
    a second competing control. Confirmation is a small inline modal
    (styled to match `components/confirm-dialog.tsx`) with a therapist
    `<select>` pre-filled to the current therapist and an inline error
    slot for the conflict message. Staff attribution uses the existing
    `useStaffSim().sessionStaff` (real authenticated staff), same pattern
    as `created_by`/`processed_by` elsewhere — no placeholder actor.
  - **Points Ledger / Sales — confirmed untouched**: no code path in this
    change writes to `point_transactions` or `sales`.
  - **No-show / GiST scoping nuance flagged, not silently patched**: the
    exclusion constraints' `WHERE` clause only covers status
    `Booked`/`Completed`/`Needs Reassignment` — a `No-show` row falls
    outside that predicate, so a therapist swap on a `No-show` booking is
    not conflict-checked by the DB. This matches the constraints'
    existing designed scope (a no-show has no real time-slot conflict to
    guard against) — not treated as a gap, just noted so it isn't a
    surprise later.
  - Verified live in the browser, not just typechecked: clicked "Change
    Therapist" on a `Booked` row, reassigned Akio → Dan, confirmed the row
    updated immediately and an `action_logs` row appeared on `/logs`
    (`change_therapist`, correct old/new therapist names, timestamp, and
    real staff attribution). `npx tsc --noEmit` and `eslint` both clean.
    See [[bookings_state]].
- **Client Portal 7A-3: Registration/Login Revision — Password Auth —
  complete** (`ohm#9r3w7t5b`, 2026-08-29). Reworks the already-shipped
  7A-2 registration/login flow: replaces PIN-based auth with password-
  based auth and makes `username` user-chosen at registration (was
  system-generated in 7A-2). Plan + regression risk assessment presented
  and approved before any migration/code was written, per the prompt's
  mandatory gate.
  - **Discrepancy caught before planning, not assumed**: `clients.username`
    and `clients.password_hash` already exist in the live schema — but
    they pre-date the entire Client Portal feature (baseline snapshot,
    migration `01`, always `NULL`/auto-generated), are unrelated to
    `client_portal_accounts`, and were left untouched. Flagged to the user
    so there's no confusion between that legacy field and the new
    `client_portal_accounts.password_hash` this prompt adds.
  - **Migration** `20260829123017_client_portal_password_auth.sql`: on
    `client_portal_accounts` — deleted the single 7A-2 test row (Test
    Client 7A2 / `NXS-XKUCU4`, confirmed with the user first, exact row
    listed before deletion), dropped the plain `unique(username)`
    constraint and `pin_hash` column, added `password_hash text not null`,
    added `create unique index ... on (lower(username))` for case-
    insensitive uniqueness — citext was checked and confirmed unused
    anywhere in this schema, so a functional index was used instead per
    the prompt's own instruction. Down-migration included (data loss on
    rollback is called out in the file's comment, matching this repo's DB
    change safety rules). The linked `clients` row "Test Client 7A2"
    itself was left untouched — only the credential row was removed.
  - **`lib/portal/pin.ts` → `lib/portal/password.ts`**: renamed, not
    duplicated — same `scrypt` implementation, functions renamed
    `hashPassword`/`verifyPassword`, `MIN_PASSWORD_LENGTH = 6` added
    (length-only, no complexity rules, per the prompt's "walk-in spa
    clientele" guidance). `lib/portal/codes.ts`'s now-unused
    `generatePortalUsername` removed (username is user-chosen, no longer
    system-generated).
  - **New `lib/portal/username.ts`**: format validation
    (`/^[a-zA-Z0-9_.-]{3,20}$/`) and a case-insensitive-safe
    `isUsernameTaken` check (LIKE-wildcard characters `%`/`_`/`\` in the
    input are escaped before the `ilike` query, so a literal underscore in
    someone's username can't accidentally match other rows). New
    `app/portal/api/check-username` route backs both the register page's
    debounced live-availability check and the server-side authoritative
    check on submit.
  - **Registration** (`app/portal/register/page.tsx` +
    `app/portal/api/register/route.ts`): fields are now Name, Username,
    Phone Number, Password. Username collisions get a specific inline
    field error (safe to disclose). **Deliberate behavior change from
    7A-2, required by this prompt's own wording** ("do not leak whether a
    phone number already has an account"): the existing
    `client_portal_accounts.phone` collision path used to return
    `"This phone number is already registered. Please log in instead."`
    — itself a leak. Replaced with a generic, non-distinguishing error.
    The `clients.phone` match-vs-create linking logic (preserves
    points/history on match) is byte-for-byte unchanged — only the
    surrounding fields and this one response message changed.
  - **Login** (`app/portal/login/page.tsx` +
    `app/portal/api/login/route.ts`): single "Username or Phone Number"
    identifier field + Password. Backend regex-detects phone-shaped input
    (`/^\d{7,15}$/`) vs. username and looks up accordingly, same
    `verifyPassword` compare either path.
  - **`lib/portal/session.ts`**: confirmed unaffected (only signs/verifies
    `portalAccountId`, no PIN/password reference anywhere in it) — not
    touched, per the prompt's own "only touch if it actually breaks"
    instruction.
  - **Explicitly out of scope, no scaffolding added**: SMS OTP, Forgot
    Password — clean cut, deferred to a future phase.
  - **Verified live in the browser, not just typechecked**: registered a
    new account end-to-end with a user-chosen username
    (`regtest_7a3` / phone `09991234567`), confirmed the debounced
    username-availability check fires and clears correctly, logged out
    (cleared the portal session cookie) and logged back in successfully
    both by username and by phone number with the same password, and
    confirmed `/dashboard` still requires the existing staff session and
    renders the full Sidebar/nav unaffected by any of this. `npx tsc
    --noEmit` and `eslint` both clean (one `react-hooks/set-state-in-
    effect` finding on the register page's debounce effect was fixed
    inline, not left as debt). One test artifact left live, matching this
    repo's established precedent (`ohm#4m8x1v6q`) of documenting rather
    than SQL-deleting harmless test data: client_portal_accounts row
    `regtest_7a3` / phone `09991234567`, linked to a new `clients` row
    "Regression Test 7A3".

- **Settings 7B-3: Service/Promo Soft-Delete — verified already complete,
  no changes made** (`ohm#1d5r6nz4`, 2026-08-29). Prompt asked to convert
  service/promo deletes from hard to soft delete, filter them out of active
  selectors, keep them visible in historical views, and confirm no
  `ON DELETE CASCADE` FK risk. Read-only investigation (per the prompt's
  approval gate, plan was presented before any migration/code was written)
  found every requirement already satisfied by `ohm#5x1p8m3v`/Staff Auth
  6C-4: `deleteService`/`deletePromo` in
  `app/(staff)/settings/actions.ts` already do `update({ active: false })`,
  not a hard delete; every dropdown source (`app/(staff)/bookings/page.tsx`,
  `app/(staff)/clients/page.tsx`, `app/(staff)/settings/page.tsx`) already
  filters `.eq("active", true)`; `app/(staff)/sales/page.tsx` and
  `app/(staff)/analytics/page.tsx` already join `services(name)`/
  `promos(label)` by FK, so a soft-deleted row still displays its name in
  history. Checked every FK from `sales`/`bookings`/`point_transactions` to
  `services`/`promos` in `supabase/migrations/20260827130641_baseline_snapshot.sql`
  — none are `ON DELETE CASCADE` (default RESTRICT); the only `CASCADE` on
  `services` is on the unrelated `therapist_services` join table, which is
  correct as-is. No migration, no code change, no state-doc rewrite needed
  — this entry exists so a future prompt doesn't re-investigate the same
  question from scratch.

- **Settings 7B-2: Confirm Dialogs + Global Theme Fix — complete**
  (`ohm#4k9p2xq7` + `ohm#7t3m8vw1`, 2026-08-29). Two prompts implemented
  together since both touch `components/settings-browser.tsx`. Plan +
  regression risk assessment presented and approved before any code was
  written, per both prompts' mandatory gates.
  - **Confirm dialogs** (`ohm#4k9p2xq7`): investigation found Add flows
    across Settings/Staff/Therapist Roster already use a proper form-modal
    with Cancel/Confirm (no change needed, per the prompt's own carve-out
    for "simple form submit" flows), and neither Staff nor Therapist
    Roster has a delete UI at all (add-only, confirmed by repo-wide grep
    for `window.confirm`/`handleDelete*`) — so the only real gap was
    Settings' 4 delete flows (Service/Promo/Weekend Slot/Add-on) using the
    unstyled native `window.confirm()`. New `components/confirm-dialog.tsx`
    — a reusable `ConfirmDialog` matching the existing form-modal's
    border/surface/gold-accent styling — replaces all 4 call sites in
    `components/settings-browser.tsx` (`handleDeleteService`,
    `handleDeletePromo`, `handleDeleteSlot`, `handleDeleteAddon`), each
    showing the item name in the confirmation message. The add-on
    "at least one must remain" guard stays a plain `alert()` — it blocks
    an invalid action, it isn't confirming a valid one.
  - **Light mode propagation fix** (`ohm#7t3m8vw1`): root cause traced in
    code, not guessed — `isLightMode` state and the `document.body`
    class-toggle lived entirely inside `SettingsBrowser`, which unmounts on
    navigation; its `useEffect` cleanup unconditionally ran
    `document.body.classList.remove("light")` on unmount, stripping light
    mode the instant you left the Settings tab regardless of the saved
    preference. The `body.light` CSS itself (`app/globals.css`) was already
    global — this was purely a state-lifetime bug. Fix: new
    `lib/theme-context.tsx` (`ThemeProvider`/`useTheme()`) owns
    `isLightMode`, reads/writes `localStorage("theme")`, and toggles
    `.light` on `document.body` with no unmount cleanup; `app/layout.tsx`
    wraps `{children}` in `ThemeProvider` (above both the `(staff)` and
    `/portal` route groups); `SettingsBrowser` now consumes `useTheme()`
    instead of local state. Persistence stays localStorage-only, unchanged
    from the already-confirmed "no DB needed, per-device preference"
    decision.
  - **Verified live in the browser, not just typechecked**: toggled light
    mode on Settings, navigated to Dashboard and Sales — theme stayed
    light on both (previously would have reverted to dark); full page
    reload preserved the light preference via `localStorage`; toggled back
    to dark to leave the app in its default state. Confirm-dialog flow
    tested live (Delete → styled dialog appears with correct item name →
    Cancel closes without deleting). No console errors observed.
    `npx tsc --noEmit` clean. One pre-existing `react-hooks/set-state-in-
    effect` ESLint finding in the moved-into `lib/theme-context.tsx` code
    (reading `localStorage` inside a `useEffect`) — confirmed via
    `git stash` that this exact violation already existed in the original
    `settings-browser.tsx` before this change, so left as-is rather than
    fixed as out-of-scope debt.

- **Client Portal 7A-2: Master QR & Registration Flow — complete**
  (`ohm#4m8x1v6q`, 2026-08-29). First client-facing surface of the Client
  Portal domain, on top of 7A-1's schema. Plan + regression risk
  assessment presented and approved before any code was written, per the
  prompt's mandatory gate.
  - **7A-1's "completed and merged" claim did not check out on first
    read**, and this was flagged before any implementation instead of
    assumed: no migration in `supabase/migrations/`, no commit in
    `git log --all`, no `docs/state/client_portal_state.md` file, and the
    only place describing the schema (ADR-001's "Client Portal (new)"
    section) was an uncommitted working-tree edit with an unfilled
    `[DATE]` changelog placeholder. Surfaced to the user via
    `AskUserQuestion` rather than proceeding on trust; the user then
    applied the real 7A-1 migration live during the same session — the
    prerequisite was verified via `list_migrations`/`list_tables`
    (`client_portal_accounts` live, `clients_phone_key` unique constraint
    present, migration `client_portal_phone_and_accounts` in the applied
    list) before writing any 7A-2 code.
  - **Route-group refactor**, approved as a separate follow-up question
    once discovered mid-plan (not in the original plan text): the true
    HTML root `app/layout.tsx` unconditionally wrapped every route in the
    staff `Sidebar`/`StaffSimProvider`/staff-session lookup, which a
    nested `app/portal/*` layout can't remove — a portal visitor would
    have inherited the staff nav and triggered a needless staff-table
    query. Fixed by moving all 13 existing route folders (`analytics`,
    `bookings`, `call-sheet`, `clients`, `dashboard`, `lockers`, `login`,
    `logs`, `sales`, `settings`, `staff`, `therapists`, root `page.tsx`)
    into `app/(staff)/` with a new `app/(staff)/layout.tsx` carrying the
    exact same Sidebar/session logic that used to live in the root layout
    — mechanical, URLs unchanged since parenthesized route groups don't
    affect routing. `app/layout.tsx` slimmed to bare `html`/`body` +
    fonts. Every `@/app/<route>/actions` import in `components/*.tsx`
    (9 files: `log-visit-modal`, `quick-walkin-modal`,
    `booking-form-modal`, `locker-board`, `staff-browser`,
    `sales-browser`, `sidebar`, `booking-browser`, `settings-browser`)
    updated to `@/app/(staff)/<route>/actions`.
  - **`proxy.ts`**: one early-return added, excluding `/portal` and
    `/portal/*` from the staff-session gate before the existing staff
    logic runs. No change to the staff redirect/matcher logic itself.
  - **New `/portal/*` surface**: `app/portal/layout.tsx` (minimal, no
    staff imports), `app/portal/register/page.tsx` and
    `app/portal/login/page.tsx` (client components posting JSON),
    `app/portal/api/register/route.ts` and
    `app/portal/api/login/route.ts` (server-only Route Handlers).
    Registration matches on `clients.phone`: match links the new portal
    account to the existing `client_id` (points/history untouched, only
    read); no match inserts a new `clients` row (`codename` = submitted
    Name) plus a linked `client_portal_accounts` row. **Why service-role,
    not the anon-key client the rest of the app uses**: `clients` INSERT
    already requires `is_staff()` (from Staff Auth 6C-2) and
    `client_portal_accounts` is RLS default-deny (from 7A-1, deliberately
    — no consumer existed yet) — an anonymous portal visitor cannot
    write through the anon-key/RLS path at all, so `lib/portal/
    service-client.ts` uses `SUPABASE_SERVICE_ROLE_KEY` (present in
    `.env.local`, unused elsewhere in the repo until now), confined to
    exactly two Route Handlers, never imported by a Client Component.
    This is a deliberate, narrow exception to the "anon key only" pattern
    documented in `.ai/briefing.md`, not a general precedent.
  - **PIN hashing**: `lib/portal/pin.ts`, Node's built-in `crypto.scrypt`
    with a random salt + `timingSafeEqual` compare — no new dependency.
  - **Portal session**: `lib/portal/session.ts`, an HMAC-SHA256-signed
    cookie (`nxs_portal_session`, `httpOnly`, `path=/portal`, signed with
    `SUPABASE_SERVICE_ROLE_KEY` as HMAC key since no dedicated session
    secret exists in the env yet) — entirely separate cookie and
    verification path from Supabase Auth's `sb-*` staff session cookies,
    satisfying the prompt's "no shared session" requirement.
  - **System-generated username**: `lib/portal/codes.ts` generates the
    portal account's `NXS-XXXXXX` username (shown on confirmation, never
    editable, never encoded in the QR, distinct from the pre-existing
    `clients.username` column which this flow also has to populate since
    it's `NOT NULL` with no default — filled with an unrelated opaque
    `client_xxxxxxxxxx` value, since that column predates the portal and
    isn't used by anything in this flow) and the new client's
    `member_code` (also `NOT NULL`, no default, no existing generation
    convention anywhere in the app to reuse — this is the first code path
    that ever inserts a `clients` row from application code). Both retry
    up to 5 times on a `23505` unique-violation.
  - **Confirmation screen** (`app/portal/confirmation/page.tsx`): a server
    component reading the verified session cookie server-side and
    re-querying the account/client fresh, rather than trusting URL query
    params from the register/login pages — avoids a spoofable confirmation
    screen for near-zero extra cost.
  - **Master QR**: `app/(staff)/settings/master-qr/page.tsx`, staff-gated
    (inherits the existing `is_staff()`-equivalent route protection via
    `proxy.ts` + the `(staff)` layout), linked from a new small header
    link on the existing Settings page. Renders via the new `qrcode`
    dependency (`npm install qrcode` + `@types/qrcode`), encoding
    `${protocol}://${host}/portal/register` built from the live request's
    `host` header rather than a new env var — correct in every deploy
    target without extra config.
  - **Verified live in the browser, not just typechecked**: registration
    end-to-end created a real `clients` + `client_portal_accounts` row
    (`Test Client 7A2`, phone `09171234567`, username `NXS-XKUCU4`,
    confirmed via SQL) and landed on the confirmation screen; logging out
    and back in with the same phone/PIN round-tripped to the same account
    and same confirmation screen; `/dashboard` and other staff routes
    still required the pre-existing staff session and rendered the full
    Sidebar with correct Owner-only nav, unaffected by the route-group
    move; Master QR page rendered a real QR correctly encoding the
    registration URL. `npx tsc --noEmit` and `eslint` both clean
    throughout (one nullability regression surfaced while regenerating
    Supabase types wholesale — `quick_walkin`'s RPC `Args` lost their
    original `| null` annotations in the fresh generation, unrelated to
    this prompt's schema — caught by the resulting type errors and fixed
    by reverting to the committed `lib/types/database.ts` and adding only
    the two new tables (`client_portal_accounts`, `app_settings`)
    surgically, leaving every other type, including `quick_walkin`'s,
    exactly as committed).
  - **Test artifact left in place**, matching this repo's established
    precedent (documented repeatedly in prior 6C entries) of leaving
    harmless test data rather than deleting it via SQL mid-task: client
    "Test Client 7A2" (phone `09171234567`), linked portal account
    `NXS-XKUCU4`.
  - **Explicitly out of scope, per the prompt** (tracked for follow-up
    prompts): Member QR generation/display, `log_visit` RPC lookup
    integration for reception check-in, phone masking/reveal UI, points
    balance/visit history/promos views, RLS policy design for
    `client_portal_accounts` (still default-deny — every read in this
    prompt's Route Handlers goes through the service-role client, not
    RLS).
  - See [[client_portal_state]] for the updated state.

- **Client Portal 7A-1: Schema Foundation — complete** (`ohm#7a1f9c2k`,
  2026-08-29). Database layer only, first prompt of the new Client Portal
  domain — no UI, no routes, no client-facing pages. Plan + regression risk
  assessment presented and approved before any migration was written, per
  the prompt's mandatory gate.
  - **Context loaded first**: `.ai/briefing.md`, `.ai/current_state.md`,
    `docs/state/settings_state.md`, `docs/state/logs_state.md` (the prompt
    named `activity_logs_state.md`, which doesn't exist — flagged and used
    the real file), ADR-001's "Client Identity (amended)" and "Client
    Portal (new)" sections, plus a live schema read
    (`information_schema.columns`, `pg_constraint`) rather than trusting
    the prompt's description of what already exists.
  - **Three real discrepancies caught by reading the live schema, not
    assumed from the prompt, all flagged and confirmed with the user before
    implementing**: (1) `clients.phone` already exists (nullable `text`,
    no default) — the prompt described it as a new column; live check
    showed 1 client row, phone null, no duplicates, so the actual change
    needed was adding a `UNIQUE` constraint to the existing column, not
    adding the column itself. (2) No generic `settings` table exists
    anywhere in the schema — "Settings persistence" in this codebase means
    direct writes to each catalog table (services/promos/addons/
    weekend_slots/lockers/rooms; confirmed via `settings_state.md` and
    `20260828011724_settings_persistence_rls.sql`), so there was nothing
    structural to "reuse" for a standalone boolean flag — created a new
    minimal singleton table (`app_settings`) instead, carrying over only
    the RLS/actor-attribution *conventions*. (3) `action_logs.action` is
    plain `text`, not an enum — "add new event type `phone_number_revealed`"
    has no DB-level schema change to make; it's a convention (a string
    value future writers use), not a migration.
  - **Migration 1**
    (`supabase/migrations/20260829170000_client_portal_phone_and_accounts.sql`):
    `clients_phone_key` UNIQUE constraint added to the existing
    `clients.phone` column (no backfill needed/attempted — column already
    empty). New table `client_portal_accounts` (`id`, `client_id` FK →
    `clients`, `phone` unique, `pin_hash`, `username` unique, `created_at`)
    — RLS enabled with zero policies (default-deny for every role until a
    later prompt designs the real policy matrix; same pattern already used
    by `therapist_absence`/`therapist_day_off`/etc., confirmed via
    `get_advisors` showing the expected "RLS enabled, no policy" info-level
    note and nothing else new). Also relabels `clients.codename`'s display
    label via `COMMENT ON COLUMN` only ("Name", not "Codename") — the
    column name itself is unchanged (single free-text identity field, no
    legal-name column, per ADR-001's Client Identity amendment). **No
    `.tsx`/`.ts` file was touched for the relabel** — grepped every
    `codename` reference repo-wide first; all 20+ hits are UI components
    (`client-browser.tsx`, `booking-form-modal.tsx`, etc.) or the
    schema-generated `lib/types/database.ts`, both explicitly out of scope
    per the prompt's regression-risk callout (Locker Board, Call Sheet,
    client search, receipts) — deferred to the named follow-up prompt.
  - **Migration 2**
    (`supabase/migrations/20260829170100_app_settings_manual_points_flag.sql`):
    new `app_settings` singleton table
    (`id boolean primary key default true` +
    `allow_receptionist_manual_points boolean not null default false`,
    `check (id)` enforces single-row), seeded with its one row by the
    migration itself. RLS: `app_settings_select` (`is_staff()`),
    `app_settings_update` (`is_owner()` on both `USING`/`WITH CHECK`,
    matching "Owner-editable only" — Supervisor/Owner both already bypass
    the flag's downstream gate per ADR-001, so only Owner needs write
    access to the flag itself). No INSERT/DELETE policy — singleton,
    seeded once.
  - Both migrations applied live via `apply_migration` (the session's
    auto-mode classifier blocked the first direct-apply attempt on this
    production project; user explicitly approved re-attempting via the
    same MCP tool before it was applied). Verified afterward: constraint
    (`pg_constraint`), both new tables' contents/policies
    (`pg_policies`), and `get_advisors` (security) read back — only the
    expected `client_portal_accounts` "RLS enabled, no policy" info note
    is new; every other advisory item pre-dates this change.
  - **Explicitly out of scope, confirmed untouched**: Master QR
    generation, registration UI, login UI, `log_visit` RPC changes, phone
    masking/reveal UI — all deferred to later Client Portal prompts per
    the prompt's own scope section.
  - **Regression risk confirmed clean**: Points Ledger, Bookings, and
    existing `clients` reads are unaffected — no migration touches
    `point_transactions`, its triggers, `bookings`, or any existing SELECT
    path (`app/clients/page.tsx` doesn't select `phone`); no UPDATE policy
    exists or was added on `clients`, so nothing new can write to it yet.
    `client_portal_accounts` and `app_settings` are both brand-new tables
    with zero existing code references — zero blast radius on any
    existing feature.
  - See [[client_portal_state]] (new), [[settings_state]], [[logs_state]]
    for the updated detail.

- **Cleanup: 6C-6 regression test artifacts removed from live DB — complete**
  (`ohm#2c6h9x4d`, 2026-08-29). Data-only, no code/schema/RLS changes.
  Deleted the booking, sale, staff row, and weekend slot left behind by
  6C-6's regression pass, plus two related test rows (a walk-in booking
  and a locker_occupancy row) found FK-linked to the test sale but not
  named in the original prompt — approved before deletion. One
  discrepancy caught and correctly *not* acted on: a real, unlabeled sale
  (the actual ₱700→₱725 Diego edit) was almost conflated with the "6C-6
  Walkin Test" sale by the cleanup prompt's description — verified live
  and left untouched. **Staff Auth phase (6A–6C-6) is now fully closed
  out with no lingering test data in the live DB.** No commit needed —
  data-only change, no files modified other than this handoff and
  `.ai/briefing.md`.

- **Staff Auth — complete (6A through 6C-6, `ohm#8r5m1v7z`, 2026-08-29).**
  This closes the entire Staff Auth phase and the originally-scoped
  6-phase roadmap in full. See `docs/state/staff_state.md` for the final
  per-table RLS policy matrix and `docs/architecture/rbac.md` for the RBAC
  reference (rewritten from "Design Target" to "Implemented" in 6C-6).
  - **6C-6 — Remove Simulate Staff + Full-System Regression Pass — complete**
    as of 2026-08-29 (`ohm#8r5m1v7z`). Final sub-step. Repo-wide search for
    every Simulate Staff reference (12 code files) presented and approved
    before any removal, per the prompt's mandatory gate.
    - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`
      (confirmed 6C-1 through 6C-5 all complete), `docs/state/staff_state.md`,
      ADR-001 read in full (not section-scoped, per the prompt's explicit
      instruction for this closing step), `lib/staff-context.tsx`, and every
      component still referencing Simulate Staff.
    - **Removal**: `lib/staff-context.tsx` simplified —
      `loginableStaff`/`selectedStaffId`/`setSelectedStaffId`/
      `simulatedStaff`/`FALLBACK_STAFF`/the `nxs_sim_staff_id` localStorage
      key are all gone; `currentStaff`/`currentRole`/`sessionStaff` derive
      solely from the real session (nullable only pre-auth on `/login`,
      since every other route is guaranteed one by `proxy.ts`).
      `components/settings-browser.tsx`'s dropdown block deleted entirely;
      its 15 `selectedStaffId` call sites now resolve from a local
      `sessionStaff?.id ?? ""` derived const (kept the same downstream
      variable name to avoid touching 15 call sites individually).
      `app/layout.tsx`'s full active-staff-list fetch (only ever used to
      feed the dropdown) removed — only the single-row `sessionStaff`
      lookup remains. `components/{locker-board,sales-browser,
      staff-browser}.tsx` switched from `selectedStaffId` to
      `sessionStaff?.id ?? ""`. `{log-visit,booking-form,
      quick-walkin}-modal.tsx` dropped the `?? staff[0]` fallback (now
      `actor = sessionStaff`, already rendered null-safely as `"—"`) — the
      now-unused `staff` prop on those three modals was deliberately left
      in place rather than threading its removal through
      `client-browser.tsx`/`booking-browser.tsx`, since that's unrelated
      generic plumbing, not Simulate Staff machinery.
    - **One discrepancy caught live in the browser during regression
      testing, not by the initial repo-wide grep**:
      `components/analytics-browser.tsx`'s Owner-only blocking message had
      "Simulate Staff" split across two JSX lines
      (`&rarr; Simulate\n        Staff`), which a single-line grep pattern
      missed. Caught when visiting `/analytics` as Front Desk during the
      regression pass, fixed immediately, then verified clean via a
      multi-line-safe repo-wide grep (`grep -z`) confirming zero remaining
      "simulat*" hits anywhere in `.ts`/`.tsx`. Stale copy also fixed in
      `logs-browser.tsx`/`staff-browser.tsx` (same "Switch to Owner in
      Settings → Simulate Staff" pattern) to plain "Sign in with an Owner
      account" language.
    - `npx tsc --noEmit` passes clean throughout (one real type fix along
      the way: `components/sidebar.tsx` referenced `currentStaff.name`
      inside a `sessionStaff`-truthy branch that TS couldn't narrow across
      two separate context fields — switched to `sessionStaff.name`
      directly and dropped the now-unused `currentStaff` destructure).
    - **Full-system regression pass, exhaustive per the prompt's explicit
      "not sampling, be exhaustive" rule** — real login/logout cycles (no
      Simulate Staff, since it no longer exists) as all three real roles,
      every phase exercised:
      - **Ana (Front Desk)**: nav correctly hides Staff/Logs/Analytics; all
        three routes correctly DB-blocked with the updated copy; Log Visit
        (Wet Area earn case) succeeded live — 216→219 pts, correct "Ana ·
        Receptionist" actor; New Booking succeeded ("6C-6 Regression
        Test", 5:30 PM, Room 1); Quick Walk-in succeeded ("6C-6 Walkin
        Test", Wet Area, ₱700, locker 5); Sales Edit/Void buttons
        correctly disabled ("Supervisor or Owner only"/"Owner only");
        Locker Board check-out succeeded (locker 5 freed); Call Sheet
        loaded correctly (3 active massages); Settings correctly
        read-only with the dropdown gone.
      - **Diego (Supervisor)**: everything Ana can do, plus a real Sales
        Edit succeeded live (₱700→₱725, "Edited by You", running total
        updated to ₱7,875) and a real Settings edit succeeded live (Add
        Weekend Slot, "2:15 PM" added) — both correctly attributed to
        Diego at the DB level; Sales Void still correctly disabled; Staff
        Directory/Activity Logs/Analytics still correctly Owner-only.
      - **J. Cruz (Owner)**: everything above, plus Sales Void button
        correctly enabled; a real Add Staff succeeded live ("6C-6
        Regression Staff added as Receptionist"); Analytics loaded with
        correct live figures; Activity Logs correctly showed every
        regression action from all three roles' real sessions with
        correct attribution (`Ana`/`quick_walkin` ×2 +
        `locker_checkout`, `Diego`/`sale_edit` +
        `settings_add_weekend_slot`, `J. Cruz`/`staff_add`) — direct
        end-to-end proof the session-derived actor path works across the
        whole app, not just per-component.
      - Three real sign-out → sign-in cycles between roles, all clean, no
        Simulate Staff involved. No console or server errors observed at
        any point across the entire pass.
    - **Harmless test artifacts intentionally left in place** (no delete
      UI/policy for any of these, same precedent as every prior 6C
      sub-step): booking "6C-6 Regression Test", sale "6C-6 Walkin Test"
      (₱700), staff row "6C-6 Regression Staff", weekend slot "2:15 PM".
    - **Final doc pass**: ADR-001 invariant #6 rewritten from "deferred,
      RLS not identity-keyed" to reflect completion (full file was read,
      not section-scoped, per the prompt's explicit instruction).
      `docs/architecture/rbac.md` rewritten in full from "Design Target
      (Not Yet Enforced)" to "Implemented". Every `docs/state/*.md` file
      still describing Simulate Staff as present/functional, or carrying
      "app-level-only role gate"/"known gap"/deferred-auth language,
      updated to reflect real RLS + real session attribution:
      `staff_state.md`, `logs_state.md`, `sales_state.md`,
      `settings_state.md`, `clients_state.md`, `analytics_state.md`.
    - **No RLS policy changes** — none needed, per explicit scope;
      nothing surfaced by regression testing warranted one.
    - See [[staff_state]] for the final state.
  - **6C-5 — Staff Directory + Activity Logs RLS — complete** as of
    2026-08-29 (`ohm#4t8w2j6q`). Fifth and final table-level RLS-lockdown
    sub-step. Policy matrix, including the `staff` SELECT-scope question,
    presented and approved before any SQL was written, per the prompt's
    mandatory gate.
    - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`
      (confirmed 6C-2 through 6C-4 complete), `docs/state/staff_state.md`,
      `docs/state/logs_state.md`, ADR-001, plus a live read of current RLS
      on `staff`/`action_logs` (`pg_policies`) and the live role-helper
      function definitions (`is_staff()`, `is_owner()`,
      `current_staff_position()`), confirming `current_staff_position()`
      is `SECURITY DEFINER` and reads `staff` directly — so tightening
      `staff`'s own SELECT policy can't break the helper functions every
      other table's RLS depends on.
      - **One real discrepancy caught by tracing usage directly in code,
        not assumed from the prompt's "already Owner-gated in the UI"
        framing**: the prompt asked whether `staff` SELECT should be
        restricted to Supervisor+ at the DB level, matching the Staff
        Directory *page*'s Owner-only nav gate. Grepping every
        `.from("staff")` call site showed `app/layout.tsx` queries `staff`
        on *every* page load for *every* role — both the full active-staff
        list (feeds the Simulate Staff dropdown) and the `sessionStaff`
        lookup (`user_id → staff` row) that drives actor attribution
        app-wide — before any role check runs. `staff` is also read
        broadly in `clients`/`bookings`/`sales`/`logs` pages for name/role
        display ("Logged by: Ana"). Restricting SELECT below `is_staff()`
        would have broken session resolution itself for Front Desk on
        nearly every route, not just blocked the Staff Directory page.
      - **Decision confirmed with the user, not assumed**: `staff` SELECT
        stays `is_staff()` (broad, any of the 8 loginable staff) — the
        Staff Directory page's Owner-only visibility remains app-level UI
        gating only, unchanged, separate from the base table read.
      - **No new role helpers** — reused 6C-2's `is_staff()`, `is_owner()`
        as-is.
      - **Policy matrix**: `staff` — SELECT = `is_staff()`, INSERT =
        `is_owner()` (matches Owner-gated Add Staff modal); no UPDATE (no
        staff-editing UI exists, confirmed add-only per the earlier
        decision in `ohm#3z8k1p6d` — also means `user_id`, the
        auth-linkage column set only via `service_role` in 6A, can never
        be altered through app RLS); no DELETE (no delete UI exists).
        `action_logs` — SELECT = `is_owner()` (matches Owner-gated
        Activity Logs page); INSERT = `is_staff()` (written from nearly
        every mutating flow across the app — Log Visit, Bookings, Sales
        edit/void, Settings, Staff add — by any logged-in staff member);
        no UPDATE, no DELETE (audit trail stays append-only/immutable,
        matching the points-ledger immutability pattern).
      - **Migration**
        (`supabase/migrations/20260829160000_staff_action_logs_rls.sql`),
        smoke-tested via a rolled-back transaction simulating
        `auth.uid()`/`request.jwt.claims` as anon, Ana (Front Desk), Diego
        (Supervisor), and J. Cruz (Owner) — per the prompt's explicit
        "widest blast radius" flag on this sub-step, exercised real
        domain writes as each role rather than only synthetic
        `action_logs` inserts: a real `log_visit()` RPC call as Ana, a
        real booking insert + `action_logs` write as Diego, a real sales
        `UPDATE` (edit) + `action_logs` write as Diego. Confirmed anon
        blocked entirely on both tables (0 rows SELECT, INSERT rejected);
        Ana and Diego can SELECT/INSERT `staff` and INSERT `action_logs`
        but correctly see 0 rows on `action_logs` SELECT and are blocked
        from `staff` INSERT; Owner succeeds on `staff` SELECT/INSERT and
        `action_logs` SELECT/INSERT. **One false-positive caught by
        checking row counts, not just absence of an exception**: an Owner
        UPDATE/DELETE against `action_logs` raised no error, which first
        read as a bypass — a `GET DIAGNOSTICS ... = ROW_COUNT` check
        showed 0 rows affected in both cases, confirming it was a silent
        no-op (no matching policy) rather than a real permission grant;
        `action_logs` is correctly immutable even for Owner. All of the
        above verified before applying live via `apply_migration`. Live
        policies (`pg_policies`) read back afterward and confirmed to
        match exactly.
      - **Regression-tested end-to-end via real logins, not Simulate
        Staff, per the prompt's explicit requirement**: logged in as Ana
        (Front Desk) — Owner-only nav (Analytics/Staff/Logs) correctly
        absent, `/staff` and `/logs` both correctly blocked by the
        existing app-level Owner-only guard, a real Log Visit (Wet Area
        service) succeeded end-to-end through the actual modal with
        correct actor attribution ("Ana · Receptionist"), points balance
        moved 213→216 live. Logged in as Diego (Supervisor) — same
        nav/route gating as Ana, a real New Booking succeeded through the
        actual modal (`created_by` confirmed via SQL to be Diego's staff
        id, actor label showed "Diego · Supervisor"), a real Sales Edit
        succeeded through the actual modal ("Edited by You" shown,
        ₱700→₱750, Sales Log total updated live). Logged in as J. Cruz
        (Owner) — Analytics/Staff/Logs nav correctly present, the Activity
        Logs page correctly showed entries from all three roles' own
        regression actions above (Diego's sale_edit, Ana's Wet Area visit,
        etc. — proving `action_logs` SELECT genuinely returns real rows
        for Owner, not an empty/broken query), Staff Directory page loaded
        the full roster, and a real Add Staff succeeded end-to-end through
        the actual modal ("RLS Test Staff added as Attendant"). `npx tsc
        --noEmit` passes clean, no server or console errors observed at
        any tier throughout.
      - **One harmless test artifact intentionally left in place**,
        matching the "no delete policy/UI for `staff`" invariant: an
        Attendant record named "RLS Test Staff" (added 2026-08-29) from
        the live browser regression test — inert, directory-only, not
        removable through the app (same precedent as 6C-3's kept test
        booking and 6C-2's kept test ledger entry).
      - **Simulate Staff still fully functional in the UI** — same
        6C-2/6C-3/6C-4 pattern: neutralized at the DB level, not removed
        from the UI itself; that's now the sole remaining item, 6C-6.
      - **6C is now complete for all five planned table-level RLS
        sub-steps — only 6C-6 (removing Simulate Staff) remains.**
      - See [[staff_state]], [[logs_state]] for the updated RLS detail.
  - **6C-4 — Settings/Catalog RLS (services, promos, addons, rooms, lockers,
    weekend_slots) — complete** as of 2026-08-29 (`ohm#9d2k6y4p`). Fourth of
    six planned 6C sub-steps. Policy matrix presented and approved before
    any SQL was written, per the prompt's mandatory gate. Closes the
    "app-level-only role gate" explicitly accepted when Settings
    persistence shipped (`ohm#5x1p8m3v`).
    - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`
      (confirmed 6C-2/6C-3 complete, noted exact helper function names/
      signatures), `docs/state/settings_state.md` (the "app-level-only role
      gate, known gap" note this sub-step resolves), ADR-001, plus a live
      read of current RLS on all six tables (`pg_policies`), a live FK scan
      confirming `weekend_slots` has zero FK references (real DELETE stays
      correct) while `services`/`promos`/`addons`/`rooms`/`lockers` remain
      FK-referenced (soft-delete/deactivate stays correct), and a direct
      read of `components/settings-browser.tsx` rather than trusting the
      prompt's "already locked for Front Desk in the UI" framing.
      - **One real discrepancy caught by reading the component directly,
        not assumed from the prompt**: only Services and Promos actually
        had a UI role lock (`canEditServices`/`canEditPromos`) before this
        sub-step — Add-ons, Weekend Slots, Lockers, and Rooms/Beds had no
        UI lock at all, so any role (including Front Desk) could click
        Add/Delete/edit those four sections pre-6C-4. Flagged to the user
        before implementing, since applying RLS alone would leave Front
        Desk seeing enabled controls that then fail server-side (a hard
        INSERT error for Add-style actions, a silent 0-row no-op for the
        room-count UPDATE).
      - **Decision confirmed with the user, not assumed**: add matching UI
        locks to the four previously-unlocked sections alongside the RLS
        migration, rather than shipping RLS-only and leaving the UX rough
        edge. New shared `canEditCatalog` flag (same `Supervisor`/`Owner`
        check, same disabled-button/tooltip pattern as the existing two)
        added to `components/settings-browser.tsx`, gating Add-ons' price
        input, Weekend Slots' add/delete, Lockers' add-batch button, and
        the Rooms/Beds count input.
      - **No new role helpers** — reused 6C-2's `is_staff()`,
        `is_supervisor_or_above()` as-is.
      - **Policy matrix, all six tables**: SELECT = `is_staff()`;
        INSERT/UPDATE = `is_supervisor_or_above()` (no distinction beyond
        that blanket rule anywhere); no DELETE policy except
        `weekend_slots` (`staff_delete`, `is_supervisor_or_above()`, real
        hard DELETE). `lockers` has no UPDATE policy (add-only, never
        updated by any existing action). `services`/`promos`/`addons`/
        `rooms` have no DELETE policy (soft-delete/deactivate via UPDATE
        stays the only removal path, confirmed still correct via the live
        FK scan).
      - **Migration**
        (`supabase/migrations/20260829150000_settings_catalog_rls.sql`),
        smoke-tested via a rolled-back transaction simulating
        `auth.uid()`/`request.jwt.claims` as anon, Ana (Front Desk), Diego
        (Supervisor), and J. Cruz (Owner) — 18 checks across all six
        tables and every INSERT/UPDATE/DELETE path — confirmed anon and
        Ana correctly blocked everywhere while retaining SELECT (`is_staff`
        still lets Ana see the full catalog), Diego succeeds on every
        table (services/promos/addons/rooms/lockers insert, weekend_slots
        insert+delete, rooms update), Owner succeeds (rooms update,
        weekend_slots insert+delete) — before applying live via
        `apply_migration`. Live policies (`pg_policies`) read back
        afterward and confirmed to match exactly.
      - **Regression-tested end-to-end via real logins, not Simulate
        Staff, per the prompt's explicit requirement**: `npx tsc --noEmit`
        passes clean. Logged in as Ana (Front Desk) — Settings correctly
        showed the new read-only notice and disabled controls on all four
        newly-gated sections (confirmed via DOM inspection that every
        numeric input, including the addon price and room-count fields,
        carries `disabled: true`), in addition to the pre-existing
        Services/Promos lock, all with `is_staff()`-gated SELECT still
        showing her the full catalog. Logged in as Diego (Supervisor) — all
        six sections showed enabled controls; a live Add Weekend Slot
        succeeded end-to-end through the real UI ("1:37 PM added to
        weekend slots", confirmed inserted via SQL) — proving the DB-level
        policy actually permits a real Supervisor session end-to-end, not
        just the smoke test. Delete's `window.confirm()` was auto-dismissed
        by this browser tool (same known limitation documented since the
        Operations Phase, `ohm#9h4c7x2m`) so the test slot (`13:37`) was
        removed directly via SQL instead of through the UI click-through —
        not treated as unverified, since the identical DELETE path was
        already proven in the rolled-back transaction smoke test. No
        server or console errors at any tier.
      - **Simulate Staff still fully functional in the UI** — same
        6C-2/6C-3 pattern: neutralized at the DB level (a Front Desk
        session using Simulate Staff to "view as Owner" gets real Owner UI
        affordances but not real Owner DB access), not removed from the UI
        itself; that's still 6C-6.
      - See [[settings_state]] for the updated RLS + UI-gating detail.
  - **6C-3 — Bookings + Locker Occupancy RLS — complete** as of 2026-08-29
    (`ohm#3f7n9c1k`). Third of six planned 6C sub-steps. Policy matrix and
    the status-transition role-restriction question were presented and
    approved before any SQL was written, per the prompt's mandatory gate.
    - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`
      (confirmed 6C-2 complete, noted exact helper function names/
      signatures), `docs/state/bookings_state.md`,
      `docs/state/operations_state.md`, ADR-001 (no-double-booking
      invariant, locker/room assignment timing), plus a live read of
      current RLS on `bookings`/`locker_occupancy` and the actual bodies
      of `log_visit()`/`quick_walkin()` — confirmed `bookings` had only
      `public_select`/`public_insert` (no UPDATE policy at all — default-
      deny) and `locker_occupancy` had `public_select`/`public_insert`/
      `public_update` from the Operations phase, before writing any
      policy.
      - **One real discrepancy caught by reading the live RLS state, not
        assumed**: `bookings` had zero UPDATE policy, meaning
        `updateBookingStatus()` (the No-show/Cancel buttons wired in the
        Bookings correction phase) was silently affecting 0 rows under
        RLS this whole time — this migration is what makes status
        transitions actually work end-to-end for the first time, not
        merely re-gate an existing path.
      - **Decision confirmed with the user, not assumed**: all staff (any
        tier) may perform every operation on `bookings`/`locker_occupancy`,
        including Cancel — no Supervisor/Owner restriction, unlike Sales
        Void (which stays Owner-only per 6C-2, confirmed as a `sales`-only
        rule).
      - **No new role helpers** — reused 6C-2's `is_staff()`,
        `is_supervisor_or_above()`, `is_owner()`, `current_staff_position()`
        as-is.
      - **`bookings`**: `staff_select`/`staff_insert`/`staff_update` all
        `is_staff()`-gated, replacing `public_select`/`public_insert`. No
        DELETE policy — bookings are never hard-deleted.
      - **`locker_occupancy`**: `staff_select`/`staff_insert`/
        `staff_update` all `is_staff()`-gated, replacing the prior
        `public_*` policies. No DELETE policy.
      - **Migration**
        (`supabase/migrations/20260829140000_bookings_locker_occupancy_rls.sql`),
        smoke-tested via a rolled-back transaction simulating `auth.uid()`
        as anon, Ana (Front Desk), Diego (Supervisor), and J. Cruz (Owner)
        — confirmed anon sees/inserts nothing on either table, Ana can
        select/insert/cancel a booking, the GiST exclusion constraints
        (`no_double_book_room`/`no_double_book_therapist`) still correctly
        blocked a conflicting insert under the new policies (`23P01`
        raised as expected), and Diego can check a locker in and out —
        before applying live via `apply_migration`. Live policies
        (`pg_policies`) read back afterward and confirmed to match
        exactly.
      - **Regression-tested end-to-end via real logins, not Simulate
        Staff, per the prompt's explicit requirement**: logged in as
        Ana (Receptionist) — New Booking succeeded with correct actor
        attribution ("Ana · Receptionist"), Cancel on that same booking
        succeeded (confirmed live via SQL: status flipped to `Cancelled`
        with `created_by` = Ana's staff id — previously would have
        silently no-op'd), Locker Board Check-out succeeded (100→99 free).
        Logged in as Diego (Supervisor) — Call Sheet loaded correctly (3
        active massages), Locker Board check-in/check-out cycle succeeded.
        `quick_walkin()` RPC verified end-to-end for Diego via a
        rolled-back-transaction substitution (booking + sale +
        locker_occupancy all inserted successfully) after hitting the
        same pre-existing Browser-pane limitation documented in 6C-2
        (native `<select>` changes don't propagate to this app's React
        state, so the Confirm button stayed disabled via the UI path) —
        not treated as unverified, per the established 6C-2 precedent;
        this is an unrelated tooling gap, not an RLS regression. Logged in
        as J. Cruz (Owner) — Locker Board Check-out succeeded, Owner-only
        nav (Analytics/Staff/Logs) correctly present, Bookings page loaded
        with no console errors. No server or console errors at any tier.
      - **One harmless test artifact intentionally left in place**,
        matching the "bookings are never hard-deleted" invariant: a
        `Cancelled` booking (`guest_label = "RLS Smoke TestRLS Smoke
        Test"`, created 2026-08-29) from the live browser regression test
        — inert, excluded from active-status lists, not deleted (no
        DELETE policy/precedent for that, matching 6C-2's kept test ledger
        entry).
      - **Simulate Staff still fully functional in the UI** — same 6C-2
        pattern: neutralized at the DB level (a Front Desk session using
        Simulate Staff to "view as Owner" gets real Owner UI affordances
        but not real Owner DB access), not removed from the UI itself;
        that's still 6C-6.
      - See [[bookings_state]], [[operations_state]] for the updated RLS
        detail.
  - **6A — Auth Users + Basic Login — complete** as of 2026-08-29. Plan
    (the 8-account email/password list) presented and approved before any
    credentials were created, per the prompt's mandatory approval gate.
    Scope was explicitly limited: no RLS changes, no actor-attribution
    changes, no protected routes — those are 6B/6C.
    - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`,
      `docs/state/staff_state.md`, ADR-001 (Staff Auth deferred
      status/RBAC section), plus a live read of the `staff` table —
      confirmed all 8 target names present and matching exactly (Ana,
      Ben, Cathy, Jeff, Essem, Diego, Elena, J. Cruz), Mika (Attendant)
      correctly not in scope.
    - **One real discrepancy surfaced and resolved with the user, not
      guessed past**: the prompt's locked decision #5 stated
      `SUPABASE_SERVICE_ROLE_KEY` was already in `.env.local` and
      gitignored. A direct read of the file showed only
      `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` — no
      service key present at all. Blocked and asked the user for it
      directly rather than proceeding without it or fabricating one.
      The first key the user pasted was decoded (JWT payload, not
      trusted at face value) and turned out to reference project ref
      `rwxeluluyapjgaarlwkus` ("ohmployee") — a different Supabase
      project than this repo's `zqwiqrvqyinacjozubtc` — caught and
      flagged before it was ever used against any API. The user then
      supplied the correct key, decoded and confirmed to match
      `zqwiqrvqyinacjozubtc` before use.
    - **8 `auth.users` created** via a one-off local Node script
      (`@supabase/supabase-js` service-role admin client,
      `auth.admin.createUser({ email, password, email_confirm: true })`)
      — written to `scripts/_seed-staff-auth.mjs`, run once, then deleted
      immediately after (not committed, not left in the tree). Emails:
      `<firstname>@nxs.local` pattern (`ana@`, `ben@`, `cathy@`, `jeff@`,
      `essem@`, `diego@`, `elena@`, and `jcruz@` for J. Cruz — confirmed
      with the user during the approval gate since "firstname" doesn't
      map cleanly for a two-part name). Passwords per the three locked
      tiers: `nxsrecep26` (Receptionist), `nxs.supervisor26` (Supervisor),
      `nxs.owner26` (Owner).
    - **Linked to `staff.user_id`**: each returned `auth.users.id` was
      written into the matching existing `staff` row via direct SQL
      (`update staff set user_id = '<uuid>' where id = '<staff-id>'`) —
      used the existing nullable column exactly as locked, no migration
      file needed or written. Verified live afterward: all 8 target rows
      show the correct `user_id`, Mika's stayed `null`.
    - **Login page** (`app/login/page.tsx`, `app/login/actions.ts`, both
      new): plain email/password `<form>` posting to a `login()` Server
      Action that calls `supabase.auth.signInWithPassword()` through the
      existing `lib/supabase/server.ts` SSR client — session cookies are
      handled entirely by `@supabase/ssr`'s own cookie adapter (already
      wired in that file), so **no custom JWT/session-table code was
      written** — this matches both the Next.js auth guide's own guidance
      (use your auth provider's built-in session handling rather than
      hand-rolling one) and the fact that Supabase is already this app's
      only backend. Redirects to `/dashboard` on success; shows an inline
      "Invalid email or password." on failure (no raw Postgres/Auth error
      leaked to the UI). Visiting `/login` while already signed in shows
      "Signed in as [email]" plus a Sign Out button
      (`logout()` Server Action → `supabase.auth.signOut()` →
      redirect to `/login`) — this is the full extent of "session
      handling" for 6A: no logout button was added anywhere else in the
      app (e.g. Sidebar/Settings) to keep the footprint minimal and avoid
      touching the Simulate Staff area at all.
    - **Nothing else in the app was touched, by design**: the login page
      is not yet linked to `lib/staff-context.tsx`, `lib/nav.ts`,
      `components/sidebar.tsx`, or any RLS policy. `useStaffSim`'s
      Simulate Staff dropdown remains the only thing driving role-based
      UI anywhere in the app — logging in via `/login` currently has zero
      effect on the rest of the app. This is intentional 6A scope, not an
      oversight: wiring the real session into `staff-context`/role
      gating and adding actor-attribution is explicitly 6B's job, and
      protecting routes so unauthenticated visitors can't reach them is
      explicitly 6C's job.
    - Verified live in the browser (`npx tsc --noEmit` passes clean, but
      not relied on alone): logged in as Ana (Receptionist tier),
      confirmed redirect to `/dashboard`; navigated to `/login` again and
      confirmed the session persisted ("Signed in as ana@nxs.local");
      clicked Sign Out and confirmed return to the empty login form;
      logged in as Diego (Supervisor tier) successfully; submitted a
      wrong password and confirmed the inline error message (not a raw
      exception). Regression-checked Settings — Simulate Staff dropdown
      still fully functional, role switching and edit-gating unchanged —
      confirming the two mechanisms are fully independent, per the
      explicit "Simulate Staff keeps working normally" requirement. No
      server or console errors (`preview_logs` checked clean).
    - See [[staff_state]] for the updated auth-linkage detail.
  - **6B — Real Session Wiring into staff-context + Actor Attribution —
    complete** (`ohm#4p7v9k3s`) as of 2026-08-29. Scope explicitly
    excluded protected-route middleware and RLS lockdown (still 6C) and
    kept Simulate Staff fully functional as the logged-out fallback.
    - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`,
      `docs/state/staff_state.md` (confirmed 6A's final state — 8 auth
      users, inert login page, `staff.user_id` linkage), ADR-001's Staff
      Auth section, `lib/staff-context.tsx`, `app/login/actions.ts`, and
      a repo-wide grep enumerating every
      `// TEMP: placeholder actor pending Staff Auth phase` site (7 hits)
      before writing any code.
    - **Two product decisions surfaced and confirmed with the user before
      implementing, per the prompt's mandatory approval gate**: (1)
      not-logged-in fallback — Simulate Staff keeps driving role/actor
      exactly as before, for anyone without a session (recommended and
      confirmed, since 6A's "pages stay accessible without login" and
      "Simulate Staff stays functional until 6C" both depend on it); (2)
      the three modals with their own local, staff-context-disconnected
      "Logged by" dropdown (`log-visit-modal.tsx`, `booking-form-modal.tsx`,
      `quick-walkin-modal.tsx`, discovered during the enumeration, not
      called out by the prompt) — confirmed to auto-fill from the real
      session when present while keeping the dropdown as an editable
      override, rather than removing the override entirely.
    - **`lib/staff-context.tsx`**: `StaffSimProvider` gained an optional
      `sessionStaff` prop. `currentStaff`/`currentRole` prefer it over the
      Simulate Staff selection when present; `selectedStaffId` resolves to
      `sessionStaff.id` in that case so every existing consumer keeps
      working unchanged. Simulate Staff's internal state/localStorage
      persistence is untouched — it's simply not read for
      `currentStaff`/`currentRole` while a session exists.
    - **`app/layout.tsx`**: resolves `auth.uid()` (via
      `supabase.auth.getUser()`) → matching `staff` row by `user_id` →
      passed down as `sessionStaff`. No new RLS needed — `staff`'s
      existing `public_select` policy has no `to` clause so it already
      covers `authenticated`, confirmed by reading the migration before
      assuming it.
    - **Two distinct call-site patterns found during enumeration, handled
      differently**: most `action_logs` attribution (Settings, Sales,
      Lockers, Staff Directory) already sourced `staffId` from
      `staff-context`'s `selectedStaffId` — fixing the context alone fixed
      these, no per-file change beyond deleting the stale TEMP comment.
      The 3 modals above needed an actual code change (their local
      `staffId` `useState` now initializes from
      `useStaffSim().sessionStaff?.id` first).
    - **Settings UI**: the "Signed in" account card (previously always
      mirroring Simulate Staff, mislabeled) now reflects the real session
      when present; the Simulate Staff `<select>` is `disabled` with an
      inline "Disabled while signed in" note in that case.
    - **All 7 TEMP comments removed** — the actor value is now genuinely
      session-derived when logged in, Simulate-Staff-derived when not.
    - Verified live in the browser (`npx tsc --noEmit` passes clean, not
      relied on alone): logged out — Settings showed "Simulated" state
      and an enabled Simulate Staff dropdown, byte-for-byte the same as
      pre-6B; logged in as Ana (Receptionist) — Settings showed
      "Ana / Receptionist · Front Desk / Signed in", Simulate Staff
      disabled, Front-Desk-correct read-only Settings sections, sidebar
      correctly hiding Staff/Logs (Owner-only nav, driven by the same
      `currentRole`); Log Visit modal's "Logged by" `<select>` correctly
      auto-selected Ana instead of the prior first-staff-member default;
      signed out again and confirmed the app reverted cleanly to
      Simulate Staff mode. No server or console errors.
    - See [[staff_state]] for the updated attribution detail.
  - **6B-Addendum — Logout Button + Fully Automatic Actor (Remove Staff
    Dropdowns from Modals) — complete** (`ohm#6y1d4h8m`) as of 2026-08-29.
    Precursor to 6C, not 6C itself — no RLS changes, no protected routes.
    - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`,
      `docs/state/staff_state.md`, `lib/staff-context.tsx`, plus a
      repo-wide search for every staff-select dropdown before writing any
      code, per the prompt's mandatory approval gate.
    - **Enumeration confirmed exactly the 3 modals already found in
      6B** — `log-visit-modal.tsx`, `booking-form-modal.tsx`,
      `quick-walkin-modal.tsx` — no others exist. Checked and ruled
      out: `staff-browser.tsx`'s Add Staff modal `<select>` is the
      **Position** field, not an actor picker; `settings-browser.tsx`'s
      `<select>` is the Simulate Staff control itself, explicitly out of
      scope ("no removal of Simulate Staff itself"). Enumeration + logout
      placement presented and approved before implementation.
    - **Actor dropdowns removed** from all 3 modals: each local `staffId`
      `useState` (6B had seeded it from `sessionStaff?.id ?? staff[0]?.id`
      but left it editable) is now a plain derived value —
      `const actor = sessionStaff ?? staff[0]; const staffId = actor?.id ?? ""`
      — with the `<select>` replaced by a read-only `<div>` showing
      `{actor.name} · {actor.position}`. Deliberately kept the exact same
      value/fallback logic 6B established rather than switching to
      `selectedStaffId`/Simulate-Staff-context — only the editability was
      removed, per "preserve existing architecture, this is a UI
      simplification not a new identity system."
    - **Logout button**: `components/sidebar.tsx` gained a persistent
      account block at the bottom of the sidebar, below the nav list —
      reads `sessionStaff`/`currentStaff`/`currentRole` from
      `useStaffSim()` (no new context fields needed). Session present:
      shows `{currentStaff.name} · {currentRole}` plus a "Sign out"
      button wired to the existing `logout()` server action from
      `app/login/actions.ts` (reused as-is via a `<form action={logout}>`,
      matching the pattern already used on `/login`). No session: shows a
      "Log in" link to `/login`.
    - Verified live in the browser (`npx tsc --noEmit` passes clean, not
      relied on alone): logged out — sidebar showed "Log in", all three
      modals showed the read-only label sourced from the Simulate Staff
      selection, no dropdown; logged in as Ana (Receptionist) — sidebar
      showed "Ana · Front Desk" with a working Sign Out button, Log
      Visit / New Booking / Quick Walk-in modals all showed the
      read-only "Ana · Receptionist" label with no editable control;
      signed out again and confirmed a clean revert to the Simulate
      Staff–driven state (Owner nav restored, dropdown re-enabled in
      Settings). No server or console errors.
    - See [[staff_state]] for the updated modal-attribution detail.
  - **6C — six planned sub-steps (6C-1 through 6C-6), tracked explicitly
    so the plan doesn't get lost across sessions:**
    - **6C-2 — Role Helper Functions + Core Loop RLS (clients,
      point_transactions, sales) — complete** as of 2026-08-29
      (`ohm#5m8t2x6b`). First real RLS lockdown step (6C-1 was routes
      only). Helper-function shape/naming, the full policy-per-table-per-
      operation matrix, and the Sales edit-vs-void granularity decision
      were all presented and approved before any SQL was written, per the
      prompt's mandatory gate.
      - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`
        (confirmed 6C-1 complete), `docs/state/staff_state.md`,
        `docs/state/clients_state.md`, `docs/state/points_ledger_state.md`,
        `docs/state/sales_state.md`, ADR-001, `docs/architecture/rbac.md`
        (role enum reconciliation — five `staff_position` values, not the
        prompt's simplified three-tier framing), plus a live read of
        current RLS policies on all four tables, `staff.user_id`/`position`
        shape, and — not assumed from the docs — the actual bodies of
        `log_visit()`/`quick_walkin()`.
      - **One real discrepancy caught by reading the live function bodies,
        not assumed**: both `log_visit()` and `quick_walkin()` are
        `SECURITY INVOKER`, not `DEFINER` — they run as the calling
        session's role, so the new INSERT policies had to actually permit
        an authenticated staff caller directly, not just gate the app
        layer. Confirmed the new `is_staff()`-gated INSERT policies still
        let these functions work end-to-end.
      - **Granularity decision confirmed with the user, not guessed**: a
        single RLS UPDATE policy can't diff NEW against OLD, so "Owner-only
        void" needed either (A) a single Supervisor+ policy with void
        staying app-gated only, or (B) that same policy plus a
        `BEFORE UPDATE` trigger blocking non-Owner void flips. User picked
        (B) for real DB-level enforcement, matching the "highest-risk
        migration so far" framing.
      - **New role helpers** (foundational, reused as-is by 6C-3 through
        6C-5): `current_staff_position()` — `SECURITY DEFINER`, resolves
        `auth.uid() → staff.user_id → staff.position`, returns null with no
        session rather than erroring (decoupled from `staff`'s own RLS so
        future tightening there can't break every other table's role
        check); `is_staff()`, `is_supervisor_or_above()`, `is_owner()` —
        plain wrappers, not `DEFINER`.
      - **`clients`**: `staff_select`/`staff_insert` (both `is_staff()`)
        replace the old `public_select`-only policy. Confirmed no UPDATE
        policy is needed — no client field has an editable path anywhere in
        the app (`points_balance` stays ledger-trigger-only via the
        existing `SECURITY DEFINER apply_points_delta()`). No DELETE
        policy.
      - **`point_transactions`**: `staff_select`/`staff_insert` (both
        `is_staff()`) replace `public_select`/`public_insert`. No
        UPDATE/DELETE policy — unchanged, `trg_block_ledger_update`/
        `trg_block_ledger_delete` remain the sole enforcement.
      - **`sales`**: `staff_select`/`staff_insert` now `is_staff()`-gated
        (was `USING(true)`/`WITH CHECK(true)`). `staff_update` now requires
        `is_supervisor_or_above()` as the baseline floor (was
        `USING(true)`). New `block_void_by_non_owner()` trigger
        (`trg_block_void_by_non_owner`, `BEFORE UPDATE`) additionally
        raises an exception if `voided` changes and the caller isn't
        `is_owner()` — layered on top of the RLS floor, giving the
        Owner-only void rule real DB-level teeth for the first time. No
        DELETE policy — sales are never hard-deleted.
      - **Migration**
        (`supabase/migrations/20260829000000_role_helpers_and_core_loop_rls.sql`),
        smoke-tested via a rolled-back transaction — ran the full DDL, then
        simulated `auth.uid()`/`request.jwt.claim.sub` as `anon`, Ana
        (Front Desk), Diego (Supervisor), and J. Cruz (Owner) in sequence
        within one transaction (using a temp log table + `GRANT` to work
        around this session's `execute_sql` tool aborting on the first
        unhandled error, and row-count checks rather than exception-
        catching for UPDATE since RLS silently filters rows rather than
        raising) — confirmed anon sees/inserts nothing on all three
        tables, Ana sees clients/sales but her sales UPDATE affects 0 rows,
        `log_visit()` still succeeds for her, Diego's sales edit succeeds
        but his void attempt is blocked by the trigger, Owner's void
        succeeds — before applying live via `apply_migration`. Live
        policies read back afterward and confirmed to match exactly.
      - **Regression-tested end-to-end via real logins, not Simulate
        Staff, per the prompt's explicit requirement**: Log Visit earn
        case verified live in the browser as Ana (28→33 pts on the
        "Preview Test" client, `+5 EARN — Visit: Combi Massage` appended
        to Recent Activity). Redemption and redemption-with-upgrade cases
        verified via the identical `log_visit()` RPC path in a second
        rolled-back transaction as Diego/Owner respectively (Diego's
        redemption and Owner's redemption-with-upgrade both succeeded,
        upgrade `sales` row read back with the correct ₱500 amount) — this
        substitution was necessary because this session's Browser pane
        tool has a pre-existing gap unrelated to RLS: setting a native
        `<select>`'s value doesn't propagate to this app's React state
        (confirmed twice — the DOM/accessibility tree showed "Redeem..."
        selected but the submitted request still carried the default
        Combi Massage EARN), so the two non-default service selections
        couldn't be driven reliably through the actual dropdown. One-time
        **explicit user permission obtained** (this session's write
        classifier blocks unreviewed direct data writes) for a real,
        permanently-kept `+170` `ADJUSTMENT` ledger entry on "Preview
        Test" (append-only by design, not deletable, harmless test-client
        audit row) so the 100-point redemption threshold could be reached
        without dozens of manual earn-clicks. Sales Edit verified live as
        Diego (₱1,100→₱1,150, "Edited by Diego" tag correct) and reverted
        live as Owner (back to ₱1,100, "Edited by You" — also confirming
        Owner can edit under the Supervisor-or-above policy). Sales Void's
        `window.confirm()` is auto-dismissed by this browser tool (same
        known limitation documented in the Operations Phase handoff,
        `ohm#9h4c7x2m`) so the click-through itself wasn't drivable, but
        the identical UPDATE path was already proven live via Edit and the
        void trigger was independently smoke-tested (Diego blocked, Owner
        allowed) — not treated as unverified, per the established
        precedent. Confirmed nav/role gating unchanged (Front Desk still
        hides Staff/Logs/Analytics; Void buttons show "Owner only" for
        Diego, enabled for Owner). Regression-checked Dashboard, Clients,
        Staff, Bookings — all load with no console errors.
      - **Simulate Staff still fully functional in the UI, per explicit
        6C-2 scope** — it's what gets neutralized at the DB level by this
        very migration (a Front Desk session using Simulate Staff to "view
        as Owner" now gets real Owner UI affordances but not real Owner DB
        access, since RLS is now keyed off the actual `auth.uid()` session,
        not the client-side Simulate Staff selection) — not removed from
        the UI itself; that's still 6C-6.
      - See [[staff_state]], [[clients_state]], [[points_ledger_state]],
        [[sales_state]] for the updated RLS detail.
    - **6C-1 — Protected Routes / Middleware (No RLS Changes Yet) —
      complete** as of 2026-08-29 (`ohm#1q6w3e9r`). Plan (matcher config,
      redirect logic, redirect-intent scope) presented and approved
      before implementation, per the prompt's mandatory gate.
      - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`,
        `docs/state/staff_state.md`, ADR-001's Staff Auth section,
        `app/login/page.tsx`/`app/login/actions.ts` (read-only, to confirm
        the exact session-reading/cookie pattern from 6A/6B before
        building on top of it), plus a full `app/` route enumeration
        (Dashboard, Clients, Bookings, Sales, Lockers, Call Sheet,
        Therapists, Settings, Staff, Logs, Analytics, Login, plus root
        `/`) so the matcher config covers every route.
      - **Breaking-change discrepancy caught by reading the framework
        docs before writing code, not assumed from training data**: this
        project's Next.js version (16) has deprecated `middleware.ts` and
        renamed the convention to `proxy.ts` (export `proxy` instead of
        `middleware`) — functionally identical, confirmed via
        `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
        Flagged to the user during the approval gate; built as `proxy.ts`
        at the repo root rather than the prompt's literal
        `middleware.ts` filename.
      - **`proxy.ts`** (new): uses `@supabase/ssr`'s `createServerClient`
        directly against `NextRequest`/`NextResponse` — a third cookie
        adapter alongside the existing `lib/supabase/server.ts`
        (Server Components) and `lib/supabase/client.ts` (browser), per
        Supabase's documented proxy/middleware SSR pattern, not a reuse
        of either since both are typed for their own contexts. Calls
        `supabase.auth.getUser()` to force a session refresh on every
        matched request. No session + path ≠ `/login` → redirect to
        `/login?next=<original path + search>`; session + path ===
        `/login` → redirect to `/dashboard`; everything else passes
        through unchanged. `matcher` excludes `_next/static`,
        `_next/image`, and standard metadata files (`favicon.ico`,
        `sitemap.xml`, `robots.txt`) via the docs' negative-lookahead
        pattern — covers every app route plus Server Action POSTs on
        those routes (confirmed via the docs' own warning that a matcher
        change can silently drop Server Function coverage).
      - **Redirect-intent preservation was built in, not skipped** —
        confirmed with the user as the straightforward option during the
        approval gate rather than adding complexity silently.
        `app/login/actions.ts`'s `login()` now reads a `next` form field
        (guarded by a `safeNextPath` helper against open-redirect
        payloads — must start with `/`, must not start with `//`) and
        redirects there on success instead of hardcoding `/dashboard`;
        error redirects also carry `next` forward so a failed login
        attempt doesn't lose the original destination.
        `app/login/page.tsx` reads `next` from `searchParams` and renders
        it as a hidden form field.
      - **Nothing else touched, by design**: no RLS policy changes on any
        table, no removal of Simulate Staff, no role-based route
        restriction in `proxy.ts` — it only checks "is there a session at
        all," not "does this session's role permit this route." The
        existing app-level `ownerOnly` nav/page-guard pattern
        (`lib/nav.ts`, per-page content guards on Staff/Logs/Analytics)
        remains the sole role gate, unchanged.
      - Verified live in the browser against the shared local dev server
        (`npx tsc --noEmit` passes clean, not relied on alone):
        unauthenticated request to `/dashboard` correctly redirected to
        `/login?next=%2Fdashboard`; logged in as Ana (Receptionist) →
        redirected back to `/dashboard` (confirming redirect-intent
        works, not just a hardcoded destination), sidebar/nav gating
        unchanged from pre-6C-1, `/staff` still correctly blocked by the
        existing Owner-only page guard (confirming `proxy.ts` only gates
        session presence, not role); visiting `/login` again while
        signed in correctly bounced to `/dashboard`; clicked Sign Out →
        correctly bounced back to `/login`; logged in as J. Cruz (Owner)
        → reached every route including Staff/Logs directory listing all
        9 staff correctly. No server or console errors
        (`read_console_messages` checked clean).
      - See [[staff_state]] for the updated routing-protection detail.
    - **6C-4 — Settings/Catalog RLS (services, promos, addons, rooms,
      lockers, weekend_slots) — complete** as of 2026-08-29
      (`ohm#9d2k6y4p`) — see the detailed entry above (top of this list).
    - **6C-5 — Staff Directory + Activity Logs RLS — complete** as of
      2026-08-29 (`ohm#4t8w2j6q`) — see the detailed entry near the top of
      this list.
    - **6C-6 — Remove Simulate Staff + Full-System Regression Pass —
      complete** as of 2026-08-29 (`ohm#8r5m1v7z`) — see the detailed
      entry at the top of this list. Closes the entire Staff Auth phase.

- **Analytics Phase: Owner-Only Reporting Dashboard (Spa-Day Bucketing)**
  (`ohm#7v2q8f5c`) — **complete** as of 2026-08-28. Plan + regression
  assessment presented and approved before implementation, per the
  prompt's mandatory gate.
  - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`,
    `docs/state/analytics_state.md` (confirmed still an 8-line stub, no
    prior analytics work exists), ADR-001, plus a direct read of the live
    schema for `sales`/`bookings`/`clients`/`therapists`, and a grep of
    ADR-001 / `lib/bookings/slots.ts` for any pre-existing "operating
    day"/"spa-day" concept to reuse.
  - **Two discrepancies surfaced, resolved with the user, not guessed
    past**: (1) `nxs-spa-portal.html` is not present anywhere in this
    repo — confirmed via a repo-wide search — same recurring gap as
    every prior phase that cited it. Unlike prior phases, this one was
    not blocked on it: the prompt's own scope section (items 3-8) already
    gives complete, unambiguous logic for every stat/ranking, so the user
    chose "build from the prompt's spec" over waiting for the file. (2)
    the prompt states spa-day opens at 4:00 PM; the only existing
    operating-hours definition anywhere in the codebase
    (`lib/bookings/slots.ts`, confirmed during the Bookings phase) is
    4:30 PM open / 1:00 AM last call. User confirmed aligning the
    documented boundary to 4:30 PM for consistency — noted (and
    confirmed by the math) that this is cosmetic only: the rollover
    formula only cares about the 12:00 AM–3:59 PM window rolling back to
    the previous spa-day, and nothing operationally happens 4:00–4:30 PM
    either way.
  - **New canonical spa-day helper** (`lib/analytics/spa-day.ts`) — first
    of its kind in this codebase (confirmed via ADR-001 and a grep that
    no "operating day"/"spa-day" concept existed before this).
    `toSpaDay(timestamp)` / `toSpaMonth(timestamp)` return `YYYY-MM-DD` /
    `YYYY-MM` spa-day buckets; `spaDayNow()` / `spaMonthNow()` give the
    real current spa-day/month; `lastSpaDays(7)` returns the set of the
    last 7 spa-day buckets including today. One formula underlies all of
    them: since Asia/Manila is a fixed UTC+8 offset with no DST,
    "shift to Manila local time, then roll back 16 hours so 12AM–3:59PM
    lands on the prior date" reduces to a single 8-hour subtraction from
    the raw UTC instant, then reading off the UTC calendar date. Every
    bucketed stat/table in Analytics imports this — no per-card
    reimplementation, per the prompt's explicit requirement.
  - **Analytics page** (`app/analytics/page.tsx`, real page replacing the
    8-line stub; `components/analytics-browser.tsx`, new): a single
    Server Component fetch of `sales` (embedded-joined to
    `services(name)` and `clients(codename, points_balance)`, all rows —
    current volume is a handful, no pagination needed) and `bookings`
    (status `Booked`/`Completed`, embedded-joined to
    `therapists(name, archived)`), shaped into flat objects server-side
    (same pattern as the Sales page) and passed to a client component
    that does all spa-day bucketing/aggregation in a single `useMemo`.
    **Sales**: Today/7-day/Month stat cards, sum of non-voided
    `sales.amount`. **Client Visits**: Today/7-day/Month stat cards,
    count of non-voided `sales` rows — confirmed per the prompt that
    `sales` alone is the correct, non-double-counting visit definition
    (both `logVisitBooking` and `quick_walkin()` unconditionally write a
    `sales` row per visit; `point_transactions` is conditional/linked and
    would double-count). **Most Availed Service**: ranked count of
    `services.name` across all non-voided sales. **Sales Per Day / Sales
    Per Month**: tables of amount + visit count per spa-day/spa-month
    bucket, most recent first. **Top Clients**: ranked by total
    non-voided spend among registered clients only (walk-ins have no
    `client_id` to rank), showing visit count and `clients.points_balance`
    read directly (no ledger recomputation). **Therapist Ranking**: count
    of `bookings` with status Booked or Completed per `therapist_id`,
    archived therapists tagged "(Archived)" per ADR-001's archive-handling
    convention.
  - **Owner-only gating reuses the exact existing `lib/staff-context.tsx`
    (`useStaffSim`/`currentRole`) mechanism — no new gating pattern
    invented**, per the prompt's explicit instruction: `lib/nav.ts`'s
    `analytics` entry gained `ownerOnly: true` (this was the one nav item
    still missing the flag — the Staff/Logs phase had explicitly left it
    untouched as out of scope then, and this phase is what closes that
    gap); `components/analytics-browser.tsx` has the same page-level
    content guard pattern as `staff-browser.tsx`/`logs-browser.tsx`
    (`currentRole !== "Owner"` → blocking message), defense-in-depth
    beyond nav hiding for a direct URL visit.
  - **No new RLS** — confirmed live via `list_tables` that `sales`,
    `bookings`, `clients`, `therapists` all already carry public SELECT
    policies from prior phases (Sales/Operations phase added `sales`
    SELECT; `clients`/`therapists`/`bookings` already had SELECT from
    Core Loop/Bookings/Staff phases). No migration file needed or
    written this phase.
  - **App-level-only role gate — the same explicitly accepted gap as
    every other Owner-only page pending real Staff Auth**: RLS SELECT on
    all four tables is open to any anon/authenticated caller; the actual
    Owner-only restriction is enforced only in app code via the
    client-side Simulate Staff selection, not at the RLS layer.
  - Verified live in a browser (`npx tsc --noEmit` passes clean, but not
    relied on alone): loaded `/analytics` as Owner and confirmed Sales
    Today = ₱0 / Last 7 Days = This Month = ₱3,300 with 4 visits — all 4
    existing sales correctly bucketed into the previous spa-day (Aug 27)
    at the current pre-4:30-PM wall-clock time on Aug 28, matching the
    Sales tab's own independently-computed ₱3,300 running total exactly;
    confirmed Most Availed Service, Sales Per Day/Month, Top Clients, and
    Therapist Ranking all rendered with correct counts against the live
    data. Switched Simulate Staff to Ana (Front Desk) and confirmed both
    the nav item disappeared and a direct `/analytics` visit showed the
    Owner-only blocking message; switched back to Owner (J. Cruz) and
    confirmed the dashboard reappeared. Regression-checked Sales
    (₱3,300 total, matches), Bookings, Staff Directory, and Activity Logs
    — all load with no server or console errors.
  - See [[analytics_state]] for the full surgical detail (updated next in
    this same session, per the prompt's mandated after-completion order).

- **Operations Phase: Locker Board, Call Sheet, Sales (Edit/Void)**
  (`ohm#9h4c7x2m`) — **complete** as of 2026-08-28. Plan + regression
  assessment presented and approved before implementation, per the
  prompt's mandatory gate, including explicit answers to both required
  discrepancy questions before any code was written.
  - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`,
    `docs/state/operations_state.md`, `docs/state/sales_state.md`,
    ADR-001, plus a direct read of the live schema/RLS/RPC bodies for
    `locker_occupancy`/`sales`/`rooms`/`lockers` and of the mockup's
    `panel-lockers`/`panel-callsheet`/`panel-sales` markup and JS.
  - **Question 1 (Locker Board check-in gap) — resolved, not a real gap**:
    read `public.quick_walkin()` and `logVisitBooking()` in
    `app/bookings/actions.ts` directly rather than trusting the prior
    handoff summary at face value. Confirmed both current
    booking-completion paths reliably insert into `locker_occupancy` —
    `quick_walkin()`'s own INSERT, and `logVisitBooking()`'s
    linked-booking branch (`app/bookings/actions.ts:357`) which inserts
    directly (its unlinked branch delegates to `quickWalkin()`, same
    insert). "Occupied" = a row with `checked_out_at IS NULL`, enforced by
    two partial unique indexes already in the schema
    (`one_active_occupant_per_locker`, `one_active_occupant_per_room`) —
    so Check-Out only needed to set `checked_out_at`/`checked_out_by`, no
    new check-in flow required.
  - **Question 2 (walk-in vs. registered sales) — resolved**:
    `sales.client_id IS NULL` (with `guest_label` set) is the real-schema
    equivalent of the mockup's `clientKey===null` check — confirmed via
    the live `sales` check constraint, not assumed.
  - **New migration**
    (`supabase/migrations/20260828023358_operations_sales_rls.sql`),
    smoke-tested via a rolled-back transaction first — ran the DDL, then
    `set local role anon` and exercised an UPDATE on `locker_occupancy`
    and both a SELECT and UPDATE on `sales` through the new policies,
    confirmed both worked, then rolled back — before applying for real via
    `apply_migration`. Contents: `locker_occupancy` gained a
    `public_update` policy (was INSERT/SELECT-only, needed for Check-Out);
    `sales` gained `public_select` (was insert-only — nothing read it
    before this) and `public_update` (needed for Edit/Void). All three
    `roles: public`, `USING(true)`/`WITH CHECK(true)`, same additive shape
    as every prior policy since Core Loop.
  - **Locker Board** (`app/lockers/page.tsx`, real page replacing the
    8-line stub; `components/locker-board.tsx`, new;
    `app/lockers/actions.ts`, new): 100 tiles from the live `active=true`
    `lockers` rows (not hardcoded — confirmed the live count is currently
    100), each occupied tile joined from `locker_occupancy` where
    `checked_out_at IS NULL`, showing the client's `codename` or
    `guest_label`. Header summary `"X / Y occupied"`. **Check-Out**
    (`checkOutLocker` server action): sets `checked_out_at`/
    `checked_out_by`, ends with an `action_logs` insert
    (`locker_checkout`), revalidates `/lockers` and `/call-sheet`.
  - **Call Sheet** (`app/call-sheet/page.tsx`, real page replacing the
    8-line stub; `components/call-sheet-browser.tsx`, new; read-only, no
    mutation): derived from the same active `locker_occupancy` rows,
    joined to `services(name)` and filtered to exclude Wet Area. **Real
    schema gap from the mockup, resolved with a documented substitution
    (not a schema change)**: the mockup's in-memory `occupiedLockers` entry
    carries a synthetic `time` field that doesn't exist anywhere in the
    real schema (`locker_occupancy` has no start-time column — that
    concept lives on `bookings`, which isn't joined here). Used
    `checked_in_at` (formatted HH:MM) as the real equivalent for the time
    filter dropdown, built from distinct times actually present — same
    "derive filter options from live data" pattern the Logs tab already
    established. Total line: `"X massage(s) [in progress / at TIME]"`.
  - **Sales** (`app/sales/page.tsx`, real page replacing the 8-line stub;
    `components/sales-browser.tsx`, new; `app/sales/actions.ts`, new):
    table — Date, Client, Service, Amount, Payment (+ GCash ref when
    present), Promo, Therapist, Actions — sourced from `sales` embedded-
    joined to `clients(codename)`/`services(name)`/`therapists(name)`/
    `promos(label)` (all single-FK, safe to embed); `processed_by`/
    `edited_by`/`voided_by` resolved via a separately-fetched `staff` list
    mapped in app code, same pattern Logs used, since `sales` carries
    three separate FKs to `staff` (ambiguous for embedding). Running total
    excludes voided sales. Walk-in sales (`client_id IS NULL`) show "No
    action — walk-in, no account" instead of buttons, matching the
    mockup's `isWalkIn` branch exactly. **Edit** (real modal, not
    `prompt()` — the prompt's explicit instruction): amount, payment
    method, GCash ref (shown only for GCash), therapist — `editSale`
    server action sets `edited_by`/`edited_at`, UI shows an "Edited by
    [staff]" tag, ends with an `action_logs` insert (`sale_edit`).
    **Void**: `window.confirm()` (same established pattern as Settings'
    delete buttons, not a new one) — `voidSale` server action sets
    `voided`/`voided_at`/`voided_by` (never a hard delete, per ADR-001),
    row stays visible tagged "VOIDED" and excluded from the total, ends
    with an `action_logs` insert (`sale_void`).
  - **Role gating reuses the existing `lib/staff-context.tsx`
    (`useStaffSim`/`currentRole`) mechanism exactly as Staff/Logs did — no
    third gating pattern invented**, per the prompt's explicit
    instruction: Edit enabled for Supervisor/Owner, Void enabled for
    Owner-only, disabled buttons carry the same tooltip text
    (`"Supervisor or Owner only"` / `"Owner only"`) as the mockup.
  - **App-level-only role gate — the explicitly accepted gap, same as
    every other phase pending real Staff Auth**: the new RLS grants
    UPDATE (`locker_occupancy`, `sales`) and SELECT (`sales`) at the DB
    level to any anon/authenticated caller. The actual Supervisor/Owner
    restriction is enforced only in app code via the Simulate Staff
    selection, not at the RLS layer.
  - Verified live in a browser (`npx tsc --noEmit` passes clean, but not
    relied on alone): as Owner, edited a real sale's amount (₱700→₱750)
    and confirmed the `sales` row and a correctly-attributed `sale_edit`
    action_logs entry directly in the DB, plus the "Edited by You" tag and
    recalculated total in the UI; checked out locker 5 and confirmed
    `checked_out_at` was set with a `locker_checkout` action_logs entry,
    and that both Locker Board (0/100 occupied) and Call Sheet (entry
    removed) updated correctly; confirmed Front-Desk role shows disabled
    Edit/Void with the correct tooltips and Owner role shows them enabled.
    Void's `window.confirm()` dialog is suppressed by the headless browser
    tool used for verification (returns `false` automatically) so the
    click-through couldn't be driven end-to-end that way — not treated as
    unverified, since it's the identical Supabase UPDATE path already
    proven live via Edit, and the `sales` UPDATE policy was independently
    smoke-tested against `anon` during migration application. Test
    mutations (the amount edit, the locker checkout) were reverted in the
    live DB after verification so state matches pre-session. Regression-
    checked Dashboard (Total Lockers still reads 100, unaffected by the
    new RLS), Bookings, and Settings — all load with no server or console
    errors.
  - See [[operations_state]] and [[sales_state]] for the full surgical
    detail (updated next in this same session, per the prompt's mandated
    after-completion order).

- **Management Phase: Staff Directory + Activity Logs Tab (Owner-only)**
  (`ohm#3z8k1p6d`) — **complete** as of 2026-08-28. Plan + regression
  assessment presented and approved before implementation, per the
  prompt's mandatory gate.
  - **Context loaded first, two real discrepancies surfaced (not
    guessed past)**: (1) the first `nxs-spa-portal.html` found on disk
    was the wrong/older mockup (no `panel-staff`/`panel-logs`/
    `addStaffModalScrim`) — same failure mode as `ohm#8r3n6y1q` — blocked
    until the user supplied the correct file
    (`nxs-spa-portal (13).html`). (2) The prompt assumed Owner-only nav
    gating could "reuse the Analytics mechanism" — verified directly this
    doesn't exist: `lib/nav.ts` was a static array with zero role logic,
    `app/analytics/page.tsx` has no role check, and `Simulate Staff`
    state lived only in local `useState` inside `settings-browser.tsx`
    (confirmed local/session-only by design in the prior Settings phase),
    invisible to `Sidebar`/`layout.tsx`.
  - **Three decisions confirmed with the user before writing code**: (1)
    build a small shared role-state mechanism (React Context) rather than
    leaving Owner-gating unbuilt — approved as legitimate scope, not
    creep, since the prompt explicitly required it for Logs; (2) Staff
    Directory's nav item should also be Owner-only, matching the mockup's
    `nav-staff` gating even though the prompt's text only explicitly said
    this for Logs; (3) Analytics' nav item should NOT be touched despite
    the mockup gating it identically — stayed strictly scoped to
    Staff/Logs per the prompt's explicit out-of-scope list.
  - **New shared mechanism** (`lib/staff-context.tsx`): `StaffSimProvider`
    + `useStaffSim()` — a React Context holding `staffList`,
    `loginableStaff`, `selectedStaffId`/`setSelectedStaffId`,
    `currentStaff`, `currentRole` (same `positionToRole` mapping as the
    mockup: Receptionist→"Front Desk", else 1:1). Seeded from a
    server-fetched `staff` list in `app/layout.tsx` (now an `async`
    Server Component wrapping `Sidebar` + `children`). Selection persists
    to `localStorage` (`nxs_sim_staff_id`) so it survives full page
    navigation between real Next.js routes — unlike the mockup's
    single-page tab switching, this app has real page loads per route.
    `components/sidebar.tsx` now filters `navItems` (each item in
    `lib/nav.ts` gained an optional `ownerOnly` flag, set on `staff` and
    `logs` only) to hide `Staff`/`Logs` unless `currentRole === 'Owner'`.
  - **`components/settings-browser.tsx` migrated to the shared context**:
    the Simulate Staff dropdown's `staffList`/`loginableStaff`/
    `selectedStaffId`/`currentStaff`/`currentRole` are now read from
    `useStaffSim()` instead of local `useState` — same UI, same options,
    same labels, verified unchanged in the browser. The `initialStaff`
    prop and its local hardcoded fallback array were removed as dead code
    (the fetch now happens once in the layout); `app/settings/page.tsx`
    no longer fetches or passes `staff`.
  - **Staff Directory** (`app/staff/page.tsx`, real page replacing the
    8-line stub; `components/staff-browser.tsx`, new): flat list per the
    mockup (`renderStaffList`) — each row shows position, an inline
    comment if present, and "· can log in" / "· directory only" — plus
    the "Only Receptionist, Supervisor, and Owner can log in..." notice
    and a `+ Add Staff` button. **Add Staff modal**: Name, Position
    select (Receptionist/Attendant/Supervisor/Others — matches the
    mockup's `#stPosition` options, no Owner in the add list), Comment
    field shown only when Position is "Others", same "Please enter a
    name." validation as the mockup. **Owner-only page-level content
    guard** in addition to nav hiding, since a direct URL visit bypasses
    nav — verified live that visiting `/staff` as Front Desk shows a
    blocking message instead of the roster. No delete/archive — add-only,
    confirmed in scope with the user beforehand.
  - **New `app/staff/actions.ts`**: `addStaff(name, position, comment,
    actorStaffId)` — INSERT into `staff`, then an `action_logs` insert
    (`action = "staff_add"`, detail = name/position/comment) using the
    same `// TEMP: placeholder actor pending Staff Auth phase` pattern as
    every other phase, `revalidatePath("/staff")` +
    `revalidatePath("/settings")` + `revalidatePath("/", "layout")` (the
    last one so the root layout's staff fetch — and therefore the
    Simulate Staff dropdown and `loginableStaff` list — picks up newly
    added staff without a hard reload).
  - **Activity Logs** (`app/logs/page.tsx`, real page replacing the
    8-line stub; `components/logs-browser.tsx`, new): server-fetches
    `action_logs` ordered `created_at desc`, `LIMIT 500` — current volume
    is a few dozen rows across every phase since Core Loop, so no
    pagination UI was built; flagged in a code comment to revisit once
    real growth suggests it, per the prompt's explicit instruction not to
    over-build for a dataset this small. **Staff names are joined in app
    code, not via a PostgREST embedded select** — `action_logs.staff_id`
    carries two FKs in the generated types (one to `staff`, one to the
    `loginable_staff` view over the same table), which makes `staff:
    staff_id(name)`-style embedding ambiguous; fetched `staff` separately
    and mapped `staff_id → name` server-side instead. **Filters**
    (Action/Date/Staff, all combinable, exactly like the mockup's
    `renderLogs()`): Action and Staff dropdowns populate from **distinct
    values actually present in the fetched rows** — deliberately not the
    mockup's hardcoded `LOG_ACTIONS` list, per the prompt's explicit
    instruction that this one point overrides mockup literalism. Table:
    When / Staff / Action / Detail, matching the mockup's
    `an-table`/`an-head` grid-template-columns exactly. Read-only, no
    mutation capability from this tab. Same Owner-only page-level content
    guard as Staff Directory — verified live that visiting `/logs`
    directly as Front Desk shows a blocking message.
  - **Migration**
    (`supabase/migrations/20260828015000_staff_directory_and_logs_rls.sql`),
    smoke-tested via a rolled-back transaction first — ran the DDL, then
    `set local role anon` and exercised an insert into `staff` and a
    select from `action_logs` through the new policies, confirmed both
    worked, then rolled back — before applying for real via
    `apply_migration`. Contents: `staff` gained a `public_insert` INSERT
    policy (`WITH CHECK (true)`) — was SELECT-only before this, first
    writer is the Add Staff modal; `action_logs` gained a `public_select`
    SELECT policy (`USING (true)`) — was INSERT-only before this, first
    reader is the Activity Logs tab. Both `roles: public`, same shape as
    every prior additive policy from Core Loop/Bookings/Settings. No
    UPDATE/DELETE policy added to either table.
  - **App-level-only role gate — the explicitly accepted gap, same as
    every other phase pending real Staff Auth**: the new RLS grants
    INSERT (`staff`) / SELECT (`action_logs`) at the DB level to any
    anon/authenticated caller. The actual "Owner only" restriction for
    both new pages is enforced only in app code (nav hiding +
    page-level content guard, both keyed off the client-side Simulate
    Staff selection), not at the RLS layer — not a regression, not
    forgotten, closes when real Staff Auth lands.
  - **Seeded "Jeff" and "Essem"** as real `Receptionist` rows through the
    live Add Staff UI (explicit user request during the approval
    exchange, not test data to be cleaned up) — both now appear correctly
    in the Simulate Staff dropdown and the Staff Directory list, and their
    `staff_add` action_logs rows are visible and filterable on the Logs
    tab.
  - Verified live in a browser (`npx tsc --noEmit` passes clean, but not
    relied on alone): confirmed nav hiding and the page-level Owner-only
    guard both correctly block Front Desk and clear for Owner on both
    `/staff` and `/logs`; confirmed the Logs Action filter dropdown
    includes the new `staff_add` action and filters the table correctly;
    confirmed the Staff filter dropdown populates from distinct staff
    actually present in the logs; confirmed the Simulate Staff selection
    survives a full page navigation (not just a client-side route change)
    via `localStorage`, and that switching staff in Settings still
    updates `canEditServices`/`canEditPromos` gating exactly as before.
    Regression-checked Settings, Bookings, Therapists, and Client Profile
    — all load with no server or console errors.
  - See [[staff_state]] and [[logs_state]] for the full surgical detail
    (updated next in this same session, per the prompt's mandated
    after-completion order).

- **Settings Persistence (`ohm#5x1p8m3v`) — Wire Existing UI to Supabase
  (Direct Table Writes)** — **complete** as of 2026-08-28. Plan +
  regression assessment presented and approved before any code, per the
  prompt's mandatory gate — three explicit decision points were confirmed
  with the user rather than assumed (see below).
  - **Context loaded first**: `.ai/briefing.md`, `.ai/handoff.md`,
    `docs/state/settings_state.md`, ADR-001, plus a direct read of the
    live schema/RLS for `services`/`promos`/`addons`/`rooms`/`lockers`
    and of `components/settings-browser.tsx`'s exact mutation points —
    per the prompt's required reading order.
  - **Verification turned up two real gaps, not assumptions**: no table
    anywhere modeled Weekend Fixed Time Slots (confirmed via live schema
    read, not guessed), and Capacity doesn't map to a count column —
    `rooms`/`lockers` are individual numbered rows (PK = `number`), so
    "Room/Bed count" required a real design decision on what a decrease
    means.
  - **Three decisions confirmed with the user before writing code**:
    (1) Rooms/Beds count decreases deactivate (`active = false`) the
    highest-numbered active rooms rather than a hard delete — never a
    hard delete since `bookings.room_number` FKs to `rooms`; increases
    insert new sequential rows, same pattern as Lockers'
    "+ Add 10 Lockers". (2) A new dedicated `weekend_slots` table (plain
    `slot_time` column, add/delete only, no FK to anything) was approved
    as the right call — not a violation of "no new generic settings
    store," since it's a real table for real data with nowhere else to
    live, not a config blob. (3) Services delete got wired too
    (soft-delete, Supervisor/Owner-gated), even though the prompt's
    literal scope only listed "update price/points" for Services —
    leaving it unwired would have left an existing, visible Delete
    button silently do nothing.
  - **Migration** (`supabase/migrations/20260828011724_settings_persistence_rls.sql`),
    smoke-tested via a rolled-back transaction first — ran the full DDL,
    then `set local role anon` and exercised insert/update through every
    new policy (weekend_slots insert/select, services/promos/addons
    insert+update+soft-delete, rooms insert+deactivate, lockers insert),
    confirmed the booking GiST exclusion constraints and other tables'
    existing policies were untouched, then rolled back — before applying
    for real via `apply_migration`. Contents: new `weekend_slots` table;
    additive `public_insert`/`public_update` RLS policies (role
    `public`, `USING(true)`/`WITH CHECK(true)`, same shape as every prior
    additive policy from Core Loop/Bookings) on
    `services`/`promos`/`addons`/`rooms`; `public_insert`-only on
    `lockers` (batch-add never touches existing rows). **No DELETE
    policy exists on services/promos/addons** — all three are
    FK-referenced by historical `sales`/`bookings`/`sale_addons` rows, so
    "delete" in the UI is a soft `UPDATE ... SET active = false`, which
    the existing `page.tsx` reads already filter out
    (`.eq("active", true)`). A second migration
    (`20260828011900_seed_weekend_slots_defaults.sql`) seeded the 7
    default slot times the UI already displayed locally, so switching to
    persistence didn't visually wipe the list on first load.
  - **App-level-only role gate — the explicitly accepted gap, same as
    every other phase pending real Staff Auth**: every new RLS policy
    grants INSERT/UPDATE capability at the DB level to any
    anon/authenticated caller. The actual "Front Desk can't edit,
    Supervisor/Owner can" restriction is enforced only in
    `settings-browser.tsx`'s existing `canEditServices`/`canEditPromos`
    checks (driven by the Simulate Staff dropdown), not at the RLS
    layer. Documented inline in the migration file and here — not a
    regression, not forgotten, closes when real Staff Auth lands.
  - **Server actions** (`app/settings/actions.ts`, new file): one action
    per mutation point identified in `settings-browser.tsx` —
    `updateServicePrice`/`updateServicePoints`/`addService`/
    `deleteService`, `addPromo`/`updatePromoDiscount`/`deletePromo`,
    `addWeekendSlot`/`deleteWeekendSlot`,
    `addAddon`/`updateAddonPrice`/`deleteAddon` (the existing UI-only
    "minimum 1 active add-on" safeguard is now also enforced
    server-side, not just via a disabled button), `addLockerBatch`
    (inserts the next 10 sequential numbers after the current max),
    `updateRoomCount` (inserts or deactivates rows to reach the target
    count). Every mutation ends with an `action_logs` insert using the
    same `// TEMP: placeholder actor pending Staff Auth phase` pattern
    as Bookings/Core Loop (actor = the real `staff.id` already flowing
    through `selectedStaffId` from the Simulate Staff dropdown) and
    `revalidatePath("/settings")`.
  - **UI wiring** (`components/settings-browser.tsx`): every local-only
    `useState` handler now calls its server action first and only
    commits local state + toast on success, showing the actual error on
    failure instead of a blind "updated" toast. Numeric inputs
    (services price/points, promo discount, add-on price) were switched
    from per-keystroke `onChange` to commit-on-`blur`, so typing doesn't
    fire a DB write and an `action_logs` row per digit — a fix beyond
    the prompt's literal ask, made because the direct 1:1 port would
    have hammered the DB and the audit log on every keystroke. Room
    count got the same treatment via a separate draft-state input.
    Weekend slots' local state changed shape from `string[]` to
    `{id, slot_time}[]` since delete now needs a real row id; `page.tsx`
    gained a `weekend_slots` fetch to seed it. Theme toggle and Staff
    Simulation stay local/session-only by design — confirmed with the
    user that neither needs DB persistence, consistent with the
    prompt's own suggestion.
  - **`lib/types/database.ts` regenerated** from the live schema after
    both migrations, picking up the new `weekend_slots` table type
    (hand-preserved the existing `quick_walkin` `Args` nullability
    adjustments from `ohm#8r3n6y1q`, which the raw codegen doesn't
    infer).
  - Verified live in a browser (`npx tsc --noEmit` passes clean, but not
    relied on alone): switched Simulate Staff to Diego (Supervisor),
    updated Combi Massage's price, added a weekend slot, added a locker
    batch, and shrank the room count from 18 to 16 — confirmed each
    write landed in the live `services`/`weekend_slots`/`lockers`/`rooms`
    tables and produced a correctly-attributed `action_logs` row,
    confirmed rooms 17–18 were deactivated (not deleted) by the count
    decrease. Regression-checked Bookings, Client Profile, and
    Therapists pages — all load with no server or console errors, none
    of their read/write paths touch the five catalog tables' new INSERT/
    UPDATE policies. Test rows (the extra weekend slot, the 10 extra
    lockers, the price bump, the deactivated rooms) were reverted from
    the live DB after verification so it matches its pre-test state.
  - See [[settings_state]] for the full surgical detail (updated next in
    this same session, per the prompt's mandated after-completion order).

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

- `app/dashboard`, `app/clients`, `app/bookings`, `app/therapists`,
  `app/settings`, `app/staff`, `app/logs`, `app/sales`, `app/lockers`,
  `app/call-sheet`, and `app/analytics` all have real implementations now.
  No route is still an 8-line "Coming soon." stub.
- Staff Auth 6A (`ohm#2k9m4w7p`) added a real login page (`/login`) and
  real Supabase Auth sessions (email/password, 8 `auth.users` linked to
  `staff.user_id`) — but **nothing else in the app reads that session
  yet**. `app/layout.tsx` still fetches the `staff` table server-side to
  seed the client-side "simulated role" context (`lib/staff-context.tsx`,
  `ohm#3z8k1p6d`) — Simulate Staff is still the only thing driving
  role-based UI anywhere in the app, completely independent of whether
  anyone is actually logged in via `/login`. There is no `auth.uid()`-keyed
  session used anywhere in app logic, no protected routes, and
  `action_logs` actor-attribution still uses the placeholder staff-picker
  pattern. Wiring the real session into `staff-context`/actor-attribution
  is 6B; protected routes are 6C — both not started, see
  `ohm#2k9m4w7p` above. The app's server/browser Supabase clients use the
  anon key. RLS now has narrow, additive SELECT/INSERT policies on
  `staff` (SELECT + INSERT) and `action_logs` (INSERT + SELECT), among
  the other tables opened by prior phases — everything else is
  default-deny for `anon`/`authenticated`. RLS was not touched by 6A.
- Owner-only route gating (`Staff`, `Logs` nav items, and each page's own
  content) is enforced only in app code via `lib/staff-context.tsx`'s
  `currentRole`, driven by the client-side Simulate Staff selection — not
  by RLS, not by real route middleware. Do not treat this as real access
  control; it's a UI convenience pending Staff Auth, same caveat as every
  other role check in this app.
