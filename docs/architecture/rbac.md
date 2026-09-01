# RBAC — Implemented

Staff Auth (6A through 6C-6) is complete as of 2026-08-29. Everything
below describes real, currently-enforced behavior — not a target. See
`docs/state/staff_state.md` for the full per-table RLS policy matrix and
`.ai/handoff.md` for the phase-by-phase build history.

## Roles

Sourced from the live `staff_position` enum:

- `Receptionist`
- `Attendant`
- `Supervisor`
- `Owner`
- `Others`

The app's three-tier framing (Front Desk / Supervisor / Owner) maps onto
this enum: `Receptionist` displays as "Front Desk"; `Attendant`/`Others`
are directory-only (no login, no role gating relevant to them — they
can't authenticate). Only `Receptionist`/`Supervisor`/`Owner` are
loginable.

## Enforcement

| Aspect | Implementation |
|---|---|
| Login | Real Supabase Auth (`app/login`), email/password per staff account, session cookies via `@supabase/ssr` |
| Route protection | `proxy.ts` requires a session on every route except `/login`; redirects unauthenticated requests with `next` intent preserved |
| Session → actor | `app/layout.tsx` resolves `auth.uid() → staff.user_id` into `sessionStaff`, threaded through `lib/staff-context.tsx`'s `useStaffSim()` to every consumer — nav gating, Settings role gates, and every `action_logs`/mutation actor column |
| RLS policy scoping | Every `public` table's RLS is keyed off `auth.uid()` via `current_staff_position()` (`SECURITY DEFINER`) and the `is_staff()`/`is_supervisor_or_above()`/`is_owner()` helpers — no table has an open `USING (true)` policy left |
| Role-based route restriction | Not at the `proxy.ts` layer — only session presence is checked there. Role gating (Owner-only pages) is enforced at both the app level (`lib/nav.ts`'s `ownerOnly`, per-page content guards) and the DB level (RLS), so a non-Owner is blocked twice over even without proxy-level role checks |

## Per-feature permission matrix

No per-feature role matrix existed in this doc before `ohm#3n7x9kwp`
(2026-09-01) — the table above documents enforcement *mechanisms*, not
which role can do what on a given feature. This table starts that
convention; add a row here whenever a prompt is the first to pin down a
feature's role gate, rather than assuming a prior convention that doesn't
exist yet.

| Feature | Front Desk (Receptionist) | Supervisor | Owner |
|---|---|---|---|
| Promo Codes — create/edit/delete (`ohm#3n7x9kwp`, 2026-09-01) | Read-only | Read-only | Full (UI + `requireOwner()` app check + `is_owner()` RLS on `promos` INSERT/UPDATE) |
| Sales — Void (`ohm#6f3p8dxn`, 2026-09-01) | Step-up only: picks a Supervisor/Owner authorizer + shared 6-digit code, via `void_sale_with_code()` (`SECURITY DEFINER`); 3 wrong attempts locks that staff member for 5 minutes | Direct, no code — `voidSale()` (DB floor: `is_supervisor_or_above()` in `block_void_by_non_owner()`, widened from Owner-only this prompt) | Direct, no code — same as Supervisor |
| Sales — Void auth code setup (`ohm#6f3p8dxn`, 2026-09-01) | No access | No access | Full — `updateVoidAuthCode()` (`requireOwner()` app check) → `set_void_auth_code()` RPC (internal `is_owner()` check, hashes via pgcrypto) |

## History note

Staff auth was deliberately built last in the roadmap so the core
operational domains (ledger, bookings, sales) could be validated against
real DB-level invariants first. During that interim, a client-side
"Simulate Staff" role-spoofing dropdown stood in for a real session; it
was removed in 6C-6 once RLS made it redundant (spoofing the UI could no
longer grant any real data access, so keeping it around was actively
misleading rather than useful for testing).
