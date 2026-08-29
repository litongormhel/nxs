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
- `app/(staff)/therapists/page.tsx` (`TherapistBrowser` component,
  `components/therapist-browser.tsx`) implements the full HTML mockup
  parity:
  - Default 10 therapists matching mockup (`Ron`, `Don`, `Tristan`, `Leo`, `Roy`, `Xander`, `Dan`, `Marco`, `Akio`, `Josh`) — only used as a fallback if the live `therapists` table is empty; all 10 exist live.
  - Interactive Date (defaults to the device's real local date, via a local-time `todayISO()` — not `toISOString()`, which is UTC and drifts a day off near local midnight), Time (`16:00` to `01:00`), and Availability filters (`Select All`, `Available`, `Booked`), plus `Show Archived` toggle.
  - **Weekly Day(s) Off toggle pills (`Sun`–`Sat`) — real Supabase persistence** (`ohm#7k2m9x4p`, 2026-08-30): writes through `app/(staff)/therapists/actions.ts` (`toggleDayOff`) to `therapist_day_off`, keyed by real therapist `id` (component holds a `therapistIds`: name→id map alongside the existing name-keyed `therapistMeta`, updated on rename). Page-level fetch now selects `therapists.id` (not just `name`) and joins `therapist_day_off` to seed initial state. RLS: `staff_select`/`staff_insert`/`staff_delete` on `therapist_day_off` (`is_staff()` read, `is_supervisor_or_above()` write) — see RLS section below, this table had **no policies at all** before this fix. Services Offered toggle pills (`Combi Massage`, `Signature Massage`, `Scrub`) remain **local-state only**, not persisted — out of this fix's scope, unchanged.
  - Kebab dropdown menu on each therapist card supporting `Mark Absent Today`, `Mark On Leave`, `Archive`, `Unarchive`, and `Edit` (rename) — **fixed** (`ohm#7k2m9x4p`, 2026-08-30): the menu's actions themselves were already correctly wired, but a `document`-level click-outside-to-close listener closed the menu in the same tick it opened, because it and React's own delegated click listener are both attached to `document` in this React/Next version — a sibling listener on the same node isn't stopped by `e.stopPropagation()`. Fixed by having the close listener explicitly skip clicks that land inside a `data-kebab-root`-marked wrapper instead of relying on `stopPropagation()`. These 4 actions (plus Add Therapist) remain **local-state only, not persisted** — intentional per this fix's scope; only day-off writes through.
  - Add Therapist modal, Daily Schedule modal, Mark On Leave modal, Archive modal, and Edit Name modal with toast feedback — all local-state only (not persisted), unchanged.

## RLS

`therapist_day_off`: `staff_select` (`is_staff()`), `staff_insert`/`staff_delete` (`is_supervisor_or_above()`) — added `ohm#7k2m9x4p`, 2026-08-30 (`20260830000000_therapist_day_off_rls.sql`), matching the identity-keyed pattern from Settings' catalog RLS. `therapists` itself still has only a `public_select` (`using (true)`) policy from the baseline snapshot — no INSERT/UPDATE/DELETE policy exists, so Add/Archive/Edit-rename remain local-only until a future prompt wires them through (not in this fix's scope). `therapist_leave`/`therapist_absence`/`therapist_services` still have RLS enabled with **no policies at all** (same baseline-snapshot gap) — flagged, not fixed, since Mark On Leave/Archive/Services Offered are explicitly local-only stubs for now.
