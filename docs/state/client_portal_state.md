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
  `clients`), `phone` (unique, not null), `pin_hash` (not null; **replaced
  by `password_hash` in 7A-3, see below**), `username` (system-fixed per
  ADR-001 at the time — distinct from the client's Name, never encoded in
  a QR payload; **became user-chosen in 7A-3**), `created_at`. RLS is
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

## Implemented (7A-2, `ohm#4m8x1v6q`, 2026-08-29) — Master QR & registration/login

Client-facing surface, entirely separate route tree and session from the
staff app. No points/history/promos views yet — that's later scope.

- **Route isolation**: `app/portal/*` excluded from the staff session gate
  in `proxy.ts` (early return before the staff-auth check). Its layout
  (`app/portal/layout.tsx`) has no dependency on `lib/staff-context.tsx`
  or the staff `Sidebar`. This required moving every existing staff route
  into `app/(staff)/` with its own layout, since the old root
  `app/layout.tsx` unconditionally wrapped all children in the staff
  Sidebar — see `.ai/handoff.md` for the full rationale; staff route URLs
  are unchanged.
- **Registration** (`app/portal/register/page.tsx` →
  `app/portal/api/register/route.ts`): Phone + PIN + Name. Matches
  `clients.phone`; a match links the new `client_portal_accounts` row to
  the existing `client_id` (points/history untouched — read-only lookup).
  No match creates a new `clients` row (`codename` = submitted Name,
  system-generated `username`/`member_code` since both are `NOT NULL` with
  no default) plus the linked portal account. PIN hashed with
  `crypto.scrypt` (`lib/portal/pin.ts`). Portal account `username` is
  system-generated (`lib/portal/codes.ts`, format `NXS-XXXXXX`), shown on
  the confirmation screen, never editable, never encoded in any QR.
- **Login** (`app/portal/login/page.tsx` → `app/portal/api/login/route.ts`):
  Phone + PIN, `scrypt`-verified against `client_portal_accounts.pin_hash`.
- **Why service-role, not the anon-key client the rest of the app uses**:
  `clients` INSERT requires `is_staff()` (Staff Auth 6C-2) and
  `client_portal_accounts` is still RLS default-deny (7A-1) — an anonymous
  portal visitor cannot write through the anon-key/RLS path at all.
  `lib/portal/service-client.ts` uses `SUPABASE_SERVICE_ROLE_KEY`, confined
  to the two Route Handlers above, never imported by a Client Component.
  RLS policies on `client_portal_accounts` are still not designed —
  reads/writes in this prompt bypass RLS entirely via the service-role
  client, which is why no policy gap needed to be silently patched.
- **Session**: `lib/portal/session.ts`, an HMAC-signed `nxs_portal_session`
  cookie (`httpOnly`, `path=/portal`), completely separate from Supabase
  Auth's staff `sb-*` cookies — no shared session/role/RBAC context.
- **Confirmation screen** (`app/portal/confirmation/page.tsx`): server
  component, reads the verified session cookie and re-queries fresh
  (not URL params). Minimal — Name + system username only, nothing else.
- **Master QR** (`app/(staff)/settings/master-qr/page.tsx`): static,
  non-expiring, staff-gated, linked from the Settings page. Renders via
  the new `qrcode` dependency, encoding `/portal/register` built from the
  live request host. No token table, no expiry — a fixed URL, per ADR-001.

## Implemented (7A-3, `ohm#9r3w7t5b`, 2026-08-29) — password-based auth

Reworks the registration/login flow shipped in 7A-2. PIN-based auth is
gone; `username` is now user-chosen at registration instead of
system-generated.

- **`client_portal_accounts`**: `pin_hash` dropped, `password_hash text
  not null` added. `username`'s plain `unique` constraint was replaced by
  a case-insensitive `unique index ... (lower(username))` — not citext
  (confirmed unused anywhere in this schema). Migration:
  `20260829123017_client_portal_password_auth.sql`. The single 7A-2 test
  row (Test Client 7A2 / `NXS-XKUCU4`) was deleted as part of this
  migration (its PIN credential couldn't be migrated to a password); the
  linked `clients` row was left untouched.
- **`lib/portal/password.ts`** (renamed from `pin.ts`): `hashPassword`/
  `verifyPassword`, same `scrypt` implementation as before. Minimum
  password length 6 characters (length-only, no complexity rules).
- **`lib/portal/username.ts`** (new): username format validation
  (`/^[a-zA-Z0-9_.-]{3,20}$/`) and a LIKE-wildcard-escaped, case-
  insensitive `isUsernameTaken` check. Backs a new
  `app/portal/api/check-username` Route Handler used by both the
  registration page's debounced live-availability check and the
  authoritative server-side check on submit.
- **Registration** (`app/portal/register/page.tsx` +
  `app/portal/api/register/route.ts`): fields are now Name, Username,
  Phone Number, Password. Username collisions surface a specific inline
  field error (safe to disclose). The `clients.phone` match-vs-create
  linking logic from 7A-2 (preserves points/history on match) is
  unchanged. The `client_portal_accounts.phone`-collision response was
  changed from a message that named the phone number as already
  registered to a generic one — the old wording leaked account existence
  to an anonymous visitor.
- **Login** (`app/portal/login/page.tsx` +
  `app/portal/api/login/route.ts`): single "Username or Phone Number"
  identifier field + Password. Backend regex-detects phone-shaped input
  (`/^\d{7,15}$/`) vs. username and looks up accordingly.
- **`lib/portal/session.ts`**: unaffected — only signs/verifies
  `portalAccountId`, no PIN/password reference. Not touched.
- **Explicitly deferred, no scaffolding added**: SMS OTP, Forgot Password.

## Implemented (Points EARN/REDEEM Guard, `ohm#4x8k2p9d`, 2026-09-01)

- **First RLS policy on `client_portal_accounts`**: `staff_select`
  (`for select using (is_staff())`), added in
  `supabase/migrations/20260901090000_point_transactions_portal_guard.sql`.
  Additive only — INSERT/UPDATE remain unpoliced (still service-role-only
  via the 7A-2/7A-3 portal API routes). Added so staff pages can read which
  clients are portal-registered, to gate the Earn/Redeem UI. See
  [[points_ledger_state]] for the companion `point_transactions` trigger
  (`trg_require_portal_account_for_earn_redeem`) that enforces the same
  rule at the DB level, and for the app-level gating built on top of this
  policy.

## Not yet implemented — see roadmap

- Member QR (per-account, permanent, client-side) and its `log_visit` RPC
  lookup path — additive only, the existing RPC contract/atomicity/ledger
  triggers are untouched so far.
- Phone masking/reveal UI and the actual `phone_number_revealed` logging
  call site.
- No INSERT/UPDATE RLS policy on `client_portal_accounts` yet (only the new
  `staff_select` read policy above) — 7A-2/7A-3's Route Handlers still
  bypass RLS entirely via the service-role client for registration/login.
- Points balance / visit history / promos views for the client portal.
- Manual points entry UI gated by `allow_receptionist_manual_points`
  (uses the existing `ADJUSTMENT` ledger entry type — no new entry type,
  no ledger schema change, per ADR-001; `ADJUSTMENT` is exempt from the
  new portal-account guard).
