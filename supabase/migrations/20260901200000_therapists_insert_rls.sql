-- Add INSERT RLS policy to public.therapists so Add Therapist's existing
-- createTherapist() insert (previously silently RLS-rejected — the table
-- had public_select + staff_update only) can actually persist. Edit-rename
-- reuses staff_update (added in 20260901190000_therapists_archive_rls.sql)
-- as-is; no separate migration needed for it, and no column-level narrowing
-- of staff_update's WITH CHECK either — that pattern isn't used anywhere
-- else in this schema, and the same actor tier (is_supervisor_or_above())
-- already writes archived*/name via Archive/rename regardless.
--
-- Matches staff_update's actor tier (is_supervisor_or_above()), consistent
-- with the rest of this table's write policies.

create policy "staff_insert" on public.therapists
for insert
with check (is_supervisor_or_above());
