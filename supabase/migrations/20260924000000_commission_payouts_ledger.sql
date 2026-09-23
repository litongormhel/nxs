-- Commission Payout Tracking Ledger (ohm#9c4e2a7b)
-- Purely an audit and disbursement tracker between spa owner and therapists.
-- Does NOT deduct from daily sales, daily cash drawer, or remittance reports in /sales.

create table if not exists public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_bookings int not null default 0,
  gross_commission numeric(10,2) not null default 0,
  deductions numeric(10,2) not null default 0,
  net_payout numeric(10,2) not null default 0,
  payment_method text check (payment_method in ('cash', 'gcash')) default 'cash',
  status text check (status in ('unclaimed', 'claimed')) default 'claimed',
  notes text,
  disbursed_at timestamptz default now(),
  disbursed_by uuid references auth.users(id),
  created_at timestamptz default now(),
  constraint commission_payouts_unique_period unique (therapist_id, period_start, period_end)
);

-- Enable Row Level Security
alter table public.commission_payouts enable row level security;

-- Policies: Standard staff can view, insert, and update payout records; owner can delete if needed
create policy "staff_select" on public.commission_payouts
  for select using (is_staff());

create policy "staff_insert" on public.commission_payouts
  for insert with check (is_staff());

create policy "staff_update" on public.commission_payouts
  for update using (is_staff()) with check (is_staff());

create policy "owner_delete" on public.commission_payouts
  for delete using (is_owner());
