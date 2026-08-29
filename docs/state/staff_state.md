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

**Real actor attribution live (`ohm#4p7v9k3s`, Staff Auth 6B, 2026-08-29;
simplified to session-only in 6C-6)**: `user_id`/`auth.uid()` is the sole
identity source. `app/layout.tsx` resolves `auth.uid()` → `staff` row via
`user_id` and passes it into `StaffSimProvider` as `sessionStaff`.
`lib/staff-context.tsx` derives `currentStaff`/`currentRole` directly from
`sessionStaff` — every consumer of `useStaffSim()` (nav gating, Settings
role gates, every `action_logs` write) reflects the real logged-in staff
member. **Simulate Staff was removed entirely in 6C-6** (`ohm#8r5m1v7z`,
2026-08-29) — see below.

**RLS lockdown (`ohm#4t8w2j6q`, Staff Auth 6C-5, 2026-08-29)**: `staff`
now has role-keyed policies replacing the old `public_select`/
`public_insert` (`USING`/`WITH CHECK (true)`) pair from Core Loop.
`staff_select` — `is_staff()` (any of the 8 loginable staff; deliberately
broad, not restricted to Supervisor+, since `app/layout.tsx` reads `staff`
on every page load for every role to resolve `sessionStaff` — and
`clients`/`bookings`/`sales`/`logs` pages read it broadly too for
name/role display; the Staff Directory page's Owner-only visibility stays
app-level UI gating only, separate from this). At the time this policy
was written, `app/layout.tsx` also fetched the full active-staff list to
feed the Simulate Staff dropdown; that fetch was removed in 6C-6 once the
dropdown was — the policy stayed broad regardless, since the
`sessionStaff` lookup and the other pages' name/role reads independently
justify it.
`staff_insert` — `is_owner()` (matches the Owner-gated Add Staff modal).
No UPDATE/DELETE policy — no edit/archive/delete flow exists in the app
for staff, and this also means `user_id` (the auth-linkage column, set
only via `service_role` in 6A) can never be altered through app RLS.

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
- **Shared role-state context** (`lib/staff-context.tsx`, `ohm#3z8k1p6d`,
  extended by `ohm#4p7v9k3s` Staff Auth 6B, simplified in 6C-6
  `ohm#8r5m1v7z`): `StaffSimProvider`/`useStaffSim()` is the single source
  of truth for "who's acting" across the whole app. `sessionStaff` (from
  `auth.uid()` → `staff.user_id` in `app/layout.tsx`) is now the only
  identity source — `currentStaff`/`currentRole` derive directly from it,
  nullable only on `/login` before signing in (every other route is
  guaranteed a session by `proxy.ts`). `components/sidebar.tsx` reads
  `currentRole` from this context to hide the `Staff`/`Logs`/`Analytics`
  nav items (`lib/nav.ts`'s `ownerOnly` flag) unless `currentRole ===
  'Owner'`.
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
  last one so the root layout's `sessionStaff`/Owner-only gating input
  picks up new staff without a hard reload).
- **Log Visit / New Booking / Quick Walk-in modals**
  (`components/log-visit-modal.tsx`, `components/booking-form-modal.tsx`,
  `components/quick-walkin-modal.tsx`): as of the 6B-Addendum
  (`ohm#6y1d4h8m`, 2026-08-29), the "Logged by (staff)" / "Booked by
  (staff)" field is a **read-only label**, not a `<select>` — no manual
  actor selection inside any modal. Each resolves `actor = sessionStaff`
  (simplified in 6C-6 — no fallback, since these pages are protected
  routes and always have a session) and renders `{actor.name} ·
  {actor.position}` (or "—" while `actor` is momentarily null).
- **Persistent logout control**: `components/sidebar.tsx` (6B-Addendum,
  `ohm#6y1d4h8m`) now has an account block at the bottom of the sidebar,
  always visible. Session present: shows `{name} · {role}` and a "Sign
  out" button (posts to the existing `logout()` action in
  `app/login/actions.ts`). No session: shows a "Log in" link to `/login`.
  Previously the only sign-out path was `/login` itself.
- **`action_logs` attribution**: every write path (Settings, Sales,
  Lockers, Staff Directory, Bookings, Core Loop) attributes to the real
  logged-in staff member — the former
  `// TEMP: placeholder actor pending Staff Auth phase` comments (7 sites)
  are gone since 6B, and there is no non-session fallback left as of 6C-6.

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
per-table policy detail.

**Simulate Staff removed (`ohm#8r5m1v7z`, Staff Auth 6C-6, 2026-08-29)**:
with real RLS enforcing identity on every table (6C-2 through 6C-5) and
every route requiring a session (6C-1), the "view as" role-spoofing
dropdown in Settings had no real access to spoof and was removed
entirely — deleted from `settings-browser.tsx`, and
`lib/staff-context.tsx` simplified to derive `currentStaff`/`currentRole`
solely from `sessionStaff` (no simulated-staff fallback, no
`nxs_sim_staff_id` localStorage key, no `loginableStaff`/
`selectedStaffId`/`setSelectedStaffId`). This closes the entire
originally-scoped Staff Auth phase (6A through 6C-6). Full-system
regression pass (Front Desk/Supervisor/Owner, every phase) confirmed
clean — see `.ai/handoff.md`.

## Not yet implemented — see roadmap

- No role-based route restriction at the proxy/middleware level (e.g.
  Front Desk being blocked from `/analytics` by `proxy.ts`) — still
  enforced only by the app-level `ownerOnly` pattern, per 6C-1's explicit
  scope. Not a gap in practice: nav hides the item and the page itself
  DB-blocks via RLS, so this is defense-in-depth only.
- No edit, archive, or delete for staff records.
- See `docs/architecture/rbac.md` for the RBAC reference (update if it
  still describes deferred/placeholder auth).
