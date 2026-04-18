import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MIGRATION_SQL = `
-- ============================================
-- Sidebar Navigation Order: allows super_admin
-- to set custom display order for sidebar items
-- ============================================

CREATE TABLE IF NOT EXISTS public.sidebar_navigation_order (
  id          BIGSERIAL PRIMARY KEY,
  module_key  TEXT NOT NULL UNIQUE,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_visible  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sidebar_navigation_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sidebar_navigation_order_select"
  ON public.sidebar_navigation_order FOR SELECT USING (true);

CREATE POLICY "sidebar_navigation_order_admin_insert"
  ON public.sidebar_navigation_order FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.raw_user_meta_data->>'is_super_admin' = 'true'
    )
  );

CREATE POLICY "sidebar_navigation_order_admin_update"
  ON public.sidebar_navigation_order FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.raw_user_meta_data->>'is_super_admin' = 'true'
    )
  );

CREATE POLICY "sidebar_navigation_order_admin_delete"
  ON public.sidebar_navigation_order FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.raw_user_meta_data->>'is_super_admin' = 'true'
    )
  );

CREATE INDEX IF NOT EXISTS idx_sidebar_navigation_order_module_key
  ON public.sidebar_navigation_order (module_key);
CREATE INDEX IF NOT EXISTS idx_sidebar_navigation_order_order_index
  ON public.sidebar_navigation_order (order_index);

CREATE OR REPLACE FUNCTION public.get_sidebar_navigation_order()
RETURNS TABLE(module_key TEXT, order_index INTEGER, is_visible BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT sno.module_key, sno.order_index, sno.is_visible
  FROM public.sidebar_navigation_order sno ORDER BY sno.order_index ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_sidebar_navigation_order(p_entries JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  entry JSONB;
  v_module_key TEXT;
  v_order_index INTEGER;
  v_is_visible BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users AS u
    WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'is_super_admin' = 'true'
  ) THEN
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_module_key := entry->>'module_key';
    v_order_index := (entry->>'order_index')::INTEGER;
    v_is_visible := (entry->>'is_visible')::BOOLEAN;
    INSERT INTO public.sidebar_navigation_order (module_key, order_index, is_visible, updated_at)
    VALUES (v_module_key, v_order_index, v_is_visible, now())
    ON CONFLICT (module_key) DO UPDATE SET
      order_index = EXCLUDED.order_index,
      is_visible  = EXCLUDED.is_visible,
      updated_at  = now();
  END LOOP;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sidebar_navigation_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_sidebar_navigation_order TO authenticated;
`

serve(async (req) => {
  // CORS preflight
  const origin = req.headers.get('origin') || ''
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Only service_role key can execute migrations
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')

    if (!serviceRoleKey || !supabaseUrl) {
      return new Response(JSON.stringify({ error: 'Missing env vars' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { error } = await supabase.rpc('exec', { sql: MIGRATION_SQL })

    if (error) {
      // Try direct query if rpc doesn't exist
      const { error: execError } = await supabase.from('_temp_migration').select()
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, message: 'Migration applied' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
