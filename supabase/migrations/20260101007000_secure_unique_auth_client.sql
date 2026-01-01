-- Enforce 1-to-1 relationship between Auth Users and Clients
-- This prevents the critical security bug where one user could log into another's profile

-- Standard UNIQUE constraint allows multiple NULLs in PostgreSQL, 
-- which is exactly what we want (many unlinked clients, but linked ones MUST be unique)

ALTER TABLE public.clients 
ADD CONSTRAINT distinct_auth_user UNIQUE (auth_user_id);
