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
  `components/quick-walkin-modal.tsx`) each still have their own local
  "Logged by (staff)" `<select>`, independent of the shared
  `staff-context.tsx` mechanism (discovered during 6B's enumeration, not
  present in the 6A/prior state). As of 6B, each defaults its selection to
  `useStaffSim().sessionStaff?.id` when a real session exists, falling
  back to the prior first-staff-member default otherwise — the dropdown
  itself remains, as an editable override, confirmed with the user rather
  than removed.
- **`action_logs` attribution**: every write path (Settings, Sales,
  Lockers, Staff Directory, Bookings, Core Loop) now genuinely attributes
  to the real logged-in staff member when one exists, and to the
  Simulate Staff selection otherwise — the former
  `// TEMP: placeholder actor pending Staff Auth phase` comments (7 sites)
  are gone; the value they annotated is the same code path, now backed by
  real identity when available.

## Not yet implemented — see roadmap

- No protected routes — pages remain reachable without logging in
  (intentional through 6C; not-logged-in visitors still get full access,
  gated only by Simulate Staff exactly as before 6B).
- No RLS lockdown — every table's policies are still the app-level-only
  `USING (true)` shape from prior phases; `auth.uid()` is read by the app
  but not yet enforced at the DB layer. Simulate Staff's role-spoofing
  therefore still works at the DB level too, by design until 6C.
- No edit, archive, or delete for staff records.
- See `docs/architecture/rbac.md` for the full deferred-auth picture.
