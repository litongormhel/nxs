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
- **UI preview labels not yet reconciled with the formula** (flagged, not
  fixed, during `ohm#2r8w5nfz`): `components/log-visit-modal.tsx`'s
  "Points to award" field and `components/client-browser.tsx`'s
  per-service quick-select cards both display `services.points_earned`
  directly as a pre-submission preview. Since EARN now goes through
  `computeLoyaltyPoints()`, the actual awarded amount can diverge from
  this preview (discounts change the proportional result; an unconfigured
  formula awards nothing). Nothing incorrect is written to the ledger —
  this is a display-accuracy gap, not a data-correctness bug.

## Implemented (app level, `ohm#2r8w5nfz`, 2026-09-01) — loyalty formula
wired end-to-end

Points are no longer a fixed per-service constant — EARN entries are now
computed via `computeLoyaltyPoints()` (`lib/loyalty.ts`), using the
owner-configured `app_settings.loyalty_formula_mode`/`peso_per_point` (see
[[settings_state]] for Part 1, the schema/config UI). **No longer
"computed but unused"** — this is now the live points-award path.

- New `resolveEarnedPoints()` helper (`app/(staff)/bookings/actions.ts`):
  Wet Area (`service.name === "Wet Area"`) always gets the fixed
  `WET_AREA_POINTS` (3, exported from `lib/loyalty.ts`), bypassing the
  formula entirely. Otherwise: one `app_settings` read, then
  `computeLoyaltyPoints()`. Returns `null` when
  `loyalty_formula_mode IS NULL` — callers skip the EARN ledger insert
  entirely on `null` rather than inserting a fabricated zero-point row or
  falling back to the old fixed value.
- **Two live EARN write paths wired**: `logVisitBooking()`'s direct insert
  (linked-booking completion) and `quick_walkin()` (walk-ins with no
  linked booking — signature changed to accept a precomputed
  `p_points_earned integer` parameter instead of looking up
  `services.points_earned` internally; migration
  `supabase/migrations/20260901140000_quick_walkin_points_param.sql`).
  Both functions' `action_logs` entries record
  `points_awarded=NONE:formula_not_configured` when skipped, instead of
  silently omitting the fact.
- **`log_visit()` RPC deliberately left untouched** — confirmed unused by
  any UI component (dead code), out of scope per the prompt.
- **REDEEM (`-100` fixed) is completely unaffected** — the formula only
  ever runs for EARN.
- **`paidAmount` is a new `servicePaidAmount` field**, not the existing
  `amount`/`computedAmount` — the latter bundles add-on totals with the
  service price (needed for `sales.amount`) and would have skewed the
  formula; `servicePaidAmount` is service price post-promo/manual-discount,
  excluding add-ons, computed in parallel in
  `components/log-visit-modal.tsx` and `components/quick-walkin-modal.tsx`.
- **Unconfigured-formula UX**: the visit/sale/locker-assignment still
  completes normally; both modals show an explicit "⚠ Points Not Awarded"
  screen before closing (driven by the new `pointsAwarded: number | null`
  field on `LogVisitBookingResult`/`QuickWalkinResult`), so reception sees
  the gap live, not just in `action_logs`.
