// @ts-nocheck
// Edge Function: diag-portal
// DIAGNOSTIC. Will be removed once the portal sidebar is working.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRM_SUPABASE_URL = Deno.env.get('CRM_SUPABASE_URL') ?? '';
const CRM_SERVICE_ROLE_KEY = Deno.env.get('CRM_SERVICE_ROLE_KEY') ?? '';

function host(url: string): string {
  try { return new URL(url).host; } catch { return 'invalid-url'; }
}

async function crmFetch(table: string, query: string): Promise<{ data: any[] | null; error: string | null; status?: number }> {
  if (!CRM_SUPABASE_URL || !CRM_SERVICE_ROLE_KEY) {
    return { data: null, error: 'CRM env vars not configured' };
  }
  const url = `${CRM_SUPABASE_URL}/rest/v1/${table}?${query}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: CRM_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${CRM_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { data: null, error: `HTTP ${res.status}: ${body.substring(0, 200)}`, status: res.status };
    }
    const data = await res.json();
    return { data: Array.isArray(data) ? data : null, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message ?? String(e) };
  }
}

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const portalClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Identify user
  let userId: string | null = null;
  let jwtPayload: any = null;
  if (jwt) {
    try {
      const parts = jwt.split('.');
      if (parts.length === 3) {
        jwtPayload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        userId = jwtPayload.sub;
      }
    } catch {}
  }
  const { data: userData, error: userErr } = userId
    ? await portalClient.auth.getUser(jwt)
    : { data: null, error: null };

  // 2. Find portal user record
  const { data: portalUser, error: portalUserErr } = userId
    ? await portalClient
        .from('client_portal_users')
        .select('id, email, company_id, client_id, is_active')
        .eq('auth_user_id', userId)
        .eq('is_active', true)
        .maybeSingle()
    : { data: null, error: null };

  const companyId = portalUser?.company_id;

  // 3. Env probe
  const envProbe = {
    portalHost: host(SUPABASE_URL),
    crmHost: host(CRM_SUPABASE_URL),
    sameProject: host(SUPABASE_URL) === host(CRM_SUPABASE_URL),
    crmServiceRoleSet: !!CRM_SERVICE_ROLE_KEY,
    crmServiceRoleLength: CRM_SERVICE_ROLE_KEY.length,
    crmServiceRolePrefix: CRM_SERVICE_ROLE_KEY.substring(0, 11),
  };

  // 4. CRM probe via direct PostgREST with sb_secret_ in headers
  const probeResult: any = {};
  for (const table of ['modules_catalog', 'company_modules', 'user_modules', 'sidebar_navigation_order', 'companies']) {
    const r = await crmFetch(table, 'select=*&limit=1');
    probeResult[table] = { exists: !r.error, error: r.error, status: r.status };
  }

  // 5. Real modulesForCompany query
  let modulesForCompany: any = null;
  if (companyId) {
    const r = await crmFetch(
      'company_modules',
      `select=module_key,status&company_id=eq.${encodeURIComponent(companyId)}`,
    );
    modulesForCompany = {
      companyId,
      rows: r.data,
      error: r.error,
      status: r.status,
    };
  }

  const result = {
    timestamp: new Date().toISOString(),
    request: {
      hasAuthHeader: !!authHeader,
      hasJwt: !!jwt,
    },
    user: {
      authUserId: userId,
      authUserEmail: userData?.user?.email ?? null,
      authError: userErr?.message ?? null,
      jwtCompanyId: jwtPayload?.company_id ?? null,
    },
    portalUser: {
      found: !!portalUser,
      data: portalUser,
      error: portalUserErr?.message ?? null,
    },
    companyIdResolved: companyId,
    env: envProbe,
    crm: {
      tables: probeResult,
      modulesForCompany,
    },
  };

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
