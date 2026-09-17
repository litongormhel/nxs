-- Sales Void & Restore — Mandatory Manager/Owner PIN Verification (ohm#salesvoidrestorepin)

-- 1. Add void_reason column to sales table if not present.
alter table public.sales
  add column if not exists void_reason text;

-- 2. Update set_void_auth_code to accept 4 to 6 digit PINs.
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
  if p_code !~ '^[0-9]{4,6}$' then
    raise exception 'Code must be between 4 and 6 digits';
  end if;
  update public.app_settings
    set void_auth_code_hash = extensions.crypt(p_code, extensions.gen_salt('bf'))
    where id = true;
end;
$$;

revoke execute on function public.set_void_auth_code(text) from public, anon;
grant execute on function public.set_void_auth_code(text) to authenticated;

-- 3. RPC function to void a sale with PIN verification and required reason.
create or replace function public.void_sale_with_pin(
  p_sale_id uuid,
  p_pin text,
  p_reason text,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_hash text;
begin
  if not public.is_staff() then
    raise exception 'Not signed in as staff';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Manager PIN is required.');
  end if;

  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Reason for void is required.');
  end if;

  select void_auth_code_hash into v_code_hash
  from public.app_settings
  where id = true;

  if v_code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Manager PIN is not configured yet. Ask Owner to set it in Settings.');
  end if;

  if extensions.crypt(p_pin, v_code_hash) <> v_code_hash then
    return jsonb_build_object('ok', false, 'error', 'Invalid Manager PIN.');
  end if;

  perform set_config('app.void_via_code', 'true', true);

  update public.sales
  set voided = true,
      voided_by = p_staff_id,
      voided_at = now(),
      void_reason = trim(p_reason)
  where id = p_sale_id;

  perform set_config('app.void_via_code', 'false', true);

  insert into public.action_logs (staff_id, action, detail)
  values (
    p_staff_id,
    'sale_void',
    format('sale_id=%s voided_by=%s reason=%s', p_sale_id, p_staff_id, trim(p_reason))
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- 4. RPC function to restore a voided sale with PIN verification and required reason.
create or replace function public.restore_sale_with_pin(
  p_sale_id uuid,
  p_pin text,
  p_reason text,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_hash text;
begin
  if not public.is_staff() then
    raise exception 'Not signed in as staff';
  end if;

  if coalesce(trim(p_pin), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Manager PIN is required.');
  end if;

  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Reason for restore is required.');
  end if;

  select void_auth_code_hash into v_code_hash
  from public.app_settings
  where id = true;

  if v_code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Manager PIN is not configured yet. Ask Owner to set it in Settings.');
  end if;

  if extensions.crypt(p_pin, v_code_hash) <> v_code_hash then
    return jsonb_build_object('ok', false, 'error', 'Invalid Manager PIN.');
  end if;

  perform set_config('app.void_via_code', 'true', true);

  update public.sales
  set voided = false,
      voided_by = null,
      voided_at = null,
      void_reason = null
  where id = p_sale_id;

  perform set_config('app.void_via_code', 'false', true);

  insert into public.action_logs (staff_id, action, detail)
  values (
    p_staff_id,
    'sale_restore',
    format('sale_id=%s restored_by=%s reason=%s', p_sale_id, p_staff_id, trim(p_reason))
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.void_sale_with_pin(uuid, text, text, uuid) from public, anon;
grant execute on function public.void_sale_with_pin(uuid, text, text, uuid) to authenticated;

revoke execute on function public.restore_sale_with_pin(uuid, text, text, uuid) from public, anon;
grant execute on function public.restore_sale_with_pin(uuid, text, text, uuid) to authenticated;
