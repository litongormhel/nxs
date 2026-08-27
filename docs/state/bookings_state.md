# Bookings — Current State

## Implemented (DB level)

`public.bookings`:
- Columns include `client_id` (nullable), `guest_label` (nullable — check
  constraint requires one of `client_id`/`guest_label`), `service_id`,
  `therapist_id`, `room_number`, `booking_date`, `start_time`, `start_ts`/
  `end_ts` (computed), `duration_minutes`, `status` (enum: `Booked`,
  `Completed`, `No-show`, `Cancelled`, `Needs Reassignment`), `group_id`,
  `promo_id`, `created_by`.
- Trigger `trg_bookings_set_computed_fields` (BEFORE INSERT/UPDATE OF
  `service_id`, `booking_date`, `start_time`) derives computed fields
  (likely `start_ts`/`end_ts`/`duration_minutes` from the service) —
  confirm exact derivation by reading `bookings_set_computed_fields()` in
  Supabase before relying on the specifics.
- Two GiST exclusion constraints prevent overlapping bookings for the same
  room or same therapist while status is `Booked`/`Completed`/
  `Needs Reassignment`: `no_double_book_room`, `no_double_book_therapist`.

## Not yet implemented — see roadmap

- `app/bookings/page.tsx` is an 8-line stub ("Coming soon."). No booking
  creation, calendar view, or status-change UI exists yet.
- `app/call-sheet/page.tsx` is also a stub, though it likely consumes
  `bookings` + `therapists` once built.
