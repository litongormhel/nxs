# Clients — Current State

## Implemented

- **Update Portal Login Redirect and Confirmation Flow to Member Dashboard (`ohm#5d8f1e2c`, 2026-09-21)**:
  - Updated portal login success handler in `app/portal/login/page.tsx` from `router.push("/portal/confirmation")` to `router.push("/portal")`, routing logging-in members directly to their Points & Past Visits dashboard.
  - Enhanced the registration confirmation screen (`app/portal/confirmation/page.tsx`) by adding a prominent primary CTA button ("Go to Dashboard →") leading to `/portal`, while retaining the secondary "View my Member QR →" link.

- **Member Portal Dashboard for Points Summary & Past Visits (`ohm#6b8a2c4e`, 2026-09-21)**:
  - Mounted dedicated member dashboard route at `app/portal/page.tsx`, authenticated via HMAC session token (`getPortalAccountId()` in `lib/portal/session.ts`).
  - Implemented high-performance data querying with parallelized `Promise.all` via `createServiceClient()`:
    - Primary key index lookup on `clients.id` to retrieve member profile, username, member code, and live `points_balance` in O(1) time without full-table aggregations.
    - Indexed lookup on `bookings` filtered by `client_id` and `status = 'Completed'`, sorted descending by date/time and capped at 10 visits, with foreign key joins to `services` and `therapists`.
    - Server-side QR data URL generation via `qrcode` using `client_portal_accounts.qr_token`.
  - Built responsive `MemberDashboard` component (`components/client-portal/member-dashboard.tsx`):
    - Profile & Points Summary card with member greeting, `@username`, Member Code (`#M-...`), live Points Balance display, and "Log out" button (via `logoutPortalAction` in `app/portal/actions.ts`).
    - "Member QR" trigger opening modal with large QR code and counter check-in instructions.
    - Responsive past visits section rendering formatted date, 12-hour time, service name, therapist name, duration, and status badge, with empty state handling (*"No past visits recorded yet"*).
  - Styled with NXS dark theme semantic tokens (`bg-surface`, `bg-surface-2`, `border-border`, `text-gold`, `text-foreground`, `text-muted`).

- **Exclude Upcoming and Unchecked-in Advance Bookings from Walk-in Guests Profile Tab (`ohm#9f3e1b7c`, 2026-09-21)**:
  - Audited `rawWalkIns` query processing in `app/(staff)/clients/page.tsx` with respect to Philippine operating time (`Asia/Manila`, UTC+8).
  - Excluded future scheduled booking dates (`booking_date > todayManila`) and unlogged/un-checked-in advance bookings from the **Walk-In Without Account** tab.
  - A walk-in booking is strictly included only if status is `completed`, `in_service`, or has a direct `locker_occupancy` or `sales` record linked by `booking_id`. Bookings with status `Booked`, `Needs Reassignment`, `Cancelled`, `No-show`, `confirmed`, or `pending` that have not checked in yet are filtered out.
  - Added defensive status and payment/locker checks in `groupedWalkIns` aggregation in `components/client-browser.tsx`, guaranteeing that `TOTAL VISITS` count (`visitCount`) and `LAST VISIT DATE` (`lastVisitDate`) strictly reflect actual past/completed visits.
  - Preserved backward compatibility for all completed walk-in visits created via Quick Walk-in or Log Visit.

- **Walk-In History Drawer, Locker Resolution & Zero Amount Formatting (`ohm#4c9e2b1a`, 2026-09-21)**:
  - Mounted interactive slide-over history drawer in `components/client-browser.tsx` for walk-in guests (`activeWalkInGroup`), triggered by clicking "View Past Stays →" or the guest table row.
  - Visit cards show: Visit #, Date, 12-hour Time, Service, Therapist, Massage Time, Room (`Room [Num]` or `None (Wet Area)`), Locker (`Locker [Num]` or `None`), Amount Paid & Payment Method, Status, and Booking ID. Adheres to semantic design tokens for light and dark modes.
  - Resolved locker numbers in `app/(staff)/clients/page.tsx` and `components/client-browser.tsx` using cascading fallbacks (relational `booking_id` join -> historical `locker_occupancy` by `booking_id` -> historical occupancy by `guest_label` and date -> latest historical locker for guest -> table-level visit fallback), ensuring past walk-ins (e.g. "L", "jave", "VINCE") display their assigned locker instead of "—".
  - Fixed amount formatting from truthy checks to strict null/undefined checks (`amount != null`), ensuring ₱0 amounts explicitly render as `₱0` (or `₱0 (Payment Method)`).

- **Walk-In Visit History Drawer Time Formatting & Massage Time (`ohm#walkindrawertimeformat`, 2026-09-17)**:
  - Added `formatTime` helper in `components/client-browser.tsx` using `toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })` to format timestamps into standard 12-hour AM/PM format (e.g., `11:30 PM`).
  - Updated visit card header timestamp display from `Sep 17, 2026 · 23:30` to `Sep 17, 2026 · 11:30 PM`.
  - Added dedicated **MASSAGE TIME** block to the visit card details grid showing formatted 12-hour time or `<span className="text-muted italic">None (Wet Area)</span>`.
