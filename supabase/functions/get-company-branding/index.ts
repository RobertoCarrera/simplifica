// Edge Function: get-company-branding
// Returns public branding data for the authenticated user's company.
// Used by portal and agenda frontends to apply company-specific theming.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
  const headers = { ...CORS_HEADERS };
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  // --- Auth ---
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers });
  }
  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // --- Validate user and extract company_id ---
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers });
  }

  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from('users')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .single();

  if (userRowError || !userRow?.company_id) {
    return new Response(JSON.stringify({ error: 'User not associated with a company' }), { status: 400, headers });
  }

  const companyId = userRow.company_id;

  // --- Fetch company branding (only needed columns) ---
  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('name, logo_url, settings')
    .eq('id', companyId)
    .single();

  if (companyError || !company) {
    return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404, headers });
  }

  // --- Extract branding colors from settings JSON ---
  const branding: Record<string, string> = (company as Record<string, unknown>).settings?.branding ?? {};
  const primaryColor = branding.primary_color ?? '#10B981';
  const secondaryColor = branding.secondary_color ?? '#3B82F6';

  return new Response(
    JSON.stringify({
      name: company.name,
      logo_url: company.logo_url ?? null,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    }),
    { status: 200, headers }
  );
});