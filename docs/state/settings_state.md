# Settings — Current State

## Implemented (UI + real Supabase persistence)

`app/settings/page.tsx` fetches current data from Supabase (`services`,
`promos`, `addons`, `staff`, `weekend_slots`, and row counts for `lockers`/
`rooms`) and passes it to `components/settings-browser.tsx`
(`SettingsBrowser`). As of `ohm#5x1p8m3v`, every catalog control below
writes through to the live database via `app/settings/actions.ts` — not
just local React state.

- **Display & Appearance**: dark/light theme toggle switch (sun/moon icons,
  dynamic subtitle), toggles the `.light` class on `document.body`.
  **Local/session-only by design** — no DB write, confirmed with the user
  that a theme preference doesn't need persistence.
- **Account**: signed-in staff badge showing name/position/role. As of
  Staff Auth 6C-6 (`ohm#8r5m1v7z`, 2026-08-29), there is no role-switching
  control here — the real authenticated session (`sessionStaff.id` from
  `lib/staff-context.tsx`) is the sole actor for every mutation below. The
  prior "Simulate Staff" dropdown (a testing aid that let any signed-in
  user view/act as a different role) was removed once RLS made it
  redundant — it granted UI affordances only, never real DB access, once
  6C-2 landed.
- **Services & Pricing**: editable points/price per service (locked for
  Front Desk) → `updateServicePrice`/`updateServicePoints`. `+ Add Service`
  → `addService`. Delete → `deleteService` (**soft delete**, sets
  `active = false`; Supervisor/Owner only). Numeric inputs commit on blur,
  not per keystroke.
- **Promo Codes**: editable discount values (locked for Front Desk) →
  `updatePromoDiscount`. `+ Add Promo` → `addPromo`. Delete →
  `deletePromo` (**soft delete**; Supervisor/Owner only).
- **Weekend Fixed Time Slots**: list with 12-hour formatting, backed by a
  new `weekend_slots` table (`id`, `slot_time`, `created_at`) — nothing in
  the schema modeled this before `ohm#5x1p8m3v`. `+ Add Slot` →
  `addWeekendSlot` (validates HH:MM, rejects duplicates, auto-sorts).
  Delete → `deleteWeekendSlot` (**hard delete** — nothing references this
  table via FK, so no soft-delete flag needed). Seeded with the 7 default
  times the UI already showed (`16:00`–`01:00`) so the switch to
  persistence didn't visually empty the list.
- **Add-ons**: editable price per add-on → `updateAddonPrice`. `+ Add
  Add-on` → `addAddon`. Delete → `deleteAddon` (**soft delete**; the
  "minimum 1 active add-on" safeguard is now enforced **server-side**,
  not just via a disabled button).
- **Capacity**:
  - **Lockers**: `+ Add 10 Lockers` → `addLockerBatch`, inserts 10 new
    rows at `max(number)+1 .. +10`, `active = true`. Never updates or
    removes existing rows.
  - **Rooms/Beds**: a single editable count →`updateRoomCount`. Increasing
    the count inserts new sequential `rooms` rows. **Decreasing the count
    deactivates** (`active = false`) the highest-numbered active rooms
    down to the target — never a hard delete, since `bookings.room_number`
    FKs to `rooms`. Commits on blur, not per keystroke.
- Toast feedback (bottom-center, auto-fade) on every mutation above —
  now reflects the actual server-action result (shows the real error on
  failure, not a blind "updated" message).
- Every mutation above writes an `action_logs` row attributed to the real
  authenticated session (`sessionStaff.id`).

## RLS — real, identity-keyed role enforcement (Staff Auth 6C-4)

As of Staff Auth 6C-4 (`ohm#9d2k6y4p`, 2026-08-29), the gap below is closed:
`supabase/migrations/20260829150000_settings_catalog_rls.sql` replaced every
`public_*` policy on `services`/`promos`/`addons`/`rooms`/`lockers`/
`weekend_slots` with identity-keyed policies reusing 6C-2's role helpers
(`is_staff()`, `is_supervisor_or_above()`). SELECT requires `is_staff()` on
all six tables; INSERT/UPDATE require `is_supervisor_or_above()` (no
distinction beyond that blanket rule — same for every table/operation).
`weekend_slots` additionally has a real `staff_delete` policy
(`is_supervisor_or_above()`), the only hard-DELETE case of the six —
confirmed via a live FK scan that nothing references `weekend_slots`.
`lockers` has no UPDATE policy (never updated — add-only, per the batch-add
logic below); `services`/`promos`/`addons`/`rooms` have no DELETE policy
(all four are still FK-referenced by historical `sales`/`bookings`/
`sale_addons`/`locker_occupancy`/`therapist_services` rows, confirmed live —
"delete" in the UI stays a soft `UPDATE ... SET active = false`).

**One real discrepancy caught by reading `settings-browser.tsx` directly,
not assumed from the prior "locked for Front Desk" framing**: only
Services and Promos actually had a UI role lock (`canEditServices`/
`canEditPromos`) before this sub-step — Add-ons, Weekend Slots, Lockers,
and Rooms/Beds had **no** UI lock at all, so any role could click Add/
Delete/edit in those four sections. Closed alongside the RLS migration: a
new shared `canEditCatalog` flag (same `Supervisor`/`Owner` check, same
disabled-button/tooltip pattern as the existing two) now gates all four
previously-unlocked sections too, so the UI honestly reflects the DB rule
instead of showing enabled controls that would then fail server-side.

**No DELETE policy exists on `services`, `promos`, `addons`, `rooms`, or
`lockers`** — all are FK-referenced by historical rows, so "delete" stays a
soft `UPDATE ... SET active = false` / deactivate, and the existing read
queries already filter `.eq("active", true)`.

## `app_settings` table (Client Portal 7A-1, `ohm#7a1f9c2k`, 2026-08-29)

A new singleton table, **not** part of the catalog-persistence pattern
above — no generic key/value or config table existed before this prompt,
so this was created as the smallest reasonable home for a standalone
boolean flag rather than shoehorned into an existing catalog table.

- `app_settings`: single row (`id boolean primary key default true`,
  `check (id)` enforces exactly one row), seeded by its migration.
- `allow_receptionist_manual_points` (boolean, default `false`) — gates
  whether Front Desk can enter manual points-ledger `ADJUSTMENT` entries
  for client backtracking from the prior system (Client Portal feature,
  not built yet — see [[client_portal_state]]). Supervisor and Owner tiers
  are unaffected by this toggle (always permitted), per ADR-001.
- RLS: `app_settings_select` (`is_staff()`), `app_settings_update`
  (`is_owner()` on both `USING`/`WITH CHECK` — "Owner-editable only," no
  Supervisor write access to the flag itself, distinct from the flag's own
  Supervisor/Owner-always-permitted downstream effect). No INSERT/DELETE
  policy — singleton, seeded once by migration.
- No UI reads or writes this table yet — this prompt was database-layer
  only.

## Not persisted — deliberately, not an oversight

**Display/Appearance** (theme) remains local/session-only — confirmed with
the user as correct to leave unpersisted, since it's a per-device
preference, not app state that needs to survive a refresh or be shared
across sessions.
