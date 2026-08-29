# Handoff — Active Sprint

Not a history log — see `.ai/briefing.md` → "Last Completed Tasks" for that.
This file tracks only what's in flight right now.

## In progress

- **Staff Auth (`ohm#2k9m4w7p` — 6A of a three-part 6A/6B/6C plan)**
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
  - **6C — not started.** Planned scope: protected routes (redirect
    unauthenticated visitors away from the app, e.g. proxy/middleware or
    per-page session checks) and RLS lockdown (real `auth.uid()`-keyed
    policies replacing the current `USING(true)` app-level-only gate),
    replacing the current "wide open, gated only by client-side Simulate
    Staff / session-if-present" posture with real enforcement. This is
    also when Simulate Staff's role-spoofing capability finally gets
    neutralized at the DB level — it must keep working as a testing tool
    until then.

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
