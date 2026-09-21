-- Migration: Add allow_walkin_claims to app_settings (ohm#3d8a1c9e)
--
-- Adds allow_walkin_claims boolean not null default true column to public.app_settings
-- Reloads the PostgREST schema cache to ensure the column is immediately accessible.

alter table public.app_settings
  add column if not exists allow_walkin_claims boolean not null default true;

-- Reload schema cache in PostgREST
notify pgrst, 'reload schema';
