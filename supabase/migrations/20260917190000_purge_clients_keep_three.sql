-- Migration: Purge clients in clients table leaving only 3 clients
-- Preserves historical bookings, sales, and locker_occupancy by setting client_id = NULL and copying codename to guest_label.

DO $$
BEGIN
  -- Create temp table to hold IDs of the 3 clients to keep
  -- Keeps 3 clients from public.clients (ordered by creation date)
  CREATE TEMP TABLE temp_clients_to_keep ON COMMIT DROP AS
  SELECT id
  FROM public.clients
  ORDER BY created_at ASC
  LIMIT 3;

  -- 1. Preserve historical references in bookings (copy codename to guest_label, set client_id to null)
  UPDATE public.bookings b
  SET guest_label = COALESCE(b.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE b.client_id = c.id
    AND c.id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 2. Preserve historical references in sales
  UPDATE public.sales s
  SET guest_label = COALESCE(s.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE s.client_id = c.id
    AND c.id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 3. Preserve historical references in locker_occupancy
  UPDATE public.locker_occupancy l
  SET guest_label = COALESCE(l.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE l.client_id = c.id
    AND c.id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 4. Delete portal accounts for purged clients
  DELETE FROM public.client_portal_accounts
  WHERE client_id NOT IN (SELECT id FROM temp_clients_to_keep);

  -- 5. Disable trigger on point_transactions for deletion of orphaned ledger entries
  ALTER TABLE public.point_transactions DISABLE TRIGGER trg_block_ledger_delete;
  
  DELETE FROM public.point_transactions
  WHERE client_id NOT IN (SELECT id FROM temp_clients_to_keep);

  ALTER TABLE public.point_transactions ENABLE TRIGGER trg_block_ledger_delete;

  -- 6. Delete purged clients from clients table
  DELETE FROM public.clients
  WHERE id NOT IN (SELECT id FROM temp_clients_to_keep);

END $$;
