-- Lightweight single-parameter PIN verification RPC function & trigger update (ohm#bypasstroublesomerpc)

create or replace function public.verify_void_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_hash text;
begin
  if coalesce(trim(p_pin), '') = '' then
    return false;
  end if;

  select void_auth_code_hash into v_code_hash
  from public.app_settings
  where id = true;

  if v_code_hash is null then
    return false;
  end if;

  return extensions.crypt(trim(p_pin), v_code_hash) = v_code_hash;
end;
$$;

revoke execute on function public.verify_void_pin(text) from public, anon;
grant execute on function public.verify_void_pin(text) to authenticated, service_role;

-- Ensure service_role (used by privileged Server Actions) is permitted to directly update void status
create or replace function public.block_void_by_non_owner()
returns trigger
language plpgsql
as $$
begin
  if new.voided is distinct from old.voided
     and not public.is_supervisor_or_above()
     and current_user not in ('service_role', 'postgres', 'supabase_admin')
     and coalesce(current_setting('app.void_via_code', true), '') <> 'true' then
    raise exception 'Only Supervisor or Owner may void or unvoid a sale';
  end if;
  return new;
end;
$$;
