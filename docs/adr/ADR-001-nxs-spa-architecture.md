---
name: nxs-architecture-locks
---

# ADR-001 — NXS Spa Architecture Invariants

Compact list of decisions no AI session should silently change. Verified
directly against the live Supabase schema (project `zqwiqrvqyinacjozubtc`,
migrations `01`–`63`) on 2026-09-24, not assumed from convention.

1. **Points ledger immutability.** `public.point_transactions` blocks
   UPDATE and DELETE at the trigger level
   (`trg_block_ledger_update`, `trg_block_ledger_delete` →
   `block_ledger_mutation()`). Balance mutation happens only through new
   INSERT rows, applied via `trg_apply_points_delta` →
   `apply_points_delta()`. Corrections must be new `ADJUSTMENT`-type rows,
   never edits to existing rows. Direct execution of `apply_points_delta()`
   is revoked from `public, anon, authenticated` — it fires strictly via trigger.

2. **No-double-booking is DB-enforced, not app-enforced.** `bookings` carries
   two GiST exclusion constraints — `no_double_book_room` and
   `no_double_book_therapist` — over `(resource_id, tsrange(start_ts,
   end_ts))`, scoped to statuses `Booked`, `Completed`, `Needs Reassignment`.
   The app must not add its own conflicting-booking check as the source of
   truth; the constraint is. Room availability is decoupled from locker stays
   (`one_active_occupant_per_room` is dropped); physical room sessions are
   governed strictly by `no_double_book_room`.

3. **Sales/ledger separation.** `sales` and `point_transactions` are
   distinct tables. The only link is the optional `point_transactions.sale_id`
   FK. Never collapse them into one table, one write path, or one view —
   sales stay mutable/voidable, the ledger stays append-only. Split payments
   (`Split (Cash + GCash)`) insert two distinct `sales` records referencing
   the same visit to preserve distinct remittance accounting.

4. **Codename / Name over legal name.** `clients` has no legal-name column. Only
   `codename` (display identity, labeled as "Name" or "Codename" across UI)
   and `username` exist. Do not add a legal-name field without an explicit,
   separate architectural decision.

5. **One-device login (client app).** `clients` has a single
   `password_hash` column per client — schema shape supports single-credential
   login. Enforcing "only one active device/session" is an app-level
   concern; do not assume multi-device session tables exist.

