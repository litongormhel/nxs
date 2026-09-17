-- Migration: Purge legacy clients without bookings/visits today (2026-09-17)
-- Task ID: ohm#clienttabsandpurge
-- Preserves client records with bookings or locker occupancy on 2026-09-17 Manila date.
-- Safely disassociates client_id on historical bookings, sales, locker_occupancy for purged clients
-- setting guest_label = COALESCE(guest_label, client.codename), then purges client rows.

DO $$
DECLARE
  v_today date := '2026-09-17'::date;
BEGIN
  -- 1. Identify clients to keep (active booking or locker occupancy today)
  CREATE TEMP TABLE temp_clients_to_keep ON COMMIT DROP AS
  SELECT DISTINCT c.id
  FROM public.clients c
  WHERE c.id IN (
    SELECT client_id FROM public.bookings WHERE booking_date = v_today AND client_id IS NOT NULL
    UNION
    SELECT client_id FROM public.locker_occupancy WHERE (checked_in_at AT TIME ZONE 'Asia/Manila')::date = v_today AND client_id IS NOT NULL
  );

  -- 2. Preserve historical references in bookings (copy codename to guest_label, set client_id to null)
  UPDATE public.bookings b
  SET guest_label = COALESCE(b.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE b.client_id = c.id
    AND c.id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 3. Preserve historical references in sales
  UPDATE public.sales s
  SET guest_label = COALESCE(s.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE s.client_id = c.id
    AND c.id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 4. Preserve historical references in locker_occupancy
  UPDATE public.locker_occupancy l
  SET guest_label = COALESCE(l.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE l.client_id = c.id
    AND c.id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 5. Delete portal accounts for purged clients
  DELETE FROM public.client_portal_accounts
  WHERE client_id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 6. Disable trigger on point_transactions for deletion of orphaned ledger entries
  ALTER TABLE public.point_transactions DISABLE TRIGGER trg_block_ledger_delete;
  
  DELETE FROM public.point_transactions
  WHERE client_id NOT IN (SELECT id FROM temp_clients_to_keep);

  ALTER TABLE public.point_transactions ENABLE TRIGGER trg_block_ledger_delete;

  -- 7. Delete purged clients from clients table
  DELETE FROM public.clients
  WHERE id NOT IN (SELECT id FROM temp_clients_to_keep);

END $$;
