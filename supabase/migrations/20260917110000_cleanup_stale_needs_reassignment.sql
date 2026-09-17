-- Cleanup stale historical 'Needs Reassignment' bookings prior to cutoff date (ohm#arcreassgn)

select public.auto_cancel_lapsed_bookings();
