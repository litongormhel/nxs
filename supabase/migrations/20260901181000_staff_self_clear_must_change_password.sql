-- Staff Archive + Owner-Managed Login Credentials (ohm#uox20nff), follow-up.
-- staff_update RLS (previous migration) is Owner-only, so a staff member
-- cannot clear their own must_change_password flag directly. This
-- SECURITY DEFINER function scopes the write to exactly the caller's own
-- row via auth.uid(), same pattern as current_staff_position().

create or replace function public.clear_own_must_change_password()
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff
  set must_change_password = false
  where user_id = auth.uid();
$$;
