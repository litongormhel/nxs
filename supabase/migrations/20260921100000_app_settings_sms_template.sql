-- SMS Confirmation Template — app_settings column + RLS (ohm#4f8e1b2d)
--
-- Adds customizable sms_confirmation_template text column to the existing
-- app_settings singleton.
-- Updates app_settings_update policy from is_owner() to is_supervisor_or_above()
-- so Supervisors and Owners can manage settings such as SMS templates.

alter table public.app_settings
  add column if not exists sms_confirmation_template text;

drop policy if exists app_settings_update on public.app_settings;

create policy app_settings_update on public.app_settings
  for update using (is_supervisor_or_above()) with check (is_supervisor_or_above());

-- Down migration (rollback):
-- alter table public.app_settings drop column if exists sms_confirmation_template;
-- drop policy if exists app_settings_update on public.app_settings;
-- create policy app_settings_update on public.app_settings for update using (is_owner()) with check (is_owner());
