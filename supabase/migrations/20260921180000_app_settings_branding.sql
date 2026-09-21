-- Migration: Add branding + appearance columns to app_settings
-- Prompt: ohm#8b3c1d4e — Branding Customization, Typography Selector, Theme Density Controls

-- 1. Add new columns to app_settings singleton table
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS spa_name   text NOT NULL DEFAULT 'NXS Spa',
  ADD COLUMN IF NOT EXISTS logo_url   text NULL,
  ADD COLUMN IF NOT EXISTS accent_color text NULL DEFAULT 'gold',
  ADD COLUMN IF NOT EXISTS font_family  text NULL DEFAULT 'sans',
  ADD COLUMN IF NOT EXISTS font_scale   text NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS table_density text NULL DEFAULT 'comfortable';

-- 2. Create brand-assets storage bucket (public — logos must be served without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets',
  'brand-assets',
  true,
  5242880,  -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: anyone can read (public bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_public_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY brand_assets_public_select
        ON storage.objects FOR SELECT
        USING (bucket_id = 'brand-assets')
    $pol$;
  END IF;
END$$;

-- 4. Storage RLS: Owner can upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_owner_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY brand_assets_owner_insert
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'brand-assets'
          AND public.is_owner()
        )
    $pol$;
  END IF;
END$$;

-- 5. Storage RLS: Owner can update/replace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_owner_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY brand_assets_owner_update
        ON storage.objects FOR UPDATE
        USING (
          bucket_id = 'brand-assets'
          AND public.is_owner()
        )
    $pol$;
  END IF;
END$$;

-- 6. Storage RLS: Owner can delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'brand_assets_owner_delete'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY brand_assets_owner_delete
        ON storage.objects FOR DELETE
        USING (
          bucket_id = 'brand-assets'
          AND public.is_owner()
        )
    $pol$;
  END IF;
END$$;

-- 7. Reload PostgREST schema cache so new columns are immediately available
NOTIFY pgrst, 'reload schema';
