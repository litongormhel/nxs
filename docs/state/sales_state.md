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

- **Log Visit / Quick Walk-In Write Path (`logVisitBooking` / `quickWalkin`, `ohm#spltpaylog`, 2026-09-17)**:
  - Payment dropdown restricted to `Cash`, `GCash`, and `Split (Cash + GCash)`.
  - For standard `Cash` or `GCash`, inserts 1 row into `public.sales`.
  - For `Split (Cash + GCash)` payments, inserts **two distinct rows** into `public.sales` referencing the same booking/visit:
    - Row 1: `payment_method: 'Cash'`, `amount: splitCashAmount`
    - Row 2: `payment_method: 'GCash'`, `amount: splitGcashAmount`, `payment_ref: paymentRef`
  - Preserves table schema while ensuring Daily Sales Remittance KPI cards (`Cash Remit` vs `Online / E-Wallet`) automatically tally split amounts accurately.
- `processed_by` is the real authenticated staff member (`sessionStaff.id`).
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

- **Sales tab / Daily Sales Remittance** (`app/sales/page.tsx`, `components/sales-browser.tsx`, updated `ohm#slsremit` & `ohm#slswndw8am`, 2026-09-17):
  - **Spa Day Bounds & Filtering**: `app/(staff)/sales/page.tsx` reads `searchParams` for `date` (defaulting to `spaDayNow()`) and queries `sales` strictly bounded by `getSpaDayBounds(date)` (`08:00:00+08` on selected date to `02:00:00+08` next day). `getSpaDayBounds` converts to UTC (`00:00:00Z` to `18:00:00Z`), ensuring all daytime check-ins / sales logged from 8:00 AM onwards and late-night transactions up to 2:00 AM belong to that Spa Day remittance.
  - **Shift Remittance Summary Bar**: 3 KPI summary cards replacing the lifetime total:
    - **Cash Remit**: Sum of `payment_method = 'Cash'` (non-voided).
    - **Online / E-Wallet**: Sum of non-Cash payments (`GCash`, `Card`, `Points`, non-voided).
    - **Total Shift Sales**: Overall total shift sales for the selected Spa Day (non-voided).
  - **Table Presentation**: Transaction time formatted in PHT via `fmtPhtTime(created_at, selectedDate)` (e.g. `04:30 PM`, `01:15 AM (+1d)`). Displays `Time`, `Client` (`codename` / `guest_label`), `Service`, `Amount` (`font-mono text-gold`), `Payment` (+ Ref if GCash), `Promo`, `Therapist`, and `Actions`.
  - `sales` is embedded-joined to `clients(codename)`, `services(name)`, `therapists(name)`, `promos(label)`; `processed_by`/`edited_by`/`voided_by` are resolved from a separately-fetched `staff` list mapped in app code.
  - **Walk-in/no-account distinction**: `client_id IS NULL` (with `guest_label` set) shows "No action — walk-in, no account" instead of Edit/Void.

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
