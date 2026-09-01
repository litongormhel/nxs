-- Client Portal — Login/Register Rate Limiting (ohm#5t2m8qz1)
-- Addresses audit ohm#9k3v7bx2 High #1: no brute-force protection on
-- /portal/api/login, /portal/api/check-username, /portal/api/register.
-- One generic counter/lockout table, namespaced by attempt_key, mirroring
-- the sale_void_attempts pattern (RLS enabled, zero policies — default-deny,
-- touched only via the service-role client these three route handlers
-- already use; no new RLS bypass introduced, since none of these three
-- routes ever went through the anon-key/RLS path to begin with).

create table public.portal_login_attempts (
  attempt_key text primary key,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.portal_login_attempts enable row level security;
-- No policies added — internal/service-role-only table, same convention as
-- sale_void_attempts and client_portal_accounts' pre-staff_select state.
