-- Add UPDATE RLS policy to public.therapists so Archive/Unarchive (and
-- Edit-rename in a later prompt) can actually persist. Previously the table
-- had only `public_select` (USING true) — no INSERT/UPDATE/DELETE policy at
-- all, so Archive/Unarchive/Add/Edit were either silently local-only or (in
-- Add's case) actively RLS-rejected. This prompt covers Archive/Unarchive
-- only; INSERT policy for Add Therapist is a separate follow-up.
--
-- Matches the `services`/`addons` catalog RLS pattern (is_supervisor_or_above()
-- for writes), not the stricter `promos` (is_owner()) pattern — therapists
-- aren't a financial-discount control. No DELETE policy: archive stays
-- UPDATE-only, consistent with every other catalog table in this schema.

create policy "staff_update" on public.therapists
for update
using (is_supervisor_or_above())
with check (is_supervisor_or_above());
