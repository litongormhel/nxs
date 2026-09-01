-- RLS & Grant Tightening — sale_addons Insert Policy + apply_points_delta
-- REST Exposure (ohm#7n4c1wp6), addressing audit ohm#9k3v7bx2 Medium #3 and
-- Medium #6.
--
-- sale_addons.public_insert (INSERT, with_check=true, roles={public}) let
-- any anon-key holder insert arbitrary sale_addons rows via public REST,
-- independent of the quick_walkin() RPC it was meant to support.
-- quick_walkin() is SECURITY INVOKER (confirmed via pg_proc) and is only
-- ever called from app/(staff)/bookings/actions.ts via the cookie-based
-- authenticated Supabase client, so its internal sale_addons insert runs
-- as the real staff caller — narrowing this policy to is_staff() does not
-- break it. Mirrors locker_occupancy's existing staff_insert/is_staff()
-- pattern.
drop policy if exists public_insert on public.sale_addons;

create policy staff_insert on public.sale_addons
  for insert
  with check (is_staff());

-- apply_points_delta() is a trigger-only function (RETURNS trigger, relies
-- on NEW row context) with no legitimate reason to be directly callable
-- via /rest/v1/rpc/apply_points_delta. Trigger firing (trg_apply_points_delta
-- on point_transactions) is unaffected by this revoke — the executor
-- invokes trigger functions internally, not via a role-checked RPC call.
revoke execute on function public.apply_points_delta() from public, anon, authenticated;
