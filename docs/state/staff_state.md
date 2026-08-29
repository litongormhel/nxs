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
now. **This linkage is currently inert**: nothing in the app reads
`staff.user_id` or checks `auth.uid()` against it yet — see "Not yet
implemented" below.

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
  a Sign Out button (`logout()` action → `supabase.auth.signOut()`).
  **Entirely standalone**: not linked to `lib/staff-context.tsx`, not
  linked to any nav/role gating, no protected routes reference it. Logging
  in via `/login` currently has zero effect on the rest of the app —
  Simulate Staff (below) remains the only thing driving role-based UI
  anywhere. This is intentional 6A scope; wiring the real session into
  `staff-context`/actor-attribution is 6B, protected routes are 6C — both
  not yet started, see `.ai/handoff.md`.
- **Shared role-state context** (`lib/staff-context.tsx`,
  `ohm#3z8k1p6d`): `StaffSimProvider`/`useStaffSim()` is now the single
  source of truth for "who's simulated" across the whole app — replaces
  the Settings-local `useState` version that existed from the Settings
  phase (`ohm#6j2v9s4k`) through `ohm#5x1p8m3v`. Seeded from a
  server-fetched active-staff list in `app/layout.tsx` (now `async`).
  Selection persists to `localStorage` (`nxs_sim_staff_id`) so it
  survives full page navigation. `components/sidebar.tsx` reads
  `currentRole` from this context to hide the `Staff`/`Logs` nav items
  (see `lib/nav.ts`'s `ownerOnly` flag) unless `currentRole === 'Owner'`.
  `components/settings-browser.tsx`'s Simulate Staff dropdown now reads
  and writes this shared context instead of local state — same UI/
  options, just no longer siloed to the Settings page.
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
- Log Visit modal (`components/log-visit-modal.tsx`) still queries active
  `staff` for its own separate "Logged by" picker — see the `// TEMP:
  placeholder actor pending Staff Auth phase` comment there. This is
  independent of the shared `staff-context.tsx` mechanism and was not
  touched by `ohm#3z8k1p6d`.

## Not yet implemented — see roadmap

- `user_id` is now populated for 8 staff (see above) but still never
  **read** by app code — no `auth.uid()` check anywhere, no session-aware
  gating, no protected routes. The login page exists but authenticating
  has no effect on what a signed-in user can see or do.
- Actor-attribution (`action_logs`) still uses the placeholder
  staff-picker pattern (`// TEMP: placeholder actor pending Staff Auth
  phase`), not the real authenticated user — planned for 6B.
- No edit, archive, or delete for staff records.
- See `docs/architecture/rbac.md` for the full deferred-auth picture.
