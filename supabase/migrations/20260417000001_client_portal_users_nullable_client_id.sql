-- Allow client_portal_users.client_id to be NULL.
-- When a client is invited to the portal, the invitation is sent by email.
-- At that point the invited person may not yet have a record in the `clients`
-- table (they haven't accepted yet). The client_id will be linked later,
-- either when the client first logs in or when the admin creates the client record.

ALTER TABLE public.client_portal_users
  ALTER COLUMN client_id DROP NOT NULL;
