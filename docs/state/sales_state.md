# Sales — Current State

## Implemented (DB level)

`public.sales`:
- Columns: `client_id`/`guest_label` (one required, check constraint),
  `service_id`, `therapist_id`, `booking_id` (nullable FK), `promo_id`,
  `amount`, `payment_method` (checked: `Cash`/`GCash`/`Card`/`Points`),
  `payment_ref`, `manual_discount_type` (checked: `pct`/`fixed`),
  `manual_discount_value`, `processed_by` (FK, not null), `edited_by`/
  `edited_at` (mutation audit), `voided`/`voided_at`/`voided_by` (void
  audit).
- `public.sale_addons` — join table to `addons` with `price_at_sale`
  (price snapshot at time of sale, independent of `addons.price` changing
  later).
- Mutable and voidable by design — not append-only like the ledger. Cross-
  references the ledger only via `point_transactions.sale_id` (optional).

## Implemented (app level, Core Loop `ohm#7f3k9d2m`)

- One write path exists, indirectly: `public.log_visit(...)` (see
  [[points_ledger_state]]) inserts a `sales` row whenever the Log Visit
  modal's amount is `> 0` — either the full service price (plain earn
  visit) or a cash top-up (redemption-with-upgrade). `processed_by` is the
  real authenticated staff member (`sessionStaff.id`).
- **RLS, real role-based as of Staff Auth 6C-2 (`ohm#5m8t2x6b`,
  2026-08-29)**: the additive `public_select`/`public_insert`/
  `public_update` (`USING`/`WITH CHECK (true)`) policies from Core
  Loop/Operations are gone. `staff_select`/`staff_insert` now require
  `is_staff()` (any of the 8 loginable staff). `staff_update` now requires
  `is_supervisor_or_above()` as a DB-level floor — Front Desk sessions can
  no longer UPDATE a sale at all (previously silently allowed, just
  app-hidden). **Void is now also DB-enforced, not just app-gated**: a new
  `BEFORE UPDATE` trigger (`trg_block_void_by_non_owner` →
  `block_void_by_non_owner()`) raises an exception if `voided` changes and
  the caller isn't `is_owner()`, layered on top of the `staff_update` RLS
  floor — a Supervisor can still edit amount/payment/therapist but cannot
  flip `voided`, matching ADR-001's "Supervisor can edit, Owner-only can
  void" exactly, now at the DB layer. No DELETE policy — sales are never
  hard-deleted. **This closes the "app-level-only role gate" accepted gap
  noted below for every prior phase** — real DB access now matches the
  UI's Edit/Void role gating; only a real authenticated session grants any
  access at all (no client-side role selector exists to spoof, since
  Simulate Staff was removed in 6C-6). Smoke-tested via a rolled-back
  transaction (anon/Front
  Desk/Supervisor/Owner) and regression-verified live via real logins:
  Diego (Supervisor) edited a sale successfully but is blocked from
  voiding; J. Cruz (Owner) voids successfully. See [[staff_state]] for the
  shared role-helper functions.

## Implemented (app level) — Operations Phase (`ohm#9h4c7x2m`, 2026-08-28)

- **Sales tab** (`app/sales/page.tsx`, real page replacing the 8-line
  stub; `components/sales-browser.tsx`, new): table — Date, Client,
  Service, Amount, Payment (+ GCash ref when present), Promo, Therapist,
  Actions. `sales` is embedded-joined to `clients(codename)`,
  `services(name)`, `therapists(name)`, `promos(label)` (all single-FK,
  safe for a PostgREST embedded select); `processed_by`/`edited_by`/
  `voided_by` are resolved from a separately-fetched `staff` list mapped
  in app code — `sales` carries three distinct FKs to `staff`, which makes
  those three ambiguous to embed directly (same reason Logs' `staff_id`
  join is done in app code). Running total excludes voided sales.
  **Walk-in/no-account distinction**: `client_id IS NULL` (with
  `guest_label` set) — confirmed directly against the live check
  constraint, matches the mockup's `clientKey===null` exactly. Walk-in
  rows show "No action — walk-in, no account" instead of Edit/Void.
