# Staff — Current State

## Implemented (DB level)

`public.staff`: `id`, `name`, `position` (enum `staff_position`:
`Receptionist`/`Attendant`/`Supervisor`/`Owner`/`Others`), `active`,
`comment`, `user_id` (nullable, link to `auth.users` — now populated for
the 8 loginable staff, see below), `created_at`.

`public.loginable_staff` — a view over `staff` (same shape), presumably
intended to filter to staff with an auth identity. As of now nothing in
the app queries this view — `staff.user_id IS NOT NULL` would be the
real filter once something needs it.

**Auth linkage (`ohm#2k9m4w7p`, Staff Auth 6A, 2026-08-29)**: 8 of the 9
active `staff` rows now have a real `auth.users` account linked via
`user_id` — Ana, Ben, Cathy, Jeff, Essem (Receptionist), Diego, Elena
(Supervisor), J. Cruz (Owner). Mika (Attendant) has no account and
`user_id` stays `null`, per the locked scope (Attendants are not
loginable staff). Emails are synthetic `<firstname>@nxs.local`
(`jcruz@nxs.local` for J. Cruz), not real addresses — internal-tool-only,
confirmed with the user. Passwords are tiered by position
(`nxsrecep26` / `nxs.supervisor26` / `nxs.owner26`), also confirmed with
the user. Accounts were created via the Supabase Admin API
(`auth.admin.createUser`, `email_confirm: true`) through a one-off local
script, not through any in-app signup flow — there is still no signup UI
and none is planned; the 8 accounts are the complete, fixed roster for
now.

**Real actor attribution live (`ohm#4p7v9k3s`, Staff Auth 6B, 2026-08-29)**:
`user_id`/`auth.uid()` is now actually read. `app/layout.tsx` resolves
`auth.uid()` → `staff` row via `user_id` and passes it into
`StaffSimProvider` as `sessionStaff`. `lib/staff-context.tsx` prefers
`sessionStaff` for `currentStaff`/`currentRole`/`selectedStaffId`
whenever a session exists, so every consumer of `useStaffSim()` — nav
gating, Settings role gates, and every `action_logs` write — reflects the
real logged-in staff member without per-call-site changes. **Simulate
Staff is still fully functional and is the sole driver when nobody is
logged in** (by design, confirmed with the user during 6B's approval
gate) — it remains the intended testing/role-spoofing tool until 6C's RLS
lockdown neutralizes it at the DB level. When a session exists, the
Simulate Staff dropdown in Settings is visibly disabled (not hidden) with
an inline note, rather than silently ignored.

RLS: `anon` has both `SELECT` (`public_select`, `USING (true)`, added by
Core Loop) and `INSERT` (`public_insert`, `WITH CHECK (true)`, added by
`ohm#3z8k1p6d`) policies. No UPDATE/DELETE policy — no edit/archive/delete
flow exists in the app for staff.

## Implemented (app level)

- **Login page** (`app/login/page.tsx`, `app/login/actions.ts`,
  `ohm#2k9m4w7p`, Staff Auth 6A): real email/password login using
  `supabase.auth.signInWithPassword()` through the existing
  `lib/supabase/server.ts` SSR client — session cookies are handled by
  `@supabase/ssr`'s own cookie adapter, no bespoke session code. Redirects
  to `/dashboard` on success, shows an inline error on failure. Visiting
  `/login` while already authenticated shows "Signed in as [email]" with
  a Sign Out button (`logout()` action → `supabase.auth.signOut()`). As of
  6B, logging in now has real effect app-wide via `staff-context` (below)
  — no changes to the login page itself were needed for that. Still no
  protected routes; that's 6C.
- **Shared role-state context** (`lib/staff-context.tsx`,
  `ohm#3z8k1p6d`, extended by `ohm#4p7v9k3s` Staff Auth 6B):
  `StaffSimProvider`/`useStaffSim()` is the single source of truth for
  "who's acting" across the whole app. Seeded from a server-fetched
  active-staff list in `app/layout.tsx` (now `async`), plus (as of 6B) an
  optional `sessionStaff` resolved from `auth.uid()` → `staff.user_id`.
  When `sessionStaff` is present it drives `currentStaff`/`currentRole`/
  `selectedStaffId` directly; when absent, behavior is unchanged from
  before 6B — the Simulate Staff selection (persisted to `localStorage` as
  `nxs_sim_staff_id`) drives everything. `components/sidebar.tsx` reads
  `currentRole` from this context to hide the `Staff`/`Logs` nav items
  (see `lib/nav.ts`'s `ownerOnly` flag) unless `currentRole === 'Owner'` —
  now correctly reflects the real role when logged in.
  `components/settings-browser.tsx`'s Simulate Staff dropdown reads/writes
  this shared context and is `disabled` (with an inline note) whenever a
  real session exists.
- **Staff Directory** (`app/staff/page.tsx`, `components/staff-browser.tsx`,
  `ohm#3z8k1p6d`) — first real UI for this table beyond the Log Visit
  modal's read-only picker. Flat list (position + inline comment if
  present + "· can log in" / "· directory only" tag), `+ Add Staff` modal
  (Name, Position select — Receptionist/Attendant/Supervisor/Others, no
  Owner in the add list — Comment field shown only for "Others").
  Owner-only: hidden from nav for non-Owner, and the page itself renders
  a blocking message if visited directly by URL. **Add-only — no
  edit/archive/delete UI exists**, confirmed in scope before building.
