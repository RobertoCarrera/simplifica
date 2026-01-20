-- Migration: 20260126180000_secure_comments_and_macros.sql

-- PART 1: FIX RLS SECURITY LEAK on ticket_comments
-- The policy "ticket_comments_company_only" is dangerous because get_user_company_id() works for clients too, 
-- giving them access to ALL comments (including internal) for the whole company.

DROP POLICY IF EXISTS "ticket_comments_company_only" ON public.ticket_comments;

-- Replaced with Staff-Only Policy
CREATE POLICY "staff_view_all_company_comments" ON public.ticket_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = ticket_comments.company_id
      AND u.active = true
  )
);

-- Note: Clients still have "clients_can_view_own_ticket_comments" which correctly checks is_internal=false


-- PART 2: CREATE TICKET MACROS (Canned Responses)
CREATE TABLE IF NOT EXISTS public.ticket_macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for Macros (Staff Only - Clients don't use macros)
ALTER TABLE public.ticket_macros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_macros" ON public.ticket_macros
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = ticket_macros.company_id
      AND u.active = true
  )
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_ticket_macros_company ON public.ticket_macros(company_id);
