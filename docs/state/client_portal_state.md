# Client Portal — Current State

New domain, entirely separate from Staff Auth. Client accounts are NOT
staff accounts and share no session, role, or RBAC context with the staff
tier system. See ADR-001 "Client Portal (new)" for the full design intent.

## Implemented (7A-1, `ohm#7a1f9c2k`, 2026-08-29) — database layer only

No UI, no routes, no client-facing pages exist yet. This is schema-only.

- **`clients.phone`**: pre-existed this prompt (nullable `text`, no
  default) — not a new column. This prompt added a `clients_phone_key`
  UNIQUE constraint to it. No backfill was needed or attempted (verified
  live: the column was empty on the only existing client row). Classified
  as PII per ADR-001 — display default (masked, last 4 digits) and staff
  reveal flow are not built yet.
- **`client_portal_accounts`** (new table): `id`, `client_id` (FK →
  `clients`), `phone` (unique, not null), `pin_hash` (not null),
  `username` (unique, not null, system-fixed per ADR-001 — distinct from
  the client's Name, never encoded in a QR payload), `created_at`. RLS is
  **enabled with zero policies** — default-deny for every role, including
  staff, until a later prompt designs the real policy matrix (registration
  write path, staff read path for support/lookup, etc.). This matches the
  existing pattern already used by other tables with no consumer yet
  (`therapist_absence`, `therapist_day_off`, etc.) — confirmed via
  `get_advisors` showing only the expected "RLS enabled, no policy"
  info-level note.
- **Codename → Name relabel**: `COMMENT ON COLUMN clients.codename` only.
  The column name is unchanged — single free-text identity field, no
  legal-name column, per ADR-001's Client Identity amendment. No `.tsx`
  file was touched; every UI reference to `codename` (client search,
  Locker Board, Call Sheet, receipts, booking/sales modals — grepped
  repo-wide, 20+ call sites) is deferred to a separate follow-up prompt
  given the regression risk called out explicitly in 7A-1's scope.
- **`app_settings.allow_receptionist_manual_points`**: see
  [[settings_state]] — no generic settings table existed before this
  prompt, so a new minimal singleton table was created rather than
  extending an existing store.
- **`action_logs` `phone_number_revealed` event type**: no schema change —
  `action_logs.action` is plain `text`, not an enum. This is a convention
  future writers must follow (`action = 'phone_number_revealed'`,
  `staff_id` = revealing staff, `created_at` = timestamp, target client id
  goes in the nullable `detail` text column, matching how every other
  event type already encodes extra context). See [[logs_state]].

## Not yet implemented — see roadmap

- Master QR generation (static, non-expiring registration entry point).
- Registration UI (phone + PIN + Name submission, existing-client match
  by phone vs. new client creation).
- Login UI for the client portal.
- Member QR (per-account, permanent, client-side) and its `log_visit` RPC
  lookup path — additive only, the existing RPC contract/atomicity/ledger
  triggers are untouched by this prompt.
- Phone masking/reveal UI and the actual `phone_number_revealed` logging
  call site.
- RLS policies on `client_portal_accounts` (currently default-deny for
  everyone, including staff).
- Manual points entry UI gated by `allow_receptionist_manual_points`
  (uses the existing `ADJUSTMENT` ledger entry type — no new entry type,
  no ledger schema change, per ADR-001).
