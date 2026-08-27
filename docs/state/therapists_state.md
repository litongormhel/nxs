# Therapists — Current State

## Implemented (DB level)

`public.therapists`: `id`, `name`, `archived`/`archived_at`/`archived_by`/
`archived_reason` (soft-archive pattern, not hard delete).

Availability/scheduling support tables:
- `therapist_absence` (one-off dated absences)
- `therapist_leave` (date-range leave, `end_date >= start_date` checked)
- `therapist_day_off` (recurring weekday off, `weekday` 0–6 checked)
- `therapist_services` (join table: which services a therapist can perform)

## Implemented (app level)

`app/dashboard/page.tsx` reads a live count of `therapists` where
`archived = false` ("Available Therapists" card) — this is the only current
app-level read of this table.

## Not yet implemented — see roadmap

- `app/therapists/page.tsx` is an 8-line stub. No roster UI, no
  absence/leave/day-off management, no service-assignment UI exists yet.
