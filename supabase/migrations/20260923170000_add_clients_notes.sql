-- Migration: Add notes column to public.clients
-- Description: Adds nullable notes text column to public.clients for receptionist notes (ohm#3c8f1e5d)

alter table public.clients
  add column if not exists notes text;
