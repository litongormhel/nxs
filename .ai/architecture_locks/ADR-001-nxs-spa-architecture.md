---
name: nxs-architecture-locks
---

# ADR-001 — NXS Spa Architecture Invariants

Compact list of decisions no AI session should silently change. Verified
directly against the live Supabase schema (project `zqwiqrvqyinacjozubtc`,
migrations `01`–`12`) on 2026-08-27, not assumed from convention.

1. **Points ledger immutability.** `public.point_transactions` blocks
   UPDATE and DELETE at the trigger level
   (`trg_block_ledger_update`, `trg_block_ledger_delete` →
   `block_ledger_mutation()`). Balance mutation happens only through new
   INSERT rows, applied via `trg_apply_points_delta` →
   `apply_points_delta()`. Corrections must be new `ADJUSTMENT`-type rows,
   never edits to existing rows.

2. **No-double-booking is DB-enforced, not app-enforced.** `bookings` carries
   two GiST exclusion constraints — `no_double_book_room` and
   `no_double_book_therapist` — over `(resource_id, tsrange(start_ts,
   end_ts))`, scoped to statuses `Booked`, `Completed`, `Needs Reassignment`.
   The app must not add its own conflicting-booking check as the source of
   truth; the constraint is.

3. **Sales/ledger separation.** `sales` and `point_transactions` are
   distinct tables. The only link is the optional `point_transactions.sale_id`
   FK. Never collapse them into one table, one write path, or one view —
   sales stay mutable/voidable, the ledger stays append-only.

4. **Codename over legal name.** `clients` has no legal-name column. Only
   `codename` (display identity) and `username` exist. Do not add a
   legal-name field without an explicit, separate decision.

5. **One-device login (client app).** `clients` has a single
   `password_hash` column per client — schema shape supports single-credential
   login. Enforcing "only one active device/session" is an app-level
   concern not yet built (no session table exists yet); don't assume it's
   already enforced.

6. **Staff auth is complete; RLS is identity-keyed on every table.** As of
   Staff Auth 6A–6C-6 (final step `ohm#...` Staff Auth 6C-6, 2026-08-29),
   every route requires a real Supabase Auth session (`proxy.ts`), every
   `public` table's RLS is keyed off `auth.uid() → staff.user_id →
   staff.position` via the shared role helpers (`is_staff()`,
   `is_supervisor_or_above()`, `is_owner()`, `current_staff_position()`),
   and there is no "Simulate Staff" role-spoofing mechanism anywhere in the
   app — it was removed entirely once real RLS made it redundant.
   `action_logs.staff_id` (and every other actor-attribution column) is
   populated from the real authenticated session, never a placeholder
   picker. See `docs/state/staff_state.md` for the full policy matrix
   per table.
