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

6. **Staff auth deferred; RLS is enabled but not identity-keyed.** Every
   `public` table has `ENABLE ROW LEVEL SECURITY`. Only `lockers`, `rooms`,
   `services`, `therapists` have `USING (true)` public SELECT policies.
   `clients` has its own locked-down policy (see
   `docs/state/clients_state.md`). Everything else — `bookings`, `sales`,
   `point_transactions`, `staff`, `action_logs` — has no policy and is
   default-deny for `anon`/`authenticated`. Do not treat "RLS is open" as
   true; it isn't. `action_logs.staff_id` is populated via a placeholder
   staff-picker in the UI (once built), not a real session, until staff auth
   lands.
