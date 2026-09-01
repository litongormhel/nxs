-- Sale Void — Owner-Set 6-Digit Authorization Code (ohm#6f3p8dxn)
-- Adds a step-up void path for staff below Supervisor/Owner: a shared,
-- Owner-set 6-digit code (hashed) authorizes the void, attributed to the
-- selected Supervisor/Owner (`voided_by`) while the initiating staff member
-- is recorded separately in the action_logs detail. The existing direct
-- Owner/Supervisor void path (voidSale(), trg_block_void_by_non_owner's
-- is_owner() branch) is unchanged.

-- 1. app_settings: hashed void authorization code (nullable = not yet configured).
alter table public.app_settings
  add column void_auth_code_hash text;

-- 2. Per-initiating-staff void attempt/lockout tracking.
-- RLS enabled, zero policies — default-deny, matches the
-- client_portal_accounts / commission_rates convention for tables touched
-- only by a SECURITY DEFINER function.
create table public.sale_void_attempts (
  staff_id uuid primary key references public.staff(id),
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.sale_void_attempts enable row level security;
-- No policies added — internal/function-only table.

-- 3. Allow the step-up function (below) to flip `voided` despite the real
-- calling session not being Owner, without loosening the trigger for any
-- other UPDATE path. `app.void_via_code` is a transaction-local GUC set
-- only from inside void_sale_with_code() — never client-settable, not
-- exposed via PostgREST.
create or replace function public.block_void_by_non_owner()
returns trigger
language plpgsql
as $$
begin
  if new.voided is distinct from old.voided
     and not public.is_owner()
     and coalesce(current_setting('app.void_via_code', true), '') <> 'true' then
    raise exception 'Only Owner may void or unvoid a sale';
  end if;
  return new;
end;
$$;

-- 4. Owner-only: set/replace the shared void authorization code.
-- Hashing happens inside Postgres via pgcrypto so it matches verification
-- in void_sale_with_code() exactly (never hashed in Node).
create or replace function public.set_void_auth_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Only Owner may set the void authorization code';
  end if;
  if p_code !~ '^[0-9]{6}$' then
    raise exception 'Code must be exactly 6 digits';
  end if;
  update public.app_settings
    set void_auth_code_hash = extensions.crypt(p_code, extensions.gen_salt('bf'))
    where id = true;
end;
$$;

revoke execute on function public.set_void_auth_code(text) from public, anon;
grant execute on function public.set_void_auth_code(text) to authenticated;

-- 5. Step-up void: verify the shared code, re-verify the authorizer's
-- position server-side (never trust the dropdown alone), apply the void,
-- and track per-initiator rate limiting. The initiating staff id is derived
-- from the real session (auth.uid() -> staff.id), never trusted from a
-- client-supplied parameter, so a caller can't dodge their own lockout or
-- grief another staff member's counter by passing a different id.
create or replace function public.void_sale_with_code(
  p_sale_id uuid,
  p_code text,
  p_authorizing_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiating_staff_id uuid;
  v_code_hash text;
  v_locked_until timestamptz;
  v_failed_count int;
  v_authorizer_position public.staff_position;
begin
  if not public.is_staff() then
    raise exception 'Not signed in as staff';
  end if;

  select id into v_initiating_staff_id
  from public.staff
  where user_id = auth.uid();

  if v_initiating_staff_id is null then
    raise exception 'Not signed in as staff';
  end if;

  -- 1. Lockout check — checked before touching the code at all.
  select locked_until, failed_count into v_locked_until, v_failed_count
  from public.sale_void_attempts
  where staff_id = v_initiating_staff_id;

  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after', v_locked_until);
  end if;

  -- 2. Code configured?
  select void_auth_code_hash into v_code_hash from public.app_settings where id = true;
  if v_code_hash is null then
    return jsonb_build_object('ok', false, 'reason', 'not_configured');
  end if;

  -- 3. Verify code
  if extensions.crypt(p_code, v_code_hash) <> v_code_hash then
    v_failed_count := coalesce(v_failed_count, 0) + 1;
    if v_failed_count >= 3 then
      insert into public.sale_void_attempts (staff_id, failed_count, locked_until, updated_at)
      values (v_initiating_staff_id, 0, now() + interval '5 minutes', now())
      on conflict (staff_id) do update
        set failed_count = 0, locked_until = now() + interval '5 minutes', updated_at = now();
      return jsonb_build_object('ok', false, 'reason', 'invalid_code', 'attempts_remaining', 0);
    else
      insert into public.sale_void_attempts (staff_id, failed_count, locked_until, updated_at)
      values (v_initiating_staff_id, v_failed_count, null, now())
      on conflict (staff_id) do update
        set failed_count = v_failed_count, locked_until = null, updated_at = now();
      return jsonb_build_object('ok', false, 'reason', 'invalid_code', 'attempts_remaining', 3 - v_failed_count);
    end if;
  end if;

  -- 4. Re-verify authorizer server-side.
  select position into v_authorizer_position
  from public.staff
  where id = p_authorizing_staff_id;

  if v_authorizer_position is null or v_authorizer_position not in ('Supervisor', 'Owner') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_authorizer');
  end if;

  -- 5. Apply the void.
  perform set_config('app.void_via_code', 'true', true);

  update public.sales
    set voided = true, voided_by = p_authorizing_staff_id, voided_at = now()
    where id = p_sale_id;

  perform set_config('app.void_via_code', 'false', true);

  insert into public.sale_void_attempts (staff_id, failed_count, locked_until, updated_at)
  values (v_initiating_staff_id, 0, null, now())
  on conflict (staff_id) do update
    set failed_count = 0, locked_until = null, updated_at = now();

  insert into public.action_logs (staff_id, action, detail)
  values (
    v_initiating_staff_id,
    'sale_void',
    format('sale_id=%s authorized_by=%s initiated_by=%s', p_sale_id, p_authorizing_staff_id, v_initiating_staff_id)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.void_sale_with_code(uuid, text, uuid) from public, anon;
grant execute on function public.void_sale_with_code(uuid, text, uuid) to authenticated;
