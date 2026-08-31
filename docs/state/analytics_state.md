# Analytics — Current State

## Implemented (`ohm#4k7n2wc9`, 2026-08-31)

Restructured `components/analytics-tabs.tsx` from Overview/Commission into
**five top-level tabs: Sales | Most Availed Services | Top Clients | Top
Thera | Commission** (Commission keeps its existing Rates/Report sub-tabs,
unchanged from `ohm#8x2m4tqz`). Pure tab-shell/render refactor — the shared
`useMemo` in `components/analytics-browser.tsx` (spa-day bucketing, all
sums/rankings) is byte-for-byte unchanged; only which section renders per
tab changed, via a new `section` prop
(`"sales" | "most-availed" | "top-clients" | "top-thera"`). Owner-only
gating (`useStaffSim`/`currentRole`) moved up to `AnalyticsTabs` (one
blocking message for the page instead of one per section) — same check,
just relocated.

- **Sales tab**: the old "Sales" + "Client Visits" stat cards, plus a Per
  Day/Per Month toggle switching between the already-computed
  `salesPerDay`/`salesPerMonth` tables (previously both shown stacked).
- **Most Availed Services / Top Clients / Top Thera tabs**: each is the
  corresponding old section (`serviceRanking`/`topClients`/
  `therapistRanking`) rendered alone. "Top Thera" is the renamed
  "Therapist Ranking" section — same data/ranking logic.
- **Top Thera → Commission deep link**: each Top Thera row has a "View
  Commission →" button (`therapistRanking` map entries gained an `id`
  field to support this — ranking values/order unchanged). Clicking it
  switches the top tab to Commission, the sub-tab to Report, and passes a
  `filterTherapist: {id, name}` into `CommissionReportBrowser`, which
  auto-generates the report for its current default range and filters the
  already-returned rows to that therapist client-side (no new query, no
  route change). A "Filtering: {name} ×" chip clears it back to the full
  report.

### Discrepancy found and resolved before coding

The prompt (`ohm#4k7n2wc9`) described Commission as a net-new tab —
formula `sales.amount × commission_rates.percent` joined via
`sales.service_id`/`sales.created_at`, with "no admin UI for
`commission_rates`" listed as out of scope. Both were stale: Commission
(Rates + Report sub-tabs) had already shipped the same day
(`ohm#4k8t2wq9`/`ohm#8x2m4tqz` — see [[commission_state]]), and the live
Report's actual formula is **`bookings`** (`Booked`/`Completed` status,
filtered by `booking_date`) × `services.price` × `percent` — not a
`sales`-based join at all. Flagged to the user before any code was
written; decision was to keep the shipped bookings-based formula and fold
the existing Commission tab into the new layout unchanged rather than
rebuilding it to match the prompt's (outdated) spec.

## Implemented (`ohm#8x2m4tqz`, 2026-08-31)

Commission tab gained a second sub-tab, "Report", sibling to "Rates"
(`components/analytics-tabs.tsx`). Full behavior in [[commission_state]] —
this page's own fetch (`app/(staff)/analytics/page.tsx`) is untouched;
Report fetches on demand via its own server action.

## Implemented (`ohm#4k8t2wq9`, 2026-08-31)

Analytics gained its first tab strip (`components/analytics-tabs.tsx`):
"Overview" (everything below in this file, unchanged) and "Commission" →
"Rates". The Commission module (schema + Rates settings UI) has its own
state file — see [[commission_state]] — since it's a distinct owner-only
feature (`commission_rates` table) layered on top of this page rather than
a new stat/aggregation. `app/(staff)/analytics/page.tsx` now also fetches
commissionable services + their active rates alongside the existing
sales/bookings fetch.

## Implemented (`ohm#7v2q8f5c`, 2026-08-28)

Owner-only reporting dashboard at `/analytics` (`app/analytics/page.tsx`,
`components/analytics-browser.tsx`), replacing the prior 8-line stub. Read-only
aggregation across `sales`, `bookings`, `clients`, `therapists` — no new
mutation paths, no new RLS (all four tables already had public SELECT from
prior phases).

### Spa-day bucketing — canonical definition

`lib/analytics/spa-day.ts` is the one shared helper for every date-bucketed
stat/table in this phase (Sales Today/7-day/Month, Client Visits
Today/7-day/Month, Sales Per Day, Sales Per Month). Do not reimplement this
logic elsewhere — import `toSpaDay`/`toSpaMonth`/`spaDayNow`/`spaMonthNow`/
`lastSpaDays`.

