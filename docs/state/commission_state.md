# Commission — Current State

## Implemented (`ohm#4k8t2wq9`, 2026-08-31) — Schema + Rates Settings UI

Owner-only Therapist Commission module. This phase covers **schema and the
Rates settings screen only** — the Report UI (date range, cutoff computation)
is a separate, not-yet-built follow-up.

### Schema

- `services.requires_therapist boolean not null default true` — new column.
  No prior field/relationship distinguished "requires a therapist" vs
  "facility/room-only" at the service level (`bookings.therapist_id` is
  nullable, but that's a per-booking runtime fact, not a service-level
  property). Backfilled `false` for the Wet Area row only; every other
  service defaults `true`. This is the only structural definition of
  "commissionable service" — the commission module filters on it, not on
  service name.
  - **Not yet wired into**: `components/booking-form-modal.tsx` (still uses
    `selectedService?.name !== "Wet Area"`) or the Call Sheet's Wet Area
    exclusion (still name-based). Both were explicitly out of scope for
    this prompt. A future task could migrate them to
    `requires_therapist` instead, but doing so was not requested and not
    done here.
- `commission_rates` (`supabase/migrations/20260831063000_commission_rates.sql`):
  `id, service_id (FK → services), percent numeric, effective_from
  timestamptz default now(), effective_to timestamptz nullable, is_active
  boolean, created_by (FK → staff), created_at`. Effective-dated,
  append-only — same philosophy as `point_transactions`: no RLS policy
  permits updating `percent` in place. Editing a rate closes the current
  row (`effective_to = now(), is_active = false`) and inserts a new one,
  both in `setCommissionRate()` (`app/(staff)/analytics/actions.ts`).
- RLS: `owner_select` / `owner_insert` / `owner_update`, all gated on
  `is_owner()`. Owner-only feature end to end — no Supervisor/Front Desk
  read or write, unlike `services`/`promos`/`addons` which allow staff-wide
  SELECT.

### UI — Analytics > Commission > Rates

- `app/(staff)/analytics/page.tsx` fetches commissionable services
  (`requires_therapist = true, active = true`) and their currently-active
  `commission_rates` row, joins them client-side by `service_id`.
- `components/analytics-tabs.tsx`: Analytics' first tab strip — "Overview"
  (unchanged `AnalyticsBrowser`) and "Commission" (currently just renders
  "Rates" — no sub-tab strip yet since Report doesn't exist).
- `components/commission-rates-browser.tsx`: one row per commissionable
  service — name, current rate % or "Not set" (checked via `!== null`, so
  a real `0%` rate still displays as `0%`, not "Not set"), "Effective
  since" date, inline Edit → input + Save/Cancel. Same Owner-only content
  guard as `AnalyticsBrowser`.
- Query-driven: a new service inserted anywhere else in the app with the
  column's default `requires_therapist = true` appears in this list
  automatically — no code change needed.

### Explicitly out of scope for this phase

- Report UI, date range picker, commission cutoff computation.
- Any change to how bookings/sales pick a therapist or compute amounts.
- Wet Area booking flow.

## Not yet implemented

- Report UI (separate prompt).
- Migrating `booking-form-modal.tsx`/Call Sheet's Wet Area check from
  name-based to `requires_therapist`-based (not requested yet).
