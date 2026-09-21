# Current State — Routing Index

One line per module. Load `.ai/briefing.md` first, then jump to the module
file below for the task at hand. This file is routing only — no
architecture explanations live here.

| Module | Task involves... | Go to |
|---|---|---|
| Bookings | default landing, scheduling, therapist/room assignment, double-booking rules | `docs/state/bookings_state.md` |
| Call Sheet / Operations | rooms, room assignments, call sheet | `docs/state/operations_state.md` |
| Therapists | therapist roster, absences, leave, day-off, service assignment, interactive slots | `docs/state/therapists_state.md` |
| Lockers | locker board, occupancy, check-out, maintenance / out-of-order status | `docs/state/lockers_state.md` |
| Sales | POS, shift remittance, payments, discounts, PIN-verified voids/restores | `docs/state/sales_state.md` |
| Clients | client list/profile, codenames, points balance display, privacy | `docs/state/clients_state.md` |
| Points Ledger | earning/redeeming points, `point_transactions`, ledger immutability | `docs/state/points_ledger_state.md` |
| Dashboard | (removed) former reception home, stat cards (redirects to `/bookings`) | `docs/state/dashboard_state.md` |
| Staff | staff roster, positions, staff auth status | `docs/state/staff_state.md` |
| Logs | `action_logs`, audit logging | `docs/state/logs_state.md` |
| Analytics | operational stats, reporting | `docs/state/analytics_state.md` |
| Commission | therapist commission rates, Analytics > Commission tab | `docs/state/commission_state.md` |
| Settings | app/config settings screen | `docs/state/settings_state.md` |

For architecture-level questions (not module behavior), go to
`docs/architecture/` instead of these files.

## Current Milestone Status (as of 2026-09-19)

- **Bookings (`docs/state/bookings_state.md`)**: Default landing page (`/bookings`). Standalone dashboard removed. Top `<ReassignmentPanel />` embedded. Cancellation action available beside Reassign. 20-minute past-time grace period and booked slots gating in booking modals. Slot selection gated on therapist selection. Qualified therapist filtering by selected service. Default manual discount percentage set to 20%.
- **Therapists (`docs/state/therapists_state.md`)**: Full light mode support using semantic Tailwind tokens (zero hardcoded hex values). Interactive slot selection on therapist cards dynamically updates CTA to "Book [Time]" and launches pre-filled `<QuickWalkinModal />`. Services offered toggle persistence bug resolved, and therapist filtering by service wired to booking modals.
- **Lockers (`docs/state/lockers_state.md`)**: Independent module and navigation tab. Out-of-order / maintenance status and notes system with cascading resilient query fallback. Active occupancy check prevents marking occupied lockers out of order. Out-of-order lockers disabled across all check-in selectors. Free locker card click opens streamlined modal directly.
- **Sales (`docs/state/sales_state.md`)**: Daily Sales Remittance bounded by 8:00 AM–2:00 AM operational spa day window. Mandatory Manager/Owner PIN confirmation modal for void and restore actions with standardized dropdown reason selector and optional "Other" detail input. Schema cache resilience for `void_reason` column. Split payment (`Cash` + `GCash`) ledger persistence intact.

