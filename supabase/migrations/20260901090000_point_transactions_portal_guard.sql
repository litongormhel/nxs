-- Points EARN/REDEEM Guard — Require Client Portal Account (ohm#4x8k2p9d)
-- A client can only EARN or REDEEM points if they have a row in
-- client_portal_accounts (self-registered on the client portal). Having a
-- clients record alone is NOT sufficient. ADJUSTMENT entries are exempt.
--
-- Same file/style as the existing trg_block_ledger_update/delete pair
-- (block_ledger_mutation(), baseline migration): a BEFORE INSERT trigger on
-- point_transactions that raises an exception instead of silently allowing
-- the row. No change to the immutability triggers or apply_points_delta().

create or replace function public.require_portal_account_for_earn_redeem()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.entry_type in ('EARN', 'REDEEM') and not exists (
    select 1 from public.client_portal_accounts where client_id = new.client_id
  ) then
    raise exception 'Client % has no client_portal_accounts row — cannot EARN or REDEEM points', new.client_id;
  end if;
  return new;
end;
$function$;

create trigger trg_require_portal_account_for_earn_redeem
  before insert on public.point_transactions
  for each row execute function public.require_portal_account_for_earn_redeem();

-- ----------------------------------------------------------------------------
-- client_portal_accounts was RLS-enabled with zero policies (7A-1) — the app
-- needs a staff read path to know which clients are portal-registered so it
-- can gate the Earn/Redeem UI before ever calling into the ledger. Additive
-- only: no existing policy touched, no INSERT/UPDATE policy added (those
-- stay service-role-only via the portal API routes).
-- ----------------------------------------------------------------------------

create policy staff_select on public.client_portal_accounts
  for select using (public.is_staff());
