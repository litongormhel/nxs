-- Sale Void — widen direct void to Supervisor-or-above (ohm#6f3p8dxn)
-- Follow-up to 20260901170000_sale_void_auth_code.sql: the prompt's intended
-- workflow has Supervisor void directly (no code), same as Owner, since
-- their session "already satisfies RLS" — but the trigger only allowed
-- is_owner(), so a Supervisor's direct voidSale() UPDATE was rejected.
-- Confirmed via a live rolled-back-transaction smoke test before this
-- change. staff_update RLS already permits Supervisor-or-above; this only
-- widens the void-specific trigger to match that floor.

create or replace function public.block_void_by_non_owner()
returns trigger
language plpgsql
as $$
begin
  if new.voided is distinct from old.voided
     and not public.is_supervisor_or_above()
     and coalesce(current_setting('app.void_via_code', true), '') <> 'true' then
    raise exception 'Only Supervisor or Owner may void or unvoid a sale';
  end if;
  return new;
end;
$$;
