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

**Real role-based RLS as of Staff Auth 6C-2 (`ohm#5m8t2x6b`, 2026-08-29)**:
the prior `public_select` (`USING (true)`) policy is gone. `clients` now
has `staff_select` (`SELECT`, `USING (is_staff())`) and `staff_insert`
(`INSERT`, `WITH CHECK (is_staff())`) — both keyed off the new
`is_staff()` helper (`auth.uid() → staff.user_id → staff.position`, true
for any of the 8 loginable staff, false/no-error with no session). Only a
real authenticated session grants access — there is no client-side role
selector left in the app to spoof (Simulate Staff was removed in 6C-6).
**No UPDATE policy
exists on `clients` and none was added** — confirmed no client field has
an editable path anywhere in the app; `points_balance` only ever changes
via the `SECURITY DEFINER` trigger described in [[points_ledger_state]],
never a direct client-side update. No DELETE policy. Smoke-tested via a
rolled-back transaction simulating `auth.uid()` as anon/Front
Desk/Supervisor/Owner before applying live — see [[staff_state]] for the
full helper-function and cross-table detail. Check the current policy
definition directly in Supabase before assuming what's readable/writable;
do not assume it matches an older migration in isolation.

## Not yet implemented — see roadmap

- Client creation/edit UI (no insert/update path in the app).
- QR-based lookup/check-in flow (schema has `qr_token`, no UI consumes it).
- Client-facing mobile app (referenced by schema shape, not in this repo).
- Squad Goals / companion features (mentioned in project framing, no schema
  or UI backing exists at all).