- **Rule**: the spa runs from open (4:30 PM, matching the operating hours
  already established in `lib/bookings/slots.ts` — the prompt that
  commissioned this phase said 4:00 PM, corrected to 4:30 PM for consistency
  with the one existing operating-hours definition in the codebase; the
  correction is cosmetic only, see below) through last call (1:00 AM). A
  timestamp does NOT reset to a new spa-day at midnight.
  - Local time (Asia/Manila) 4:00 PM–11:59 PM → spa-day = that calendar date
  - Local time 12:00 AM–3:59 PM → spa-day = the previous calendar date
- **Why the 4:00 vs 4:30 PM correction doesn't change the formula**: the
  rollover boundary that actually matters is the 12:00 AM–3:59 PM window
  rolling back to the prior date. Nothing operationally happens between
  4:00–4:30 PM (the spa isn't open yet either way), so which exact hour is
  called "opening" doesn't move any sale into a different bucket.
- **Implementation**: Asia/Manila is a fixed UTC+8 offset (no DST), so
  "shift a UTC timestamp to Manila local time, then roll back 16 hours so the
  12AM–3:59PM window lands on the prior date" reduces to one subtraction: take
  the raw UTC instant, subtract 8 hours, and read off the UTC calendar
  date/month of the result. That's the entire implementation of `toSpaDay`/
  `toSpaMonth` — no timezone library, no lookup table.
- **This is the first and only "operating day"/"spa-day" concept in the
  codebase** — confirmed via ADR-001 and a grep before writing it. Future
  phases needing day-bucketed reporting should reuse this helper rather than
  inventing a second definition.

### Stats and rankings

- **Sales** (Today / Last 7 Days / This Month): sum of `sales.amount` where
  `voided = false`, bucketed by spa-day/spa-month.
- **Client Visits** (Today / Last 7 Days / This Month): count of non-voided
  `sales` rows, same buckets. Confirmed `sales` alone is the correct,
  non-double-counting visit definition — both `logVisitBooking` and
  `quick_walkin()` unconditionally write one `sales` row per visit;
  `point_transactions` is conditional/linked to a sale and would double-count
  if also counted.
- **Most Availed Service**: ranked count of `services.name` across all
  non-voided sales, joined via `sales.service_id`.
- **Sales Per Day / Sales Per Month**: tables of amount + visit count per
  spa-day/spa-month bucket, most recent first.
- **Top Clients**: ranked by total non-voided spend among sales with a
  non-null `client_id` (walk-ins are excluded — they have no client to rank
  against), showing visit count and `clients.points_balance` read directly
  (no ledger recomputation).
- **Therapist Ranking**: count of `bookings` with `status` in
  (`Booked`, `Completed`) per `therapist_id`, archived therapists
  (`therapists.archived = true`) tagged "(Archived)" per ADR-001's archive
  convention.

### Gating

Owner-only, reusing the exact existing `lib/staff-context.tsx`
(`useStaffSim`/`currentRole`) mechanism — no new gating pattern. `lib/nav.ts`'s
`analytics` entry now carries `ownerOnly: true` (the last nav item to gain the
flag — Staff/Logs picked it up first). As of `ohm#4k7n2wc9`'s tab restructure,
the page-level content guard (`currentRole !== "Owner"` → blocking message)
lives on `AnalyticsTabs` (was `AnalyticsBrowser`) — one blocking message for
the whole page instead of one per tab section — still covering a direct URL
visit the same way.
As of Staff Auth 6C-6 this is real, identity-keyed access control — `sales`/
`bookings`/`clients`/`therapists` RLS SELECT all require `is_staff()`
(6C-2/6C-3), so a non-authenticated caller sees no rows regardless of app-level
gating, and Owner-only enforcement is app-level UI gating on top of that.

### Data fetch

Single Server Component fetch in `app/analytics/page.tsx`: all `sales` rows
(embedded-joined to `services(name)`, `clients(codename, points_balance)`) and
`bookings` rows with status Booked/Completed (embedded-joined to
`therapists(name, archived)`). Shaped into flat objects server-side (same
pattern as `app/sales/page.tsx`), then all bucketing/aggregation happens
client-side in one `useMemo` in `components/analytics-browser.tsx`. No
pagination — current row counts are small; revisit if that changes (same
flagged pattern as Activity Logs' `LIMIT 500`).

### Explicitly out of scope

- Export/download of reports — not built, confirmed not wanted for this
  phase.
- No writes anywhere in this phase — pure read/aggregation.

## Not yet implemented

- Pagination for very large sales/booking volumes (flagged for revisit, not
  currently needed).
- Export/download.
