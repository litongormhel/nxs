# Points Ledger — Current State

## Implemented (DB level)

`public.point_transactions`:
- Columns: `id`, `client_id` (FK → `clients`), `points_delta`, `entry_type`
  (`EARN`/`REDEEM`/`ADJUSTMENT`), `source` (`STAFF_MANUAL`/`QR_SCAN`/
  `ADJUSTMENT`), `booking_id` (FK, nullable), `sale_id` (FK, nullable),
  `processed_by` (FK → staff, not null), `idempotency_key`, `notes`,
  `created_at`.
- Check constraint `point_transactions_check`: `ADJUSTMENT` entries require
  a non-null `notes`.
- Triggers: `trg_block_ledger_update` and `trg_block_ledger_delete`
  (`block_ledger_mutation()`) reject any UPDATE/DELETE on this table —
  true DB-level immutability, not just convention.
- Trigger `trg_apply_points_delta` (`apply_points_delta()`) runs AFTER
  INSERT and applies the delta to `clients.points_balance`. As of Core Loop
  (`ohm#7f3k9d2m`) this function is `SECURITY DEFINER` — it must run with
  elevated privilege to update `clients` regardless of the caller's RLS,
  since `clients` intentionally has no UPDATE policy for `anon` (a raw
  UPDATE grant would let the app set `points_balance` directly, bypassing
  the ledger). This was silently broken for any RLS-scoped caller until
  Core Loop's first anon-role write surfaced it — earn/redeem entries
  wrote to the ledger correctly but never moved the visible balance until
  this fix.

## Implemented (app level, Core Loop `ohm#7f3k9d2m`)

- `public.log_visit(p_client_id, p_service_id, p_staff_id, p_is_redemption,
  p_payment_method, p_amount, p_payment_ref)` — the only write path into
  this table today. A single Postgres function (not `SECURITY DEFINER`;
  runs as the caller and is bound by the same RLS as a direct client call)
  that atomically inserts the ledger row, an optional `sales` row when
  `p_amount > 0`, and an `action_logs` row, all in one transaction. Row ids
  are generated in-function (`gen_random_uuid()`) rather than via
  `RETURNING`, since `RETURNING` requires a SELECT-policy on the target
  table under RLS and `sales` deliberately has none.
  - Earn case: `entry_type = EARN`, `points_delta = services.points_earned`
    for the selected service (data-driven, not hardcoded — Wet Area 3,
    Combi Massage 5, Signature Massage 6 as of this writing).
  - Redemption case: `entry_type = REDEEM`, `points_delta = -100`, guarded
    server-side (`clients.points_balance >= 100`, re-checked inside the
    function even though the UI also disables the toggle below threshold).
  - Redemption-with-upgrade: same `-100` ledger entry, plus a separate
    `sales` row for the cash top-up (`p_amount`), linked via `sale_id` —
    never merged into one entry.
  - Called from `app/clients/actions.ts` (`logVisit` server action) via
    `supabase.rpc("log_visit", ...)`.
- RLS: `anon` has `SELECT`/`INSERT` policies on `point_transactions`
  (`public_select`, `public_insert`, both `USING/WITH CHECK (true)`) — no
  `UPDATE`/`DELETE` policy exists or is needed; the block triggers are the
  only enforcement and were verified intact before and after this change.

## Not yet implemented — see roadmap

- No QR-scan earn flow, no standalone manual-adjustment UI (the `ADJUSTMENT`
  entry_type exists in the DB and was exercised directly in migration
  testing, but has no app-level entry point).
- Ledger history view is a fixed last-10 list on the Client Profile detail
  panel (`components/client-browser.tsx`) — no pagination, no full ledger
  browser.
