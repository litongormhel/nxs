-- Migration: Add void_reason column to public.sales
-- Created: 2026-09-19
-- Description: Adds void_reason text column to public.sales for storing standardized or custom void reasons.

alter table public.sales
  add column if not exists void_reason text;
