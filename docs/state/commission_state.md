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

- Any change to how bookings/sales pick a therapist or compute amounts.
- Wet Area booking flow.

## Implemented (`ohm#8x2m4tqz`, 2026-08-31) — Report UI

Owner-only Report sub-tab, sibling to Rates inside the same Commission tab.
No schema/migration in this phase — confirmed unnecessary during the
mandatory live-schema check (see below).

### Live-schema findings (before writing any query)

Confirmed directly against project `zqwiqrvqyinacjozubtc`:

- `bookings.booking_date` is `date` — a staff-assigned operating day set at
  booking-creation time (`app/(staff)/bookings/actions.ts`), **not** derived
  from a timestamp. This means it is already at spa-day granularity; no
  per-row spa-day conversion is needed to filter bookings by date range —
  `booking_date BETWEEN start AND end` is correct as-is.
- `commission_rates.effective_from`/`effective_to` are `timestamptz` (exact
  moment a rate was saved/closed).
- No index exists on `bookings.booking_date`, `bookings.service_id`,
  `bookings.therapist_id`, or `commission_rates.service_id`/`effective_from`
  (checked via `pg_indexes`). Left as-is per explicit decision — matches
  Overview's existing unpaginated full-fetch pattern; revisit only if data
  volume becomes a real problem.

### Query/aggregation logic

- `getCommissionReport(startDate, endDate)` in
  `app/(staff)/analytics/actions.ts`. Fetches `bookings` in the date range
  with `status IN ('Booked', 'Completed')` (Cancelled/No-show excluded —
  they never generated revenue) and `therapist_id IS NOT NULL`, joined to
  `services`/`therapists`; filters to `services.requires_therapist = true`
  client-side.
- **Historical rate lookup**: because `effective_from`/`effective_to` are
  exact-moment `timestamptz` and `booking_date` is a plain `date`, a raw
  Postgres implicit cast (date → midnight UTC) would be off by 8 hours from
  the actual spa-day boundary and could misattribute a rate at a rate-change
  edge. Decided fix: bucket both `commission_rates.effective_from` and
  `effective_to` to spa-day via the existing `toSpaDay()` helper
  (`lib/analytics/spa-day.ts`) before comparing them as calendar-date
  strings against `booking_date` — reuses the canonical spa-day utility
  rather than introducing a second date-bucketing rule.
- A service with no rate configured for the relevant period still counts
  toward that therapist's bookings/total; its commission contribution is 0
  with a `rateNotSet` flag surfaced as a "(Not set)" chip in the UI
  breakdown — never silently dropped, never defaulted to a guessed percent.
- Aggregates per therapist: bookings count, per-service breakdown (name +
  count), total (Σ `services.price` across all lines), commission
  (Σ `price × percent / 100` across all lines). Grand total row across all
  therapists.

### UI — Analytics > Commission > Report

- `components/commission-report-browser.tsx`: same Owner-only guard pattern
  as `CommissionRatesBrowser`. Date-range inputs + cutoff presets (1–15 /
  16–EOM / Custom, defaults computed off `spaMonthNow()`/`spaDayNow()`),
  "Generate" button, ledger table (Therapist | Bookings | Breakdown chips |
  Total | Commission) with a grand-total footer row. Same design tokens as
  `commission-rates-browser.tsx`.
- `components/analytics-tabs.tsx` gained a Rates/Report sub-tab strip inside
  the Commission tab (previously hardcoded to show only Rates).
- `app/(staff)/analytics/page.tsx` untouched — Report fetches on demand via
  its own server action rather than the page's initial `Promise.all`, so
  page load stays light.

### Explicitly out of scope for this phase

- CSV/PDF export.
- Rates tab, `setCommissionRate`, `commission_rates` write logic — read-only
  reference only.

## Not yet implemented

- CSV/PDF export (not requested).
- Migrating `booking-form-modal.tsx`/Call Sheet's Wet Area check from
  name-based to `requires_therapist`-based (not requested yet).