- **Walk-In Without Account Table Pagination (`ohm#walkinpagination`, 2026-09-17)**:
  - Added state management for pagination in `components/client-browser.tsx`: `pageSize` (default 10, options: 10, 20, 50, 100) and `currentPage` (default 1).
  - Automatically resets `currentPage` to 1 whenever search query or `pageSize` changes.
  - Slices filtered guest records (`paginatedWalkIns = filteredWalkIns.slice(startIndex, startIndex + pageSize)`) for rendering.
  - Added pagination control bar below the table featuring status indicator (`Showing X–Y of Z guests`), dark token rows per page dropdown (`bg-[#141210] border-[#292524] text-[#f5f5f4]`), page indicator (`Page X of Y`), and page navigation buttons (`Previous` & `Next`).
- **Strict Portal Account Member Guard (`ohm#clienttabsandpurge`, 2026-09-17)**:
  - `app/(staff)/clients/page.tsx` filters `registeredMembers` strictly to clients who have a matching row in `client_portal_accounts` (`has_portal_account === true`). Prevents clients without portal credentials from polluting the **Members** tab.
  - Migration `supabase/migrations/20260917160000_purge_clients_without_portal_account.sql` purges non-portal clients from `clients` while disassociating `client_id` (`NULL`) and setting `guest_label = c.codename` across historical `bookings`, `sales`, and `locker_occupancy`, ensuring past stays appear under **Walk-In Without Account**.
- **Two-Tab Client Profile Browser (`ohm#clienttabsandpurge`, 2026-09-17)**:
  - Top-level tab switcher in `components/client-browser.tsx`:
    - **Members**: Displays registered client accounts with portal access. Search filters by `@username`, codename, or member code (`#M-...`). Retains points balance badge, QR profile card modal, Log Availed Service, and immutable transaction ledger (`point_transactions`).
    - **Walk-In Without Account**: Displays non-account walk-in guest records (`client_id IS NULL` & `guest_label IS NOT NULL`). Search filters by guest codename (e.g. "Wax", "Marky") or visit date. Renders structured table showing `Codename`, `Last Visit Date`, `Total Visits`, `Latest Service`, `Latest Therapist`, `Locker`, and `Amount Paid`. Includes slide-over drawer to inspect full past visit history for any walk-in guest codename. Duplicate guest codenames are preserved independently without identity merge.
- `app/(staff)/clients/page.tsx` — server component. Queries `clients` table for registered members and queries `bookings` (`client_id IS NULL` & `guest_label IS NOT NULL`) joining `services`, `therapists`, `sales`, and `locker_occupancy` for non-member walk-ins.
- **Log Visit (Core Loop `ohm#7f3k9d2m`)** — "Log Visit" button in the detail panel opens `components/log-visit-modal.tsx`: service select (drives points earned), redemption toggle (disabled below 100 pts), payment method + amount, and staff picker. Submits via `logVisit` server action (`app/(staff)/clients/actions.ts`) into `public.log_visit(...)`.
- **Database Cleanup Migration (`supabase/migrations/20260917150000_purge_legacy_clients.sql`)**:
  - Purges legacy clients without a booking or visit on today's operating date (`2026-09-17` Manila time).
  - Preserves historical references by copying `codename` to `guest_label` and disassociating `client_id` (`NULL`) across `bookings`, `sales`, and `locker_occupancy` for purged clients.
  - Deletes orphaned `client_portal_accounts` and `point_transactions` (temporarily disabling `trg_block_ledger_delete`), then deletes purged clients from `clients`.

## Schema (`public.clients`)

Columns: `id`, `codename` (not null — the only display identity), `username`
(not null), `member_code` (not null), `password_hash` (nullable),
`points_balance` (default-managed, not null), `phone`, `email`,
`birth_day`/`birth_month` (checked 1–31 / 1–12), `investor` (bool),
`privacy_consent` (bool), `qr_token`, `since_date`, `created_at`.

No legal-name column exists. No companion/tagging construct exists.

## RLS

**Real role-based RLS as of Staff Auth 6C-2 (`ohm#5m8t2x6b`, 2026-08-29)**:
`clients` has `staff_select` (`SELECT`, `USING (is_staff())`) and `staff_insert`
(`INSERT`, `WITH CHECK (is_staff())`) — both keyed off `is_staff()`.
**No UPDATE policy exists on `clients`** — `points_balance` only ever changes
via the `SECURITY DEFINER` trigger described in [[points_ledger_state]]. No DELETE policy.

## Not yet implemented — see roadmap

- Client creation/edit UI (no insert/update path in the app).
- QR-based lookup/check-in flow (schema has `qr_token`, no UI consumes it).
- Client-facing mobile app (referenced by schema shape, not in this repo).
- Squad Goals / companion features (mentioned in project framing, no schema or UI backing exists at all).
