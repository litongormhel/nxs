-- Staff Archive + Owner-Managed Login Credentials (ohm#uox20nff).
-- Adds: username column (login-capable staff), password-change-required flag,
-- archive audit columns mirroring therapists' existing pattern, a real
-- staff_update RLS policy (Owner-only), and a guard against archiving the
-- last active Owner. staff.active is reused as-is for archive-gating (it
-- already exists, defaults true, and was previously unused for gating).

alter table public.staff
  add column username text,
  add column must_change_password boolean not null default false,
  add column archived_reason text,
  add column archived_by uuid references public.staff(id),
  add column archived_at timestamptz;

create unique index staff_username_key on public.staff (lower(username))
  where username is not null;

-- Owner-only update: covers archive/restore, username/password provisioning
-- fields, and reset-password bookkeeping. No staff-self UPDATE path exists
-- here — the self password-change flow only calls auth.updateUser(), which
-- is not a `staff` table write.
create policy staff_update on public.staff
  for update
  using (public.is_owner())
  with check (public.is_owner());

-- Guard: cannot archive (active -> false) the last active Owner. Runs
-- regardless of caller (RLS + server-role admin calls both go through
-- normal UPDATE), independent of the RLS check above.
create or replace function public.block_archive_last_owner()
returns trigger
language plpgsql
as $$
begin
  if new.active = false and old.active = true and old.position = 'Owner' then
    if (
      select count(*) from public.staff
      where position = 'Owner' and active = true and id <> old.id
    ) = 0 then
      raise exception 'Cannot archive the last active Owner account';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_archive_last_owner on public.staff;

create trigger trg_block_archive_last_owner
  before update on public.staff
  for each row
  execute function public.block_archive_last_owner();
