# Settings — Current State

## Tab structure (`ohm#9x3f7mq2`, 2026-09-01)

`SettingsBrowser` is one component with internal tab state
(`useState<SettingsTab>`) and a local `TabButton`, mirroring the pattern in
`components/analytics-tabs.tsx` (the tab-state logic actually lives there,
not in `analytics-browser.tsx` itself — the source prompt assumed the
latter). No new routes, no RBAC/visibility changes — every section's
existing `canEdit*` gate stays exactly where it was, just re-parented under
a tab:

- **General** — Display (Appearance/theme toggle), Account
- **Services & Loyalty** — Services & Pricing, Loyalty Points Formula
- **Promos & Security** — Void Authorization Code, Promo Codes
- **Scheduling & Capacity** — Weekend Fixed Time Slots, Add-ons, Capacity

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
  that a theme preference doesn't need persistence. As of `ohm#7t3m8vw1`
  (2026-08-29), theme state lives in a root-level `lib/theme-context.tsx`
  (`ThemeProvider`/`useTheme()`, wrapped around `{children}` in
  `app/layout.tsx`) instead of local state inside `SettingsBrowser` — the
  previous local-state version reverted to dark the instant you navigated
  away from Settings, because its `useEffect` cleanup ran on unmount and
  unconditionally stripped `.light` from `document.body`. Persistence is
  still `localStorage` only, read/written by the provider.
  **Follow-up (2026-08-29, same day)**: after the propagation fix, light
  mode was reported readable in Settings but broken elsewhere — several
  components across the app (`booking-browser.tsx`, `call-sheet-browser.tsx`,
  `locker-board.tsx`, `logs-browser.tsx`, `sales-browser.tsx`,
  `staff-browser.tsx`, `therapist-browser.tsx`, `confirm-dialog.tsx`, plus
  `settings-browser.tsx` itself) used hardcoded hex backgrounds
  (`bg-[#1d1610]`, `bg-[#14100b]`, `bg-[#2a1f14]`, `bg-[#4a1f1f]`,
  `bg-[#2a1414]`) for input fields, dropdown/filter controls, booking rows,
  and the occupied-locker card, paired with theme-variable text
  (`text-foreground`/`text-muted`) or pale accent text
  (`text-[#f3d48b]`/`text-[#d18b8b]`/`text-[#d9a441]`/`text-[#8a9a76]`) —
  those backgrounds never flipped in light mode, so the text became
  low/no-contrast against a background that stayed dark. Fixed by adding
  theme-aware CSS custom properties to `app/globals.css`
  (`--surface-2`, `--surface-accent`, `--accent-gold`, `--accent-red`,
  `--accent-amber`, `--accent-green` — dark-mode values identical to the
  original hardcoded hex, so dark mode is visually unchanged) and swapping
  every affected class for the new `bg-surface-2`/`bg-surface-accent`/
  `text-accent-*` utilities. The Settings theme-toggle switch's own
  "off" track color intentionally stayed hardcoded `bg-[#1d1610]` — it's a
  fixed component-intrinsic style (the dark side of the switch itself), not
  page chrome. Verified all 10 tabs plus the Add Staff/Add Therapist/Edit
  Sale modals in light mode; dark mode re-checked pixel-identical to
  before via side-by-side screenshots.
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
- **Promo Codes** (`ohm#3n7x9kwp`, 2026-09-01 — narrowed from
  Supervisor/Owner to **Owner-only**, at all three layers: UI
  (`canEditPromos`), server action (`requireOwner()` in
  `app/(staff)/settings/actions.ts`, resolves role from
  `auth.getUser() → staff.user_id → staff.position`, ignores the
  client-supplied `staffId` param for the auth decision), and RLS
  (`staff_insert`/`staff_update` on `promos` now `is_owner()`, was
  `is_supervisor_or_above()` since 6C-4). `staff_select` stays `is_staff()`
  — read access unchanged. No hardcoded fallback promos array anymore —
  `app/(staff)/settings/page.tsx` passes `promosError` alongside
  `initialPromos`; the UI shows a distinct "couldn't load" state vs. "no
  promos configured yet" instead of ever substituting stale local data.
  Discount edits (`updatePromoDiscount`) use per-row draft state with
  explicit Save/Cancel (was auto-save-on-blur) — each row has its own
  dirty flag, since promos are an independent-field list rather than one
  settings object (contrast with the Loyalty Formula's single-object
  draft/save below). `+ Add Promo` → `addPromo` and Delete → `deletePromo`
  (**soft delete**) remain immediate, unchanged.
- **Weekend Fixed Time Slots**: list with 12-hour formatting, backed by a
  new `weekend_slots` table (`id`, `slot_time`, `created_at`) — nothing in
  the schema modeled this before `ohm#5x1p8m3v`. `+ Add Slot` →
  `addWeekendSlot` (validates HH:MM, rejects duplicates, auto-sorts).
  Delete → `deleteWeekendSlot` (**hard delete** — nothing references this
  table via FK, so no soft-delete flag needed). Seeded with the 7 default
  times the UI already showed (`16:00`–`01:00`) so the switch to
  persistence didn't visually empty the list.
- **Add-ons**: price editing switched from auto-save-on-blur to **per-row
  draft state with explicit Save/Cancel** (`ohm#9x3f7mq2`, 2026-09-01),
  matching the Promo Codes pattern below (Services & Pricing still uses
  onBlur — the two didn't actually share one pattern, so Add-ons was built
  to match whichever one had a Save button) → `updateAddonPrice` (action
  unchanged, only the UI trigger changed). `+ Add Add-on` → `addAddon`.
  Delete → `deleteAddon` (**soft delete**; the "minimum 1 active add-on"
  safeguard is now enforced **server-side**, not just via a disabled
  button).
- **Delete confirmation** (`ohm#4k9p2xq7`, 2026-08-29): all 4 delete flows
  above (Service/Promo/Weekend Slot/Add-on) go through a shared
  `components/confirm-dialog.tsx` (`ConfirmDialog`) instead of the native
  `window.confirm()` — styled to match the existing Add-flow form-modal.
  Add flows across Settings/Staff/Therapist Roster were left as-is: they
  are already form-modal submissions with Cancel/Confirm, which the
  prompt's own scope treats as not needing an extra confirm step. Staff
  and Therapist Roster have no delete UI at all (add-only), so there was
  nothing to change there.
- **Soft-delete + historical-record preservation for Services/Promos**
  (`ohm#1d5r6nz4`, 2026-08-29) — re-verified, not changed: this prompt's
  requirements (soft delete instead of hard delete, active-only dropdown
  filtering, FK-joined historical display, no `ON DELETE CASCADE` risk)
  were all already satisfied by `ohm#5x1p8m3v`/6C-4 (see the bullets
  above and the RLS section below). No migration or code change was made.
- **Capacity** (stepper UX as of `ohm#9x3f7mq2`, 2026-09-01 — both rows now
  `[count] [−] [+] [Save]`, draft-then-Save instead of committing on blur):
  - **Lockers**: **increment-only** — `lockers` has no RLS UPDATE policy
    at all (confirmed live before coding), so there is no decrement path
    to wire up. `[+]` bumps a local add-count draft, `[−]` is
    disabled/grayed with a tooltip ("Lockers can only be added, not
    removed"), Save calls `addLockers(count, staffId)` — a new
    parameterized action (replaces the old hardcoded-10 `addLockerBatch`,
    same INSERT-only shape/RLS, just takes the draft count instead of a
    fixed 10). Never updates or removes existing rows.
  - **Rooms/Beds**: real ±1 stepper — `[−]`/`[+]` adjust a local draft
    int, Save calls the existing `updateRoomCount(target, staffId)`
    unchanged. Increasing inserts new sequential `rooms` rows;
    **decreasing deactivates** (`active = false`) the highest-numbered
    active rooms down to the target — never a hard delete, since
    `bookings.room_number` FKs to `rooms`.
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
all six tables; INSERT/UPDATE required `is_supervisor_or_above()` (no
distinction beyond that blanket rule — same for every table/operation).

**Promos is now the one exception to that blanket rule**
(`ohm#3n7x9kwp`, 2026-09-01,
`supabase/migrations/20260901160000_promos_owner_only_rls.sql`):
`staff_insert`/`staff_update` on `promos` tightened from
`is_supervisor_or_above()` to `is_owner()`, matching the Owner-only tier
`app_settings_update` already used. `staff_select` on `promos` is
unchanged (`is_staff()`). Services/Add-ons/Rooms/Lockers/Weekend Slots
still use `is_supervisor_or_above()` for INSERT/UPDATE, untouched by this
prompt.
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

## Loyalty Points Formula — schema + config UI (`ohm#9k3m7qxc`, 2026-09-01,
Part 1 of 2)

Adds owner-configurable loyalty formula fields to the same `app_settings`
singleton above. **Wired into the live points-award path as of Part 2
(`ohm#2r8w5nfz`, 2026-09-01)** — see [[points_ledger_state]] for the
wiring detail.

- `app_settings.loyalty_formula_mode` (text, nullable, `check (in
  ('uniform','proportional'))`) and `app_settings.peso_per_point` (numeric,
  nullable) — added by
  `supabase/migrations/20260901120000_app_settings_loyalty_formula.sql`.
  Nullable = "not yet configured." No RLS change needed — existing
  `app_settings_select`/`app_settings_update` policies already cover these
  columns on the same row.
- Pure function `lib/loyalty.ts` (`computeLoyaltyPoints(mode, paidAmount,
  fullPrice, basePoints, pesoPerPoint)`), standard rounding
  (`Math.round`). Not called from any live flow yet. Wet Area is never
  passed through it — stays a fixed 3 pts, to be handled at the call site
  once Part 2 wires this in.
- UI: `components/loyalty-formula-settings.tsx`
  (`LoyaltyFormulaSettings`), a new section in `components/settings-browser.tsx`
  between Services & Pricing and Promo Codes. Mode radio-cards (Uniform/
  Proportional), conditional peso-per-point input (Uniform only), live
  preview against real `services` rows for Signature/Combi Massage plus a
  read-only fixed Wet Area (3pt) card, gate banner shown whenever
  `loyalty_formula_mode IS NULL`. Save/Cancel via `updateLoyaltyFormula`
  (`app/(staff)/settings/actions.ts`) — **Owner-only** in the UI
  (`canEditLoyaltyFormula`), matching the Owner-only `app_settings_update`
  RLS policy.
- **Discrepancy found and resolved before coding**: the prompt's mockup
  file (`points-settings-mockup.html`) does not exist anywhere in the repo
  — built off this file's existing design tokens instead (same fallback
  used for the Commission Rates tab). The prompt's example preview numbers
  (Signature 10pts, Combi 6pts) also didn't match live `services` data
  (Signature Massage is ₱1,300/**6pts**, Combi Massage is ₱1,100/**5pts**
  as of this writing) — the preview queries live `services` rows, not
  hardcoded numbers, so it stays correct regardless.
- See [[points_ledger_state]] for why Part 2 (wiring this into
  `log_visit()`/`quick_walkin()`/`logVisitBooking()`) is deliberately out
  of scope here.

## Not persisted — deliberately, not an oversight

**Display/Appearance** (theme) remains local/session-only — confirmed with
the user as correct to leave unpersisted, since it's a per-device
preference, not app state that needs to survive a refresh or be shared
across sessions.
