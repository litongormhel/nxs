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
- RLS: `anon` has an `INSERT`-only policy (`public_insert`,
  `WITH CHECK (true)`) — deliberately **no SELECT policy**, since nothing
  reads this table from the app yet and `log_visit` avoids needing one (it
  generates the row id itself instead of relying on `INSERT ... RETURNING`,
  which would otherwise require SELECT visibility under RLS).

## Not yet implemented — see roadmap

- `app/sales/page.tsx` is an 8-line stub. No POS UI, no sale listing, no
  edit/void flow exists yet.
