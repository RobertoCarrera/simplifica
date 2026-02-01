-- Add company_id column
ALTER TABLE public.item_tags ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Backfill company_id
DO $$
BEGIN
    -- Clients
    UPDATE public.item_tags it
    SET company_id = c.company_id
    FROM public.clients c
    WHERE it.record_type = 'client' AND it.record_id = c.id;

    -- Tickets
    UPDATE public.item_tags it
    SET company_id = t.company_id
    FROM public.tickets t
    WHERE it.record_type = 'ticket' AND it.record_id = t.id;

    -- Services
    UPDATE public.item_tags it
    SET company_id = s.company_id
    FROM public.services s
    WHERE it.record_type = 'service' AND it.record_id = s.id;

    -- Delete orphan tags that couldn't be mapped (to allow NOT NULL constraint)
    DELETE FROM public.item_tags WHERE company_id IS NULL;
END $$;

-- Enforce NOT NULL
ALTER TABLE public.item_tags ALTER COLUMN company_id SET NOT NULL;

-- Enable RLS
ALTER TABLE public.item_tags ENABLE ROW LEVEL SECURITY;

-- Drop insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create secure policies
CREATE POLICY "item_tags_select" ON public.item_tags
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "item_tags_insert" ON public.item_tags
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "item_tags_delete" ON public.item_tags
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);
