-- Migration: Create company_feedback table for historical tracking
-- Date: 2026-04-25

CREATE TABLE IF NOT EXISTS public.company_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('bug', 'improvement')),
    description TEXT NOT NULL,
    location TEXT,
    screenshot_url TEXT,
    mail_message_id UUID REFERENCES public.mail_messages(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_feedback_company ON public.company_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.company_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.company_feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.company_feedback(created_at DESC);

-- RLS
ALTER TABLE public.company_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: any authenticated user can INSERT their own feedback
CREATE POLICY "company_feedback_insert_own" ON public.company_feedback
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Policy: admins/owners/super_admins can SELECT feedback from their company
-- Uses company_members.role_id -> app_roles.id -> app_roles.name pattern
CREATE POLICY "company_feedback_select_company" ON public.company_feedback
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.app_roles ar ON ar.id = cm.role_id
        WHERE cm.user_id = (
            SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid()
        )
        AND cm.company_id = company_feedback.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['owner', 'admin', 'super_admin'])
    )
);

-- Policy: service role can do anything (for edge function)
CREATE POLICY "company_feedback_service_role" ON public.company_feedback
FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_company_feedback_modtime
BEFORE UPDATE ON public.company_feedback
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
