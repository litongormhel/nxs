-- Commission Module: Add rate_type ('percent' | 'flat') to commission_rates table (ohm#fixcommcalc).
alter table public.commission_rates
  add column rate_type text not null default 'percent';
