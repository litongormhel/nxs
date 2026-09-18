-- Update existing client username in clients table to match portal account username 'ohmpayatt'
UPDATE public.clients
SET username = 'ohmpayatt'
WHERE username = 'client_8mfcp8h72c' OR codename = 'ohm';
