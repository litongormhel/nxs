# Lockers State

Last updated: 2026-09-19 (`ohm#5b7c2e9a`)

## Overview

The Lockers domain manages the spa's physical lockers, their availability, active occupancy by checked-in clients or walk-in guests, and maintenance/out-of-order status for damaged or broken lockers.

---

## Schema & Tables

### 1. `public.lockers`
Physical locker capacity inventory.
- `number` (`integer`, primary key): Locker number.
- `active` (`boolean`, default `true`): Whether the locker exists in the facility capacity inventory.
- `status` (`text`, default `'available'`): Status indicator (`'available'` or `'out_of_order'`).
- `is_maintenance` (`boolean`, default `false`): Boolean flag indicating whether the locker is undergoing maintenance / out of order.
- `maintenance_note` (`text`, nullable): Optional description of the defect or issue (e.g., "Broken key", "Handle loose", "Lock jammed").

#### RLS Policies on `public.lockers`
- `staff_select`: `USING (is_staff())` — all authenticated staff can view lockers.
- `staff_insert`: `WITH CHECK (is_supervisor_or_above())` — adding locker capacity via Settings is restricted to supervisors and owners.
- `staff_update`: `USING (is_staff()) WITH CHECK (is_staff())` — all authenticated staff can update locker maintenance status and notes.

### 2. `public.locker_occupancy`
Append/audit tracking of locker check-ins and check-outs.
- `id` (`uuid`, primary key): Occupancy record ID.
- `locker_number` (`integer`, FK to `lockers.number`): Assigned locker number.
- `client_id` (`uuid`, nullable, FK to `clients.id`): Member client ID, if registered.
- `guest_label` (`text`, nullable): Guest name for walk-in clients without an account.
- `booking_id` (`uuid`, nullable, FK to `bookings.id`): Associated booking ID.
- `room_number` (`integer`, nullable, FK to `rooms.number`): Room assignment for massage.
- `service_id` (`uuid`, nullable, FK to `services.id`): Service availed.
- `checked_in_at` (`timestamp with time zone`, default `now()`): Check-in timestamp.
- `checked_in_by` (`uuid`, nullable, FK to `staff.id`): Staff member who processed check-in.
- `checked_out_at` (`timestamp with time zone`, nullable): Check-out timestamp (`null` if active).
- `checked_out_by` (`uuid`, nullable, FK to `staff.id`): Staff member who processed check-out.

---

## Server Actions (`app/(staff)/lockers/actions.ts`)

1. **`toggleLockerMaintenance(lockerNumber, isMaintenance, note?, staffId?)`**:
   - **Active Occupancy Guard**: If `isMaintenance` is `true`, queries `locker_occupancy` for an active occupant (`checked_out_at IS NULL`). Rejects with an error requiring guest checkout before the locker can be marked out of order.
   - **Database Update & Schema Resilience**: Updates `is_maintenance`, `status`, and `maintenance_note` on `public.lockers`. If PostgREST returns a schema cache missing column error for `is_maintenance` (`PGRST204`), falls back gracefully to updating `status` (`'out_of_order'` or `'available'`) and `maintenance_note` (or `status` only) without failing unhandled. Documented and executed `NOTIFY pgrst, 'reload schema'` in `20260919100000_lockers_maintenance.sql`.
   - **Action Log**: Inserts audit log into `action_logs` (`locker_marked_maintenance` or `locker_cleared_maintenance`).
   - **Revalidation**: Revalidates `/lockers`, `/bookings`, `/call-sheet`, and `/clients`.

2. **`checkOutLocker(occupancyId, actorStaffId)`**:
   - Sets `checked_out_at = now()` and `checked_out_by = actorStaffId`.
   - Logs to `action_logs` (`locker_checkout`).
   - Revalidates `/lockers` and `/call-sheet`.

3. **`checkOutOverdueLockers(actorStaffId)`**:
   - Bulk checks out all active occupancies where `toSpaDay(checked_in_at) !== spaDayNow()`.
   - Logs to `action_logs` (`bulk_checkout_overdue_lockers`).
   - Revalidates `/lockers` and `/call-sheet`.

---

## UI Components & Workflow

### 1. Locker Board (`/lockers`, `components/locker-board.tsx`)
- **Header Metrics**: Reflects total occupied lockers, total working capacity (excluding out-of-order lockers), and displays an amber/red badge if any lockers are currently out of order (`X out of order`).
- **Locker Cards**:
  - **Occupied**: Gold border (or dashed red if stale from previous spa day), displaying client/guest name and "Check Out" button.
  - **Out of Order**: Distinct dashed red border (`border-red-500/60`), dark red surface (`bg-red-950/20`), "Out of Order" badge, and truncated maintenance note. Clicking opens the Maintenance modal.
  - **Free**: Surface border and "Free" indicator. Clicking opens the Free Locker options modal.
- **Free Locker Modal**:
  - Displays locker number and "Available" status dot (`Locker #X • Available`).
  - Error banner rendering human-readable error messages if an operation fails.
  - "Mark Out of Order" section: text input for optional note ("e.g. Broken key") and action button calling `toggleLockerMaintenance`.
  - Cancel button to close.
- **Maintenance Locker Modal**:
  - Displays locker number, "Out of Order" badge, and existing maintenance note.
  - Action button: "Mark as Available / Clear Maintenance" calling `toggleLockerMaintenance(num, false)`.

### 2. Check-in & Walk-in Selectors
Lockers marked out of order are excluded / disabled from assignment across all check-in entry points:
- **Quick Walk-in Modal (`components/quick-walkin-modal.tsx`)**:
  - Queries `lockers` table on mount for out-of-order records.
  - In Assign Locker select, disables out-of-order lockers with label: `Locker X — Out of Order (Note)`.
  - Validates in `handleCreate` to prevent submission of an out-of-order locker.
- **Log Visit Modal (`components/log-visit-modal.tsx`)**:
  - Queries `lockers` table on mount for out-of-order records.
  - Populates `lockerOptions` with `isMaintenance: true`.
  - Disables out-of-order options in `fLocker` select with label: `Locker X — Out of Order (Note)`.
  - Validates in `handleConfirm` to reject selection of an out-of-order locker.
- **Edit Booking Modal (`components/booking-browser.tsx`)**:
  - Queries `lockers` table for out-of-order records.
  - Disables out-of-order options in `edit-locker` select.
  - Validates in `handleConfirmSave`.
- **Backend RPC & Server Action Validation**:
  - `quick_walkin` PL/pgSQL function checks `public.lockers` and throws an exception if an out-of-order locker number is passed.
  - `app/(staff)/bookings/actions.ts` (`quickWalkin` and `updateBooking`) verifies locker status before assigning.
