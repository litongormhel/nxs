alter table client_portal_accounts
  add column qr_token uuid not null default gen_random_uuid() unique;
