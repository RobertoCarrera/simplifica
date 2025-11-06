// @ts-nocheck
// =====================================================
// Edge Function: admin-list-user-modules
// =====================================================
// Devuelve para el admin de una empresa la matriz de módulos:
// - usuarios de la empresa (id, email, name, role, active)
// - catálogo de módulos activos (key, name, position)
// - asignaciones explícitas en user_modules (user_id, module_key, status)
// Sólo accesible por role=admin de la empresa.
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);

function cors(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin'
  };
  if (origin) {
    if (ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
  }
  return headers;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  if (!(ALLOW_ALL_ORIGINS || (origin && ALLOWED_ORIGINS.includes(origin)))) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token) return new Response(JSON.stringify({ error: 'Missing Bearer token' }), { status: 401, headers });

    const url = Deno.env.get('SUPABASE_URL') || '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !service) return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500, headers });
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers });

    const meRes = await admin
      .from('users')
      .select('id, company_id, role, active')
      .eq('auth_user_id', user.id)
      .single();
    const me = meRes.data;
    if (meRes.error || !me?.company_id || me.active === false) {
      return new Response(JSON.stringify({ error: 'User not associated/active' }), { status: 400, headers });
    }
    if (String(me.role).toLowerCase() !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: only admin can list company modules' }), { status: 403, headers });
    }

    const companyId = me.company_id as string;

    const { data: users } = await admin
      .from('users')
      .select('id, email, name, role, active')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    const { data: modules } = await admin
      .from('modules')
      .select('key,name,position,is_active')
      .eq('is_active', true)
      .order('position', { ascending: true });

    const userIds = (users || []).map((u: any) => u.id);
    const { data: assignments } = userIds.length > 0
      ? await admin.from('user_modules').select('user_id,module_key,status').in('user_id', userIds)
      : { data: [] } as any;

    return new Response(JSON.stringify({ users: users || [], modules: modules || [], assignments: assignments || [] }), { status: 200, headers });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: e?.message }), { status: 500, headers });
  }
});
