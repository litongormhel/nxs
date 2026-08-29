-- Client Portal 7A-1: schema foundation (ohm#7a1f9c2k)
--
-- DATABASE LAYER ONLY. No UI, no routes. Adds:
--   1. UNIQUE constraint on the already-existing clients.phone column
--      (column pre-dates this migration; verified live: 1 client row,
--      phone null on it, no duplicates — safe to constrain, no backfill).
--   2. New table client_portal_accounts (registration/login not built yet;
--      table only, RLS enabled with zero policies = default-deny until a
--      later prompt adds real policies).
--   3. Column comment relabeling clients.codename's display label to
--      "Name" per ADR-001's Client Identity amendment. The column name
--      itself is UNCHANGED (structural invariant: single free-text
--      identity field, no legal-name column) — renaming the column or
--      touching UI components is explicit follow-up scope, not this
--      prompt, per regression risk across Locker Board/Call Sheet/client
--      search/receipts.

-- 1. clients.phone: add UNIQUE constraint to the existing nullable column.
alter table public.clients
  add constraint clients_phone_key unique (phone);

-- 2. client_portal_accounts: new table, no client-facing logic yet.
create table public.client_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  phone text not null unique,
  pin_hash text not null,
  username text not null unique,
  created_at timestamptz not null default now()
);

alter table public.client_portal_accounts enable row level security;
-- No policies added in this migration — RLS-enabled-with-zero-policies is
-- default-deny for every role, matching this repo's convention of not
-- leaving a new table open before its consumer/policy matrix is designed.

-- 3. Codename -> Name relabel, data-layer only (comment, not a rename).
comment on column public.clients.codename is
  'Client display identity. UI label: "Name" (relabeled from "Codename" '
  'per ADR-001 Client Identity amendment, ohm#7a1f9c2k). Column name '
  'unchanged; single free-text field, no legal-name column.';

-- Down migration (rollback):
-- comment on column public.clients.codename is null;
-- drop table public.client_portal_accounts;
-- alter table public.clients drop constraint clients_phone_key;
