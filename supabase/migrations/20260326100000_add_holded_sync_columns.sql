-- Add Holded sync columns for services and customers
-- holded_product_id: set after service is synced to Holded products
-- holded_contact_id: set on first quote send and reused thereafter

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS holded_product_id text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS holded_contact_id text;

COMMENT ON COLUMN public.services.holded_product_id IS 'Holded product ID after sync. NULL = not yet synced.';
COMMENT ON COLUMN public.clients.holded_contact_id IS 'Holded contact ID. Set on first quote send.';

CREATE INDEX IF NOT EXISTS idx_services_holded_product_id
  ON public.services(holded_product_id)
  WHERE holded_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_holded_contact_id
  ON public.clients(holded_contact_id)
  WHERE holded_contact_id IS NOT NULL;
