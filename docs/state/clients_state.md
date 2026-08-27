# Clients — Current State

## Implemented

- `app/clients/page.tsx` — server component, real. Queries
  `clients` table for `id, codename, username, member_code, points_balance`,
  ordered by `codename` ascending, plus active `services` and active `staff`
  (both passed down for the Log Visit modal). Renders
  `components/client-browser.tsx` (client component): a pill list of clients
  + a detail panel for the selected one showing codename, username, member
  code, points balance, a "Eligible for Reward" badge when
  `points_balance >= 100` (constant `REWARD_THRESHOLD` in that component —
  not DB-driven, hardcoded in the UI), and a last-10 "Recent Activity" list
  read live from `point_transactions` on selection change.
- Error/empty states handled inline (query error message, "No clients yet.").
- **Log Visit (Core Loop `ohm#7f3k9d2m`)** — "Log Visit" button in the
  detail panel opens `components/log-visit-modal.tsx`: service select
  (drives points earned), a redemption toggle (disabled below 100 pts),
  payment method + amount, and a staff picker
  (`// TEMP: placeholder actor pending Staff Auth phase` — grep this
  comment when Staff Auth ships). Submits via the `logVisit` server action
  (`app/clients/actions.ts`) into `public.log_visit(...)`; see
  [[points_ledger_state]] for the write path. On success the modal closes,
  the activity list refetches, and `router.refresh()` re-pulls the server
  component's `points_balance`.

## Schema (`public.clients`)

Columns: `id`, `codename` (not null — the only display identity), `username`
(not null), `member_code` (not null), `password_hash` (nullable),
`points_balance` (default-managed, not null), `phone`, `email`,
`birth_day`/`birth_month` (checked 1–31 / 1–12), `investor` (bool),
`privacy_consent` (bool), `qr_token`, `since_date`, `created_at`.

No legal-name column exists. No companion/tagging construct exists.

## RLS

`clients` has row-level security enabled. Public-select access was added
then explicitly locked down (migrations `add_public_select_policies_...`
then `12_lock_down_clients_public_select`), then re-added narrowly by Core
Loop (`core_loop_rls_policies`: `public_select`, `SELECT`, `USING (true)`)
so the anon client can read the Client Profile page and the Log Visit
modal's staff/service pickers. **No UPDATE policy exists on `clients` and
none was added** — `points_balance` only ever changes via the
`SECURITY DEFINER` trigger described in [[points_ledger_state]], never a
direct client-side update. Check the current policy definition directly in
Supabase before assuming what's readable/writable by the anon client; do
not assume it matches an older migration in isolation.

## Not yet implemented — see roadmap

- Client creation/edit UI (no insert/update path in the app).
- QR-based lookup/check-in flow (schema has `qr_token`, no UI consumes it).
- Client-facing mobile app (referenced by schema shape, not in this repo).
- Squad Goals / companion features (mentioned in project framing, no schema
  or UI backing exists at all).