6. **Staff auth is complete; RLS is identity-keyed on every table.** Every
   route requires a real Supabase Auth session (`proxy.ts`), every
   `public` table's RLS is keyed off `auth.uid() → staff.user_id →
   staff.position` via shared role helpers (`is_staff()`,
   `is_supervisor_or_above()`, `is_owner()`, `current_staff_position()`),
   and there is no "Simulate Staff" role-spoofing mechanism anywhere in the
   app. `action_logs.staff_id` (and every actor-attribution column) is
   populated from the real authenticated session, never a placeholder picker.

7. **Spa Day Operational Window & 8:00 AM Turnover Lock.**
   The spa operating day does not align to calendar midnight (00:00).
   The canonical turnover occurs at **8:00 AM Asia/Manila (UTC+8)**:
   - Operating shifts run from 4:30 PM open to 1:00 AM last call.
   - Operations from 12:00 AM to 07:59 AM PHT belong to the *previous* calendar
     date's Spa Day (`manilaDate - 24h`), evaluated authoritatively via
     `toSpaDay()` / `spaDayNow()` in `lib/analytics/spa-day.ts`.
   - Overnight locker turnover and stale occupancy cleanup
     (`public.auto_checkout_stale_lockers()`) evaluate against yesterday's
     8:00 AM turnover timestamp (`v_cutoff_ts := ((v_date_ph - 1) + time '08:00:00') AT TIME ZONE 'Asia/Manila'`),
     preventing premature checkouts during active shifts.
   - Unvisited advance bookings (`Booked`, `Needs Reassignment`) auto-cancel past
     the 2:00 AM cutoff (`auto_cancel_lapsed_bookings()`).

8. **Canonical 80-Minute Duration Standard & Prime Scrub Massage Lock.**
   - The canonical duration for standard massage services (`Combi Massage`,
     `Signature Massage`, and default `services.duration_minutes`) is strictly
     **80 minutes**. Legacy 90-minute and 60-minute duration standards are retired.
   - `Prime Scrub Massage` (80 minutes, ₱1,800, 12 points, `requires_therapist = true`)
     is the single source of truth for all scrub services. Legacy and duplicate
     scrub catalog entries (`Scrub`, `Scrub + Massage`) are permanently deactivated,
     and all historical foreign keys (`bookings`, `sales`, `locker_occupancy`,
     `therapist_services`) point exclusively to `Prime Scrub Massage`.

9. **Wet Area Architecture Lock (`requires_therapist = false`).**
   - The `services.requires_therapist` boolean column strictly defines whether
     a service requires staff practitioner assignment.
   - Facility-only services where `requires_therapist = false` (`Wet Area`):
     - Must completely bypass therapist assignment (`therapist_id = null`) and room
       assignment (`room_number = null`).
     - Must completely bypass all therapist availability checks (absence, leave,
       recurring day-off, break slots, and `check_therapist_availability` trigger).
     - Must completely bypass all therapist reassignment checks and alert badges,
       including `<ReassignmentPanel />` and action prompts.
     - Still allocate physical locker occupancy (`public.locker_occupancy`).

10. **Slot Lifecycle, Concurrency & Capacity Consumption Rules.**
    - `Completed` (and checked-out) bookings continue to consume therapist and
      room capacity and remain strictly locked under the GiST exclusion constraints
      (`no_double_book_room`, `no_double_book_therapist`) for their scheduled window,
      preventing historical schedule alterations or retroactive collisions.
    - `No-show` and `Cancelled` bookings do NOT consume DB capacity:
      - `No-show` bookings are excluded from the GiST constraint scope and excluded
        from active floor dispatching (`Upcoming` tab in Bookings).
      - `Cancelled` bookings release therapist and room slots immediately.
    - Active operational day slots remain bookable up to a strict 20-minute past-time
      grace period (`isSlotPastGracePeriod`), after which they are disabled.
    - Scheduled therapist break slots (`public.therapist_breaks`) dynamically reduce
      bookable therapist capacity and are blocked by DB trigger
      `check_therapist_availability()` with exception `'THERAPIST_UNAVAILABLE: Break'`.

11. **Elevated Service Client & RPC Security Standards.**
    - Privileged server actions, administrative scripts, and background crons requiring
      RLS bypass (e.g. settings persistence, automated cron cleanup, staff provisioning)
      must use `createServiceClient()` (`SUPABASE_SERVICE_ROLE_KEY`), with fallback to
      authenticated `createClient()`. Service-role keys must never leak to client bundles.
    - Administrative and cron RPCs (`auto_checkout_stale_lockers()`,
      `auto_cancel_lapsed_bookings()`, `verify_void_pin()`, `void_sale_with_pin()`,
      `restore_sale_with_pin()`, `set_void_auth_code()`) must explicitly revoke
      execution privileges: `REVOKE EXECUTE ... FROM public, anon;`, granting execution
      strictly to `service_role` and `authenticated`.
    - All `SECURITY DEFINER` stored procedures must explicitly declare
      `SET search_path = 'public'` to mitigate search-path hijacking vulnerabilities.

## Client Identity (amended)

- Client identity remains a SINGLE free-text field, no separate legal-name
  column. The field is relabeled from "Codename" to "Name" across all
  surfaces (client-facing, staff-facing, reports) to reflect that clients
  may enter either an alias or their real name at their own discretion.
  This is a label/terminology change only — the underlying structural
  invariant (one identity field, no legal-name column) is unchanged.

## Client Portal (new)

- A new client-facing domain, entirely separate from Staff Auth (Phase 6A).
  Client accounts are NOT staff accounts and share no session, role, or
  RBAC context with the staff tier system.
- New table `client_portal_accounts`: client_id (FK), phone (unique),
  pin_hash, username (system-fixed, distinct from Name, never encoded in
  QR payload).
- New column `clients.phone` (nullable — not all clients have a portal
  account). Classified as PII. Display default: masked, last 4 digits
  only. Full number requires explicit staff reveal action, which MUST be
  logged to Activity Logs (new event type: `phone_number_revealed`,
  capturing revealing staff, target client, timestamp).
- Registration flow: client scans a static, non-expiring Master QR
  (registration entry point, not per-client/per-token) → submits
  phone + PIN + Name → system attempts to match existing `clients.phone`;
  match links portal account to existing client_id (preserves points
  history), no match creates a new client record.
- Post-registration, each account has a permanent Member QR (client-side,
  in-app) used for reception check-in lookup. This is an ADDITIVE lookup
  path into the existing `log_visit` RPC — the RPC contract, atomicity,
  and ledger triggers established in Phase 1 are unchanged.
- Manual points entry (client backtracking from prior system) uses the
  EXISTING Points Ledger `ADJUSTMENT` entry type — no new entry type, no
  ledger schema change. Gated by new Settings flag
  `allow_receptionist_manual_points` (Owner-controlled toggle). Supervisor
  and Owner tiers are unaffected by the toggle (always permitted).

## Changelog

- 2026-09-24 (`ohm#5e9a2d8f`) — Comprehensive audit and update to ADR-001. Added Invariant 7 (8:00 AM Spa Day turnover lock & operational window), Invariant 8 (80-minute canonical duration standard & Prime Scrub Massage single source of truth), Invariant 9 (Wet Area architecture lock & therapist bypass), Invariant 10 (Slot lifecycle, GiST capacity consumption, 20-min grace period, therapist break slots), and Invariant 11 (Elevated service client & RPC permissions revocation). Synchronized between `.ai/architecture_locks/` and `docs/adr/`.
- 2026-08-29 — Added Client Portal domain (client_portal_accounts, clients.phone, Master/Member QR flow). Relabeled Codename → Name. Added Activity Log event type for phone reveal. Added Settings flag for manual points entry.
- 2026-08-27 — Initial baseline lock (Invariants 1–6).
