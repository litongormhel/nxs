# Settings — Current State

## Implemented (app level, UI-only)

`app/settings/page.tsx` fetches initial seed data from Supabase
(`services`, `promos`, `addons`, `staff`, `lockers`, `rooms`) and passes it
to `components/settings-browser.tsx` (`SettingsBrowser`), which implements
full HTML mockup parity (`ohm#6j2v9s4k`):

- **Display & Appearance**: dark/light theme toggle switch (sun/moon icons,
  dynamic subtitle), toggles the `.light` class on `document.body`.
- **Account & Staff Simulation**: signed-in staff badge + `Simulate Staff`
  dropdown that switches the active simulated actor and role permissions
  (`Front Desk` vs `Supervisor` / `Owner`).
- **Services & Pricing**: editable points/price per service (locked for
  Front Desk), `+ Add Service` modal, delete (Supervisor/Owner only).
- **Promo Codes**: editable discount values (locked for Front Desk),
  `+ Add Promo` modal, delete (Supervisor/Owner only).
- **Weekend Fixed Time Slots**: list with 12-hour formatting, `+ Add Slot`
  modal (HH:MM validation, auto-sort), delete.
- **Add-ons**: editable price per add-on, `+ Add Add-on` modal, delete
  (minimum-1 safeguard).
- **Capacity**: locker count with `+ Add 10 Lockers`, editable room/bed
  count input.
- Toast feedback (bottom-center, auto-fade) on every mutation above.

## Not yet implemented — deliberately deferred

**No Supabase persistence for any edit made in this UI.** Every control
above — theme, staff simulation, service/promo/slot/add-on/capacity
edits — is local React component state (`useState` in
`settings-browser.tsx`). Nothing is written back to the database: a page
refresh reverts every change to whatever `app/settings/page.tsx` last read
from `services`/`promos`/`addons`/`staff`/`lockers`/`rooms`. There is no
`app/settings/actions.ts` and no mutation calls (`insert`/`update`/`delete`)
anywhere in `settings-browser.tsx`.

This mirrors the **"Staff Auth intentionally deferred"** pattern used
elsewhere in these docs: it is a known, deliberate next phase — not a bug,
not an oversight, not something a future session should assume is wired up
just because the UI looks complete. Wiring this UI to real persistence
(deciding whether catalog config continues to live directly in
`services`/`addons`/`promos`/`rooms`/`lockers` or moves to a generic
settings store, plus building the corresponding server actions) is
explicitly out of scope here and belongs to a separate follow-up prompt.
