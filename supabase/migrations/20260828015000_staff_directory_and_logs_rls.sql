-- Staff Directory + Activity Logs phase (ohm#3z8k1p6d)
-- Additive-only, same shape as every prior narrow policy (roles: public, USING/WITH CHECK true).
-- staff: first writer (Add Staff modal) — was SELECT-only before this.
create policy "public_insert" on public.staff for insert to public with check (true);
-- action_logs: first reader (Activity Logs tab) — was INSERT-only before this.
create policy "public_select" on public.action_logs for select to public using (true);
