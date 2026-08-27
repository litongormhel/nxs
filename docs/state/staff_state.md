# Staff — Current State

## Implemented (DB level)

`public.staff`: `id`, `name`, `position` (enum `staff_position`:
`Receptionist`/`Attendant`/`Supervisor`/`Owner`/`Others`), `active`,
`comment`, `user_id` (nullable — link point to Supabase Auth, unused so
far), `created_at`.

`public.loginable_staff` — a view over `staff` (same shape), presumably
intended to filter to staff with an auth identity once auth exists. As of
now nothing in the app queries this view.

## Implemented (app level, Core Loop `ohm#7f3k9d2m`)

- First app-level consumer of this table: the Log Visit modal
  (`components/log-visit-modal.tsx`) queries active `staff` for a manual
  "Logged by" picker, standing in for a real authenticated actor — see the
  `// TEMP: placeholder actor pending Staff Auth phase` comment there and
  in `app/clients/actions.ts`. The selected `staff.id` is written to
  `point_transactions.processed_by`, `sales.processed_by`, and
  `action_logs.staff_id`. This is read-only from `staff`'s perspective; no
  roster UI or staff CRUD exists.
- RLS: `anon` has a `SELECT` policy (`public_select`, `USING (true)`) added
  by Core Loop so this picker can populate. No INSERT/UPDATE/DELETE policy.

## Not yet implemented — see roadmap

- `app/staff/page.tsx` is an 8-line stub. No roster UI, no staff CRUD.
- No auth flow anywhere — `user_id` is never populated or read by app code.
- See `docs/architecture/rbac.md` for the full deferred-auth picture.
