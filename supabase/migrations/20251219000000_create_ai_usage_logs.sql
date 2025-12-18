-- Create table for tracking AI usage and time savings
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    feature_key TEXT NOT NULL, -- 'audio_client', 'audio_quote', 'scan_device', etc.
    saved_seconds INTEGER NOT NULL DEFAULT 0, -- Estimated time saved in seconds
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert their own AI logs" 
ON public.ai_usage_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (
    auth.uid() = user_id 
    OR 
    company_id IN (
        SELECT company_id FROM public.users WHERE id = auth.uid()
    )
);

CREATE POLICY "Users can view logs for their company" 
ON public.ai_usage_logs 
FOR SELECT 
TO authenticated 
USING (
    company_id IN (
        SELECT company_id FROM public.users WHERE id = auth.uid()
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_logs_company ON public.ai_usage_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON public.ai_usage_logs(created_at);
