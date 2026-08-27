# Analytics — Current State

## Implemented

- `app/dashboard/page.tsx` — the closest thing to analytics today. Server
  component reading live counts (`count: "exact", head: true`) for:
  available therapists (`archived = false`), total active services, total
  active rooms, total active lockers. Rendered as 4 stat cards. Has a
  dedicated `app/dashboard/error.tsx` error boundary that logs the caught
  error and offers a "Try Again" reset button.
- `app/analytics/page.tsx` itself is a separate route from the dashboard
  and is an 8-line stub — "Coming soon." Do not confuse it with
  `app/dashboard`, which is the one with real data.

## Not yet implemented — see roadmap

- No revenue/sales analytics, no ledger analytics, no booking-volume
  analytics, no charts — none of this exists in `app/analytics` yet.
