# Analytics — Current State

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
flag — Staff/Logs picked it up first). `AnalyticsBrowser` has the same
page-level content guard as Staff Directory/Activity Logs
(`currentRole !== "Owner"` → blocking message), covering a direct URL visit.

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

- Staff Auth (app-level-only role gate remains, same gap as every other
  Owner-only page — see [[staff_state]]).
- Export/download of reports — not built, confirmed not wanted for this
  phase.
- No writes anywhere in this phase — pure read/aggregation.

## Not yet implemented

- Pagination for very large sales/booking volumes (flagged for revisit, not
  currently needed).
- Export/download.
