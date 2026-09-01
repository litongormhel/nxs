-- Loyalty Points Formula — Settings Schema (Part 1 of 2, ohm#9k3m7qxc)
--
-- Adds owner-configurable loyalty points formula fields to the existing
-- app_settings singleton (see 20260829170100_app_settings_manual_points_flag.sql).
-- Nullable = "not yet configured" state. This migration does NOT wire the
-- formula into any live points-award path — point_transactions and its
-- triggers are untouched.

alter table public.app_settings
  add column loyalty_formula_mode text
    check (loyalty_formula_mode in ('uniform', 'proportional')),
  add column peso_per_point numeric;

-- Existing RLS policies (app_settings_select: is_staff(), app_settings_update:
-- is_owner()) already cover these new columns on the same singleton row —
-- no policy change needed.

-- Down migration (rollback):
-- alter table public.app_settings drop column peso_per_point;
-- alter table public.app_settings drop column loyalty_formula_mode;
