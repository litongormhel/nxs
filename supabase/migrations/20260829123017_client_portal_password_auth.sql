-- Client Portal 7A-3: Password-based auth (ohm#9r3w7t5b)
--
-- Replaces PIN-based auth with password-based auth on client_portal_accounts.
-- username becomes user-chosen at registration (was system-generated in
-- 7A-2); adds case-insensitive uniqueness via a functional index on
-- lower(username), not citext (not installed/used anywhere in this schema).

-- 1. Remove the one test row from 7A-2 verification (Test Client 7A2 /
--    NXS-XKUCU4) — its pin_hash credential cannot be migrated to a
--    password, and it's documented test data, not a real user. Confirmed
--    with the user before applying. The linked `clients` row itself is
--    NOT touched.
delete from public.client_portal_accounts
where phone = '09171234567' and username = 'NXS-XKUCU4';

-- 2. Drop the plain unique constraint on username; it's superseded by the
--    case-insensitive functional index added below.
alter table public.client_portal_accounts
  drop constraint client_portal_accounts_username_key;

-- 3. Password-based auth columns.
alter table public.client_portal_accounts
  add column password_hash text not null;

alter table public.client_portal_accounts
  drop column pin_hash;

-- 4. Case-insensitive username uniqueness.
create unique index client_portal_accounts_username_lower_idx
  on public.client_portal_accounts (lower(username));

-- Down migration (rollback):
-- drop index public.client_portal_accounts_username_lower_idx;
-- alter table public.client_portal_accounts drop column password_hash;
-- alter table public.client_portal_accounts add column pin_hash text not null;
-- alter table public.client_portal_accounts add constraint client_portal_accounts_username_key unique (username);
-- Note: pin_hash and password_hash data are not recoverable by this rollback;
-- any accounts created under password auth will need PINs reset manually.
