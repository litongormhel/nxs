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
- **`trg_require_portal_account_for_earn_redeem`
  (`require_portal_account_for_earn_redeem()`), added `ohm#4x8k2p9d`,
  2026-09-01**: `BEFORE INSERT`, rejects any row with `entry_type IN
  ('EARN','REDEEM')` where `EXISTS (SELECT 1 FROM client_portal_accounts
  WHERE client_id = NEW.client_id)` is false. `ADJUSTMENT` is exempt. This
  covers all three write paths into the table (`log_visit()`,
  `quick_walkin()`, and `logVisitBooking()`'s direct insert) since it fires
  on every INSERT regardless of caller. See [[client_portal_state]] for the
  companion `staff_select` RLS policy and the app-level pre-flight gating
  in `client-browser.tsx`/`booking-browser.tsx`/`log-visit-modal.tsx` that
  blocks the UI before this trigger would ever fire (required because
  `logVisitBooking()`'s linked-booking branch is non-atomic — see below).
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
- **RLS, real role-based as of Staff Auth 6C-2 (`ohm#5m8t2x6b`,
  2026-08-29)**: the prior `public_select`/`public_insert`
  (`USING`/`WITH CHECK (true)`) policies are gone, replaced by
  `staff_select` (`SELECT`, `USING (is_staff())`) and `staff_insert`
  (`INSERT`, `WITH CHECK (is_staff())`) — `is_staff()` resolves
  `auth.uid() → staff.user_id → staff.position`, true for any of the 8
  loginable staff. Confirmed `log_visit()` (see below) still works
  end-to-end under this policy despite being `SECURITY INVOKER` — it
  inserts as the calling session's role, so the INSERT policy has to (and
  does) actually pass for an authenticated staff caller, not just gate the
  app layer. No `UPDATE`/`DELETE` policy exists or is needed — the block
  triggers remain the sole enforcement, verified intact before and after
  this change. Ledger immutability itself is unchanged by this migration;
  only who may `SELECT`/`INSERT` changed. See [[staff_state]] for the
  shared role-helper functions this and every other 6C-2+ policy uses.

## Implemented (app level, `ohm#4x8k2p9d`, 2026-09-01)

- `app/(staff)/clients/page.tsx` and `app/(staff)/bookings/page.tsx` each
  query `client_portal_accounts` and pass a `has_portal_account` boolean
  per client. `components/client-browser.tsx`'s "Log Visit" button and
  every service card, and `components/booking-browser.tsx`'s per-row "Log
  Visit" action, are disabled (with an inline "Walang portal account —
  hindi pa mag-eearn/redeem ng points." note) when the linked client lacks
  a `client_portal_accounts` row. `components/log-visit-modal.tsx` bakes
  the same check into `canSubmit` and `handleConfirm()` as defense-in-depth
  regardless of which parent opened it. Guests/walk-ins with no `client_id`
  are unaffected — they never get a ledger entry either way (`if
  (input.clientId)` / `if p_client_id is not null` gates in the existing
  write paths, unchanged). Blocking happens app-side before any write is
  attempted — not by catching the DB trigger's exception — because
  `logVisitBooking()`'s linked-booking branch is a sequence of separate
  Supabase calls (booking update → sale insert → addon insert → ledger
  insert → locker insert), not one transaction; letting the trigger reject
  only the ledger insert would leave the booking already marked
  `Completed` and the sale already recorded.
- **Known immediate effect**: at ship time, only 1 of 78 `clients` rows had
  a linked `client_portal_accounts` row — 77 clients cannot EARN/REDEEM
  until they register on the portal. Confirmed as the intended business
  rule, shipped with no feature flag.

## Not yet implemented — see roadmap

- No QR-scan earn flow, no standalone manual-adjustment UI (the `ADJUSTMENT`
  entry_type exists in the DB and was exercised directly in migration
  testing, but has no app-level entry point — and is exempt from the
  portal-account guard above).
- Ledger history view is a fixed last-10 list on the Client Profile detail
  panel (`components/client-browser.tsx`) — no pagination, no full ledger
  browser.
