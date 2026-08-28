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

- `app/dashboard/page.tsx` reads a live count of `therapists` where `archived = false` ("Available Therapists" card).
- `app/therapists/page.tsx` (`TherapistBrowser` component) implements the full HTML mockup parity:
  - Default 10 therapists matching mockup (`Ron`, `Don`, `Tristan`, `Leo`, `Roy`, `Xander`, `Dan`, `Marco`, `Akio`, `Josh`).
  - Interactive Date, Time (`16:00` to `01:00`), and Availability filters (`Select All`, `Available`, `Booked`), plus `Show Archived` toggle.
  - Interactive Weekly Day(s) Off toggle pills (`Sun`–`Sat`) and Services Offered toggle pills (`Combi Massage`, `Signature Massage`, `Scrub`).
  - Kebab dropdown menu on each therapist card supporting `Mark Absent Today`, `Mark On Leave`, `Archive`, `Unarchive`, and `Edit` (rename).
  - Add Therapist modal, Daily Schedule modal, Mark On Leave modal, Archive modal, and Edit Name modal with toast feedback.
