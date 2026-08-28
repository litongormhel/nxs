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
- **Account & Staff Simulation**: signed-in staff badge + `Simulate Staff`
  dropdown that switches the active simulated actor and role permissions
  (`Front Desk` vs `Supervisor` / `Owner`). **Local/session-only by
  design** — it's a testing aid, not app state; the selected `staff.id` is
  a real row from the `staff` table and flows into every mutation below as
  the `action_logs` actor.
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
- Every mutation above writes an `action_logs` row via the same
  placeholder-actor pattern as Bookings/Core Loop
  (`// TEMP: placeholder actor pending Staff Auth phase`) — the actor is
  whichever `staff.id` is selected in Simulate Staff.

## RLS — app-level-only role gate (explicitly accepted gap)

Migration `supabase/migrations/20260828011724_settings_persistence_rls.sql`
added: a new `weekend_slots` table with `public_select`/`public_insert`/
`public_delete` policies; `public_insert`/`public_update` policies on
`services`/`promos`/`addons`/`rooms`; `public_insert`-only on `lockers`.
All follow the same shape as every prior additive policy in this project —
role `public`, `USING (true)` / `WITH CHECK (true)`.

**These policies grant INSERT/UPDATE capability at the DB level to any
anon/authenticated caller.** The actual "Front Desk can't edit,
Supervisor/Owner can" restriction is enforced **only** in
`settings-browser.tsx`'s `canEditServices`/`canEditPromos` checks (driven
by the Simulate Staff selector) — **not** at the RLS layer. This mirrors
the same explicitly-accepted gap noted throughout this project (see
ADR-001, point 6): it closes when real Staff Auth lands, not before.

**No DELETE policy exists on `services`, `promos`, or `addons`** — all
three are FK-referenced by historical `sales`/`bookings`/`sale_addons`
rows, so "delete" in this UI is always a soft `UPDATE ... SET active =
false`, and the existing read queries already filter
`.eq("active", true)`.

## Not persisted — deliberately, not an oversight

Only **Display/Appearance** (theme) and **Account & Staff Simulation**
remain local/session-only. Both were confirmed with the user as correct to
leave unpersisted: a theme preference and a testing aid, not app state
that needs to survive a refresh or be shared across sessions.
