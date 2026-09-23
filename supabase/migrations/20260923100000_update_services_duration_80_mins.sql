-- Update standard massage services duration from 90 to 80 minutes
-- (Combi Massage & Signature Massage, and any standard 90-minute massage service)

update public.services
set duration_minutes = 80
where name in ('Combi Massage', 'Signature Massage')
   or lower(name) like '%combi%'
   or lower(name) like '%signature%'
   or duration_minutes = 90;

-- Alter column default on services table to 80 minutes
alter table public.services alter column duration_minutes set default 80;

-- Backfill active/future bookings where duration_minutes was 90 to 80
-- and recalculate end_ts so adjacent slots in the same room are immediately freed
update public.bookings
set duration_minutes = 80,
    end_ts = start_ts + interval '80 minutes'
where duration_minutes = 90
  and status in ('Booked', 'Needs Reassignment');