- **`app/staff/actions.ts`** (`ohm#3z8k1p6d`): `addStaff(name, position,
  comment, actorStaffId)` — INSERT into `staff`, then an `action_logs`
  insert (`action = "staff_add"`). Ends with `revalidatePath("/staff")`,
  `revalidatePath("/settings")`, and `revalidatePath("/", "layout")` (the
  last one so the root layout's staff fetch — and therefore the Simulate
  Staff dropdown and Owner-only gating input — picks up new staff without
  a hard reload).
- **Log Visit / New Booking / Quick Walk-in modals**
  (`components/log-visit-modal.tsx`, `components/booking-form-modal.tsx`,
  `components/quick-walkin-modal.tsx`): as of the 6B-Addendum
  (`ohm#6y1d4h8m`, 2026-08-29), the "Logged by (staff)" / "Booked by
  (staff)" field is a **read-only label**, not a `<select>` — no manual
  actor selection inside any modal. Each resolves
  `actor = sessionStaff ?? staff[0]` (same value/fallback 6B established:
  real session when logged in, first staff member in the fetched list
  when not) and renders `{actor.name} · {actor.position}`. To change the
  acting identity while logged out, use Settings' Simulate Staff control —
  not a per-modal picker.
- **Persistent logout control**: `components/sidebar.tsx` (6B-Addendum,
  `ohm#6y1d4h8m`) now has an account block at the bottom of the sidebar,
  always visible. Session present: shows `{name} · {role}` and a "Sign
  out" button (posts to the existing `logout()` action in
  `app/login/actions.ts`). No session: shows a "Log in" link to `/login`.
  Previously the only sign-out path was `/login` itself.
- **`action_logs` attribution**: every write path (Settings, Sales,
  Lockers, Staff Directory, Bookings, Core Loop) now genuinely attributes
  to the real logged-in staff member when one exists, and to the
  Simulate Staff selection otherwise — the former
  `// TEMP: placeholder actor pending Staff Auth phase` comments (7 sites)
  are gone; the value they annotated is the same code path, now backed by
  real identity when available.

**Protected routes (`ohm#1q6w3e9r`, Staff Auth 6C-1, 2026-08-29)**:
`proxy.ts` (repo root — this Next.js version renamed `middleware.ts` to
`proxy.ts`, functionally identical) now gates every route on session
presence. All routes require a real Supabase Auth session **except
`/login`** — an unauthenticated request to any other route redirects to
`/login?next=<original path>`; an authenticated request to `/login`
redirects to `/dashboard`. Login honors `next` to return the user to
where they were headed (validated against open-redirect payloads). This
is purely "is there a session at all" — it does not check role, and does
not replace the existing app-level `ownerOnly` nav/page-guard pattern
(`lib/nav.ts`, Staff/Logs/Analytics page guards), which is unchanged.
Simulate Staff is fully unaffected: once past the login gate, a session
still resolves `sessionStaff` exactly as in 6B, and Simulate Staff still
drives role/actor for anyone testing without a real session concept
change (it's just that now you need *some* session to reach any page).

**Role helper functions + Core Loop RLS (`ohm#5m8t2x6b`, Staff Auth 6C-2,
2026-08-29)**: first real RLS lockdown step. Four reusable SQL functions
now exist, foundational to every later 6C sub-step:
`current_staff_position()` (`SECURITY DEFINER`, resolves
`auth.uid() → staff.user_id → staff.position`, returns null gracefully
with no session — decoupled from `staff`'s own RLS so later tightening
there can't break every other table's role check), `is_staff()` (true for
any of the 8 loginable staff), `is_supervisor_or_above()`, `is_owner()`.
Applied to `clients`/`point_transactions`/`sales` — see
[[clients_state]]/[[points_ledger_state]]/[[sales_state]] for the
per-table policy detail. **Simulate Staff's DB-level role-spoofing is now
neutralized for these three tables**: a Front Desk session using Simulate
Staff to view as Owner gets Owner UI affordances but not real Owner DB
access, since RLS is now keyed off the real `auth.uid()` session, not the
client-side Simulate Staff selection. Simulate Staff itself is still
present and functional in the UI — removing it is still 6C-6.

## Not yet implemented — see roadmap

- RLS lockdown is partial — `clients`/`point_transactions`/`sales` are now
  real role-keyed policies (6C-2, above); `bookings`/`locker_occupancy`,
  `staff`/`action_logs`, and the Settings-domain tables
  (`services`/`promos`/`addons`/`rooms`/`lockers`/`weekend_slots`) are
  still the app-level-only `USING (true)` shape from prior phases, pending
  6C-3 through 6C-5. Simulate Staff's role-spoofing still works at the DB
  level for those remaining tables.
- No role-based route restriction at the proxy/middleware level (e.g.
  Front Desk being blocked from `/analytics` by `proxy.ts`) — still
  enforced only by the app-level `ownerOnly` pattern, per 6C-1's explicit
  scope. Planned for a later 6C sub-step alongside RLS.
- No edit, archive, or delete for staff records.
- See `docs/architecture/rbac.md` for the full deferred-auth picture.
