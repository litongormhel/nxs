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
  visit) or a cash top-up (redemption-with-upgrade). `processed_by` is set
  to the staff member picked in the modal's placeholder-actor dropdown.
  This is the **only** write path; nothing in the app edits, voids, or
  lists `sales` directly yet.
- RLS: `anon` had an `INSERT`-only policy (`public_insert`,
  `WITH CHECK (true)`) from Core Loop. The Operations phase
  (`ohm#9h4c7x2m`, migration `20260828023358_operations_sales_rls.sql`)
  added `public_select` (`USING (true)`) and `public_update`
  (`USING(true)`/`WITH CHECK(true)`) — needed once the Sales tab started
  reading and mutating rows. Same additive shape as every prior policy.
  **App-level-only role gate, same accepted gap as every other phase**:
  the DB grants SELECT/UPDATE to any anon/authenticated caller; the actual
  Edit = Supervisor/Owner, Void = Owner-only restriction is enforced only
  in app code via `lib/staff-context.tsx`'s `currentRole`.

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
- **Void** (`app/sales/actions.ts::voidSale`, `window.confirm()` — same
  established pattern as Settings' delete buttons, not a new one): sets
  `voided`/`voided_at`/`voided_by`. **Never a hard delete** — the row
  stays visible, tagged "VOIDED", and is excluded from the running total,
  matching ADR-001 "Owner-only can void, never hard delete." Enabled for
  Owner only.
- Both mutations end with an `action_logs` insert (`sale_edit` /
  `sale_void`) using the same placeholder-actor pattern as every other
  phase, and `revalidatePath("/sales")`.
- **Role gating reuses the existing `lib/staff-context.tsx`
  (`useStaffSim`/`currentRole`) mechanism** — the same standing pattern
  Staff Directory/Activity Logs established (`ohm#3z8k1p6d`), not a new
  gating mechanism. This is also the pattern any future Analytics-phase
  gating should reuse.

## Not yet implemented — see roadmap

- No POS/checkout UI for creating a new sale directly from this tab —
  `sales` rows are still only created as a side effect of Log Visit /
  Quick Walk-in on the Bookings page (out of scope for this phase).