- **Edit** (`app/sales/actions.ts::editSale`, real modal in
  `sales-browser.tsx` — not `window.prompt()`): edits amount, payment
  method, GCash ref (shown only when payment method is GCash), and
  therapist. Sets `edited_by`/`edited_at`; UI shows an "Edited by
  [staff]" tag. Enabled for Supervisor/Owner only (`currentRole` from
  `useStaffSim()`), matching ADR-001 "Supervisor can edit."
- **Void** (`ohm#6f3p8dxn`, 2026-09-01 — now two paths, both landing on
  `voided`/`voided_at`/`voided_by`, never a hard delete):
  - **Direct** (`app/(staff)/sales/actions.ts::voidSale`,
    `window.confirm()`): Supervisor or Owner's own session voids
    immediately, no code. DB floor widened this prompt —
    `block_void_by_non_owner()` (the `BEFORE UPDATE` trigger layered on top
    of `staff_update` RLS) now checks `is_supervisor_or_above()`, was
    `is_owner()` only. Confirmed live via a rolled-back-transaction smoke
    test before and after the change (Supervisor direct void now succeeds;
    Receptionist direct void still silently no-ops, 0 rows, blocked by
    `staff_update` RLS regardless of the trigger).
  - **Step-up** (`app/(staff)/sales/actions.ts::voidSaleWithCode`, new
    `sales-browser.tsx` modal): for any other role (in practice,
    Receptionist — Attendant/Others can't log in). Picks a Supervisor/Owner
    from a dropdown (`authorizers` prop, `staff` filtered to those two
    positions) plus a shared 6-digit code, both sent to the new
    `void_sale_with_code(p_sale_id, p_code, p_authorizing_staff_id)`
    `SECURITY DEFINER` RPC (`supabase/migrations/20260901170000_sale_void_auth_code.sql`).
    The void is attributed to the selected Supervisor/Owner (`voided_by`);
    the actual initiating staff member (derived server-side from
    `auth.uid()`, never trusted from a client param) is recorded separately
    in the `action_logs` detail (`authorized_by=… initiated_by=…`), not
    collapsed into one field. Inside the transaction, a transaction-local
    GUC (`app.void_via_code`) lets this one call flip `voided` past the
    `is_supervisor_or_above()` trigger check without changing that check
    for any other UPDATE path.
    - **Code setup**: `app_settings.void_auth_code_hash` (nullable =
      "not yet configured," same gate-banner pattern as the Loyalty
      Formula). Owner sets/changes it in Settings
      (`updateVoidAuthCode()` → `set_void_auth_code()` RPC, hashed via
      `pgcrypto`'s `crypt()`/`gen_salt('bf')` inside Postgres, never in
      Node). Front Desk sees a plain "ask the Owner to set it up" message
      if unset, not the underlying RLS reason.
    - **Rate limiting**: `sale_void_attempts` (RLS enabled, zero
      policies — default-deny, touched only by `void_sale_with_code()`),
      keyed by the *initiating* staff member. 3 wrong codes locks that one
      staff member for 5 minutes (`locked_until`); a different Receptionist
      is unaffected. Checked before the code is even looked at.
    - Both `set_void_auth_code`/`void_sale_with_code` are `REVOKE`d from
      `anon`/`public` and `GRANT`ed to `authenticated` only, plus their own
      internal `is_owner()`/`is_staff()` checks — narrowest scope that
      still lets Reception call the void function and only Owner call the
      code-setter.
  - Smoke-tested live via rolled-back transactions covering: not-configured,
    wrong-code with `attempts_remaining` countdown, invalid authorizer
    (server re-verifies `staff.position`, doesn't trust the dropdown),
    successful void with correct `voided_by`, lockout after 3 fails,
    per-initiator isolation, and the Owner/Supervisor direct-path
    regression checks above.
- Both mutations end with an `action_logs` insert (`sale_edit` /
  `sale_void`), attributed to the real session, and `revalidatePath("/sales")`.
- **Role gating reuses the existing `lib/staff-context.tsx`
  (`useStaffSim`/`currentRole`) mechanism** — the same standing pattern
  Staff Directory/Activity Logs established (`ohm#3z8k1p6d`), not a new
  gating mechanism. This is also the pattern any future Analytics-phase
  gating should reuse.

## Not yet implemented — see roadmap

- No POS/checkout UI for creating a new sale directly from this tab —
  `sales` rows are still only created as a side effect of Log Visit /
  Quick Walk-in on the Bookings page (out of scope for this phase).
