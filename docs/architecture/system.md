# System Architecture

## Three-domain separation

- **Points Ledger** (`point_transactions`) — append-only, immutable via
  DB trigger. Source of truth for a client's point balance
  (`clients.points_balance` is kept in sync by `apply_points_delta()`).
- **Bookings** (`bookings`) — scheduling domain, DB-enforced conflict
  prevention via GiST exclusion constraints. Independent lifecycle from
  sales (a booking can exist with no sale, e.g. cancelled/no-show).
- **Sales** (`sales`, `sale_addons`) — POS/transaction domain, mutable
  (editable, voidable with audit columns). Cross-references bookings and
  the ledger only via optional FKs (`sales.booking_id`,
  `point_transactions.sale_id`) — never merged.

Supporting domains: `clients` (identity/loyalty), `therapists` +
`therapist_absence`/`therapist_day_off`/`therapist_leave`/`therapist_services`
(roster + availability), `rooms`/`lockers`/`locker_occupancy` (capacity),
`staff` + `loginable_staff` view (personnel), `action_logs` (audit),
`promos`/`addons`/`services` (catalog).

## Tech stack

- **Frontend**: Next.js App Router, TypeScript, Tailwind. Single root
  layout (`app/layout.tsx`) with a persistent `Sidebar` and per-route pages
  under `app/<module>/page.tsx`.
- **Data**: Supabase Postgres 17, accessed via `@supabase/ssr`:
  - `lib/supabase/server.ts` — server component client, cookie-backed, anon key.
  - `lib/supabase/client.ts` — browser client, anon key.
  - Both are RLS-governed reads, not service-role bypasses.
- **Types**: `lib/types/database.ts` is Supabase-generated; regenerate via
  the Supabase tooling rather than hand-editing when the schema changes.
- **Hosting**: Vercel (`vercel.json` at repo root).

## Current implementation footprint

Only two routes have real behavior: `app/dashboard` (live counts from
`therapists`/`services`/`rooms`/`lockers`) and `app/clients` (client list +
selectable detail panel via `components/client-browser.tsx`). All other
routes (`bookings`, `sales`, `therapists`, `staff`, `logs`, `analytics`,
`settings`, `lockers`, `call-sheet`) are placeholder stubs rendering
"Coming soon." — see the corresponding `docs/state/*.md` file for each.

`app/page.tsx` is a client-side redirect to `/dashboard` (chosen to avoid a
prerendering issue — see git history around commit `b959547`).
`app/dashboard/error.tsx` provides an error boundary specific to the
dashboard route.
