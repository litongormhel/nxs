# Staff — Current State

## Implemented (DB level)

`public.staff`: `id`, `name`, `position` (enum `staff_position`:
`Receptionist`/`Attendant`/`Supervisor`/`Owner`/`Others`), `active`,
`comment`, `user_id` (nullable — link point to Supabase Auth, unused so
far), `created_at`.

`public.loginable_staff` — a view over `staff` (same shape), presumably
intended to filter to staff with an auth identity once auth exists. As of
now nothing in the app queries this view.

RLS: `anon` has both `SELECT` (`public_select`, `USING (true)`, added by
Core Loop) and `INSERT` (`public_insert`, `WITH CHECK (true)`, added by
`ohm#3z8k1p6d`) policies. No UPDATE/DELETE policy — no edit/archive/delete
flow exists in the app for staff.

## Implemented (app level)

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

- No auth flow anywhere — `user_id` is never populated or read by app code.
- No edit, archive, or delete for staff records.
- See `docs/architecture/rbac.md` for the full deferred-auth picture.
