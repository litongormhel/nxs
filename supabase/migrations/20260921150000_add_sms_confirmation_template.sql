-- Migration: Add sms_confirmation_template to app_settings (ohm#5e9a2b7c)
--
-- Adds sms_confirmation_template text nullable column to public.app_settings
-- Ensures RLS update policy permits supervisor and owner roles (is_supervisor_or_above())
-- Reloads the PostgREST schema cache to resolve missing column in schema cache error.

alter table public.app_settings
  add column if not exists sms_confirmation_template text;

-- Ensure staff/admin (supervisor or above) can update app_settings
drop policy if exists app_settings_update on public.app_settings;

create policy app_settings_update on public.app_settings
  for update using (is_supervisor_or_above()) with check (is_supervisor_or_above());

-- Reload schema cache in PostgREST
notify pgrst, 'reload schema';
