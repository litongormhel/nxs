-- Migration: Purge clients without portal accounts
-- Task ID: ohm#clienttabsandpurge (follow-up)
-- Deletes clients from `clients` table who do NOT have a row in `client_portal_accounts`.
-- Preserves historical bookings, sales, locker_occupancy by setting client_id = NULL and copying codename to guest_label.

DO $$
BEGIN
  -- 1. Preserve historical references in bookings (copy codename to guest_label, set client_id to null)
  UPDATE public.bookings b
  SET guest_label = COALESCE(b.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE b.client_id = c.id
    AND c.id NOT IN (SELECT client_id FROM public.client_portal_accounts WHERE client_id IS NOT NULL);

  -- 2. Preserve historical references in sales
  UPDATE public.sales s
  SET guest_label = COALESCE(s.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE s.client_id = c.id
    AND c.id NOT IN (SELECT client_id FROM public.client_portal_accounts WHERE client_id IS NOT NULL);

  -- 3. Preserve historical references in locker_occupancy
  UPDATE public.locker_occupancy l
  SET guest_label = COALESCE(l.guest_label, c.codename),
      client_id = NULL
  FROM public.clients c
  WHERE l.client_id = c.id
    AND c.id NOT IN (SELECT client_id FROM public.client_portal_accounts WHERE client_id IS NOT NULL);

  -- 4. Disable trigger on point_transactions for deletion of orphaned ledger entries
  ALTER TABLE public.point_transactions DISABLE TRIGGER trg_block_ledger_delete;
  
  DELETE FROM public.point_transactions
  WHERE client_id NOT IN (SELECT client_id FROM public.client_portal_accounts WHERE client_id IS NOT NULL);

  ALTER TABLE public.point_transactions ENABLE TRIGGER trg_block_ledger_delete;

  -- 5. Delete clients without portal accounts from clients table
  DELETE FROM public.clients
  WHERE id NOT IN (SELECT client_id FROM public.client_portal_accounts WHERE client_id IS NOT NULL);

END $$;
