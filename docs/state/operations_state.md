# Operations (Lockers / Rooms / Call Sheet) — Current State

## Implemented (DB level)

- `public.rooms`: `number` (PK-like), `active`.
- `public.lockers`: `number`, `active`.
- `public.locker_occupancy`: check-in/check-out tracking — `locker_number`,
  `room_number`, `service_id`, `client_id`, `guest_label`, `checked_in_at`/
  `checked_in_by`, `checked_out_at`/`checked_out_by`, and (`ohm#7q2x9m4k`,
  2026-08-29) `booking_id uuid references bookings(id)` — nullable,
  additive, no backfill. Lets the Bookings tab derive Check-in/Check-out
  tab membership by joining back to `bookings.status` instead of adding a
  new status value. Populated by both existing write paths
  (`quick_walkin()` RPC and `logVisitBooking()`'s linked-booking branch)
  — see [[bookings_state]]. Locker Board and Call Sheet (below) are
  unaffected: both read via explicit column selects and their own
  `checked_out_at IS NULL` filter, neither references `booking_id`.

## Implemented (app level)

`app/dashboard/page.tsx` reads live counts of `rooms` and `lockers` where
`active = true` ("Total Rooms", "Total Lockers" cards) — the only current
app-level read of these tables.

## RLS

`rooms` and `lockers` both have public-read policies (`USING (true)`).
`locker_occupancy` RLS (`ohm#3f7n9c1k`, Staff Auth 6C-3, 2026-08-29):
`staff_select`/`staff_insert`/`staff_update` all `is_staff()`-gated,
replacing the original `public_select`/`public_insert`/`public_update`
policies (the latter added in the Operations phase, `ohm#9h4c7x2m`). No
role restriction on Check-Out — confirmed with the user, any staff tier
(including Front Desk) can check out a locker. No DELETE policy —
occupancy rows are never hard-deleted.

## Implemented (app level) — Operations Phase (`ohm#9h4c7x2m`, 2026-08-28)

- **Locker Board** (`app/lockers/page.tsx`, `components/locker-board.tsx`):
  real page (was an 8-line stub). Renders one tile per `active=true`
  `lockers` row (live count, currently 100 — not hardcoded). A tile is
  "occupied" when a `locker_occupancy` row exists for that `locker_number`
  with `checked_out_at IS NULL`; occupied tiles show the linked client's
  `codename` (or `guest_label` for walk-ins/guests) and a Check-Out button.
  Header reads `"X / Y occupied"`.
- **Check-Out** (`app/lockers/actions.ts::checkOutLocker`): sets
  `checked_out_at = now()` and `checked_out_by = <acting staff>` on the
  matching `locker_occupancy` row (never deletes it — the row stays as a
  historical record). Ends with an `action_logs` insert
  (`action = "locker_checkout"`), revalidates `/lockers` and
  `/call-sheet`.
- **Call Sheet** (`app/call-sheet/page.tsx`,
  `components/call-sheet-browser.tsx`): read-only, no mutation. Derived
  from the same active (`checked_out_at IS NULL`) `locker_occupancy` rows,
  joined to `services(name)` and filtered to exclude Wet Area, matching
  ADR-001's Wet Area exclusion. **Time field substitution, documented, not
  a schema change**: the mockup's synthetic per-entry `time` doesn't exist
  in the real schema — `locker_occupancy` has no start-time column (that
  concept lives on `bookings`, not joined here). `checked_in_at`
  (formatted HH:MM) is used instead as the time-filter basis, with the
  dropdown built from distinct times actually present in the active rows
  (same "derive from live data" pattern the Logs tab established). Total
  line reads `"X massage(s) [in progress / at TIME]"`.
- **Stale-occupancy filter + nudge** (`ohm#3n8w5tqf`, 2026-09-02,
  implements approaches A + C from audit `ohm#7q2m9xk4`; auto-checkout
  stays out of scope). An active (`checked_out_at IS NULL`)
  `locker_occupancy` row is **stale** when `toSpaDay(checked_in_at) !==
  spaDayNow()` (`lib/analytics/spa-day.ts`'s canonical Analytics-phase
  bucketing, updated in `ohm#spaday8am` to switch to current date at 8:00 AM PHT) — i.e. it was checked in on a prior spa-day and
  never checked out, which previously inflated Call Sheet's "in progress"
  count with dead entries (confirmed live: 1 stale row at audit time, plus
  16/77 historical rows that took >12h to close). Call Sheet's
  `locker_occupancy` select now also fetches `client_id, guest_label,
  clients(codename)`; entries are split server-side into `inProgress`
  (drives the existing count/filter/JPEG export, unchanged) and
  `needsCheckout` (a new read-only "Needs checkout — N from a prior
  spa-day" section below the table — locker/room/service/guest-client/
  checked-in-at, no action buttons). Locker Board tiles for stale
  occupants get a dashed-border/red-label/"Since yesterday" treatment
  (still blocked from reassignment, same unmodified `checkOutLocker`
  button) plus a "`N` lockers need checkout" badge next to the existing
  occupied count. **Not fixed by this change**: `booking-browser.tsx`'s
  Check-in/Check-out tabs (a separate `bookings.status`-keyed read path)
  still show a stale row stuck in "Check-in" indefinitely — flagged as a
  known residual gap for a future prompt, not silently patched here.
- **Stale Locker Auto-Checkout & Sync Fix** (`ohm#lckstalesync`, 2026-09-17):
  Created stored procedure `public.auto_checkout_stale_lockers()` (`20260917120000_auto_checkout_stale_lockers.sql`) to auto check-out unclosed `locker_occupancy` rows checked in prior to the 2:00 AM cutoff date (`v_cutoff_date`), releasing stale rows (JM #9 and ohm #18) and backfilling Nanon's missing occupancy (#8). Updated `app/(staff)/lockers/page.tsx` to invoke `auto_checkout_stale_lockers()` on page load. Reordered `logVisitBooking()` in `app/(staff)/bookings/actions.ts` to assign `locker_occupancy` before setting `bookings.status = 'Completed'`, eliminating orphaned completed bookings without locker records.
- **Default Call Sheet to 'All' Tab, Add Time-based Status Badges, and Fix Missing Client Codename** (`ohm#cllshtstat`, 2026-09-17):
  Fixed client codename resolution in `app/(staff)/call-sheet/page.tsx` using an `extractCodename()` helper that safely handles single objects or arrays from PostgREST joins across both direct `locker_occupancy.client_id -> clients.codename` and linked `bookings.client_id -> clients.codename`, falling back to `guest_label`. Defaulted active tab in `components/call-sheet-browser.tsx` to `"all"`. Added `getSlotStatus()` helper computing Asia/Manila (UTC+8) operating-day status (`In Progress`, `Done`, `Upcoming`) and rendered `TIME` and `STATUS` columns exclusively on the `"All"` tab view (`isAllTab`). Specific time slot tabs retain the standard 5-column layout. Canvas JPEG download export remains clean and reflects resolved client codenames.
- **Fix Call Sheet Slot Status Timeline Offset Bug** (`ohm#cllshttimestat`, 2026-09-17):
  Fixed `getSlotStatus()` in `components/call-sheet-browser.tsx` to calculate linear minutes offset from 8:00 AM turnover for the spa operating day (08:00 AM to 02:00 AM +1d, 0 to 1080+ minutes). Added helper `minutesFrom8am(h, m)` so times prior to 08:00 AM (e.g. 01:00 AM tail slots at +1020 mins) and afternoon/evening slots (e.g. 04:00 PM at +480 mins) evaluate correctly against current Manila time (e.g., 11:30 AM at +210 mins correctly evaluates afternoon/evening slots as `"Upcoming"`).
- **Check-out Confirmation Modal with Early/Pre-Massage Alert** (`ohm#checkoutconfirm`, 2026-09-17):
  Built reusable `CheckoutConfirmModal` component displaying Client Codename, Assigned Locker, and Room & Service. Evaluates client operating status (`getSlotStatus`). Displays high-visibility amber warning box `⚠ Scheduled Massage Alert: Client has a massage scheduled for [Start Time] with [Therapist]. Are you sure you want to check them out early?` when current time is before or during the 90-minute massage window. Displays standard confirmation prompt for Wet Area or completed massages. Intercepted Check Out action buttons across Bookings Check-in tab, Call Sheet (In Progress & Needs Checkout tables), and Locker Board cards. Expanded server queries in `app/(staff)/lockers/page.tsx` and `app/(staff)/call-sheet/page.tsx` to feed modal details.
- **Remove ACTION column and Check Out buttons from Call Sheet** (`ohm#remcallsheetact`, 2026-09-17):
  Enforced operational separation by turning the Call Sheet (`components/call-sheet-browser.tsx`, `app/(staff)/call-sheet/page.tsx`) into a strictly read-only display for floor dispatching (Locker, Room, Service, Thera, Client, Time, Status). Removed `ACTION` column header, `Check Out` button cells, modal bindings, and `needsCheckout` prior spa-day table section from the Call Sheet. Re-aligned grid columns cleanly (7 columns on `"All"` tab, 5 columns on specific slot tabs). Locker check-outs are handled exclusively in the **Lockers Tab** (`components/locker-board.tsx`) protected by `CheckoutConfirmModal`.
- **Scale down Call Sheet typography and row density to match Bookings table styling** (`ohm#callsheettypography`, 2026-09-17):
  Standardized table header styling to `text-xs font-medium tracking-wider uppercase text-muted` with reduced vertical padding `px-4 py-2.5`. Scaled row padding to `px-4 py-2.5 text-sm`. Standardized row cell typography: Locker & Room (`font-mono text-sm font-medium text-foreground`), Service (`text-sm font-medium text-gold`), Therapist (`text-sm text-foreground`), Client (`text-sm font-semibold text-foreground`), Time (`font-mono text-xs text-muted`), and Status badges (`px-2.5 py-0.5 text-xs`). Scaled time slot filter pill buttons to `px-3.5 py-1.5 text-xs font-semibold`. Both `"All"` tab (7 columns) and specific slot tabs (5 columns) maintain clean grid column alignment.
- **Sort Call Sheet by Operating Shift Time (4:00 PM First, 1:00 AM Last)** (`ohm#3f8a2c1d`, 2026-09-21):
  Added `getOperatingMinutes(slotTime: string | null): number` private helper in `components/call-sheet-browser.tsx`. Converts `HH:MM` to absolute minutes from 4:00 PM open; post-midnight times (`h < 6`, e.g. `01:00`) are offset `+24 h` so they sort after PM slots. `null` slot_time returns `9999` (sinks to bottom). Updated the `filtered` `useMemo` to spread-copy and `.sort()`: primary key = operating minutes ascending, secondary key = locker number ascending. Filter pills, `availableSlots`, JPEG export, and server query are unchanged.
- **Enforce Proportional Points Calculation & Display Earned Points in Confirm Check-in** (`ohm#proportionalpointscheckin`, 2026-09-17):
  Dynamically recomputes `pointsDelta` in `LogVisitModal` using `computeLoyaltyPoints` based on `servicePaidAmount`, service price, base points, and formula mode fetched from `app_settings` (defaulting to `"proportional"`). Displays `Points Earned: +X pts` (gold accent) inside the `Confirm Check-in` summary modal for Member clients (`clientId`), while omitting it for walk-ins without an account.
- Both current write paths into `locker_occupancy` — `quick_walkin()` (RPC)
  and `logVisitBooking()`'s linked-booking branch
  (`app/bookings/actions.ts`) — were verified directly (not assumed) to
  reliably populate it at check-in, which is what makes Check-Out safe.
- `one_active_occupant_per_locker` (WHERE checked_out_at IS NULL) ensures one occupant per locker. The previous `one_active_occupant_per_room` index was dropped (`ohm#droprmoccupancy`, 2026-09-17) to decouple 90-minute room massage sessions from all-day locker stays; room availability is strictly enforced by booking time-slot exclusion constraints (`no_double_book_room`).

## Not yet implemented — see roadmap

- No room-management UI (adding/deactivating individual rooms is done via
  Settings' Room/Bed count, not from Lockers/Call Sheet).
- No manual check-in UI from the Lockers page itself — check-in still only
  happens as a side effect of Log Visit / Quick Walk-in on the Bookings
  page, by design (out of scope for this phase, confirmed with the user).
