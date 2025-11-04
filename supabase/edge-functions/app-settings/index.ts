// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string) {
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0 && !allowAll) allowed.push('http://localhost:4200');
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  const acao = isAllowed && origin ? origin : allowAll ? '*' : '';
  return {
    'Access-Control-Allow-Origin': acao,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  } as Record<string, string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const baseHeaders = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: baseHeaders });
  const headers = { ...baseHeaders, 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token) return new Response(JSON.stringify({ error: 'Missing Bearer token' }), { status: 401, headers });

    const url = Deno.env.get('SUPABASE_URL') || '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !anon || !service) return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500, headers });

    // clients
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const sbAdmin = createClient(url, service, { auth: { persistSession: false } });

    // Parse input
    const urlObj = new URL(req.url);
    const actionQ = urlObj.searchParams.get('action');
    const body = req.method === 'GET' ? {} : (await req.json().catch(() => ({})));
    const action = (body?.p_action || actionQ || '').toString() || 'get_app';

    // Resolve auth user and profile
    const { data: authData, error: authErr } = await sbAdmin.auth.getUser(token);
    if (authErr || !authData?.user?.id) return new Response(JSON.stringify({ error: 'Invalid user token' }), { status: 401, headers });
    const authUserId = authData.user.id;

    const { data: userProfile, error: profErr } = await sbAdmin
      .from('users')
      .select('id, company_id, role, active')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (profErr || !userProfile?.company_id || userProfile.active === false) return new Response(JSON.stringify({ error: 'Forbidden: no active company' }), { status: 403, headers });
    const companyId = userProfile.company_id as string;
    const isAdmin = ['owner', 'admin'].includes((userProfile.role || '').toLowerCase());

    // Helpers
    async function getAppSettings() {
      const { data } = await sbAdmin.from('app_settings').select('*').limit(1).maybeSingle();
      return data || null;
    }
    async function upsertAppSettings(values: Record<string, unknown>) {
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Only admin/owner can update global settings' }), { status: 403, headers });
      const { data: existing } = await sbAdmin.from('app_settings').select('id').limit(1).maybeSingle();
      if (existing?.id) {
        const { data, error } = await sbAdmin.from('app_settings').update(values).eq('id', existing.id).select('*').single();
        if (error) return new Response(JSON.stringify({ error: error.message || 'update_failed' }), { status: 400, headers });
        return new Response(JSON.stringify({ ok: true, app: data }), { status: 200, headers });
      } else {
        const { data, error } = await sbAdmin.from('app_settings').insert(values).select('*').single();
        if (error) return new Response(JSON.stringify({ error: error.message || 'insert_failed' }), { status: 400, headers });
        return new Response(JSON.stringify({ ok: true, app: data }), { status: 200, headers });
      }
    }
    async function getCompanySettings(cid: string) {
      const { data } = await sbAdmin.from('company_settings').select('*').eq('company_id', cid).maybeSingle();
      return data || { company_id: cid };
    }
    async function upsertCompanySettings(values: Record<string, unknown>, cid: string) {
      const payload = { ...values, company_id: cid };
      const { data, error } = await sbAdmin.from('company_settings').upsert(payload, { onConflict: 'company_id' }).select('*').single();
      if (error) return new Response(JSON.stringify({ error: error.message || 'upsert_failed' }), { status: 400, headers });
      return new Response(JSON.stringify({ ok: true, company: data }), { status: 200, headers });
    }

    // Router
    if (action === 'get_app') {
      const app = await getAppSettings();
      return new Response(JSON.stringify({ ok: true, app }), { status: 200, headers });
    }
    if (action === 'upsert_app') {
      const values = body?.values || body || {};
      return await upsertAppSettings(values);
    }
    if (action === 'get_company') {
      const cid = (body?.company_id || urlObj.searchParams.get('company_id') || companyId) as string;
      const company = await getCompanySettings(cid);
      return new Response(JSON.stringify({ ok: true, company }), { status: 200, headers });
    }
    if (action === 'upsert_company') {
      const values = body?.values || body || {};
      const cid = (body?.company_id || companyId) as string;
      return await upsertCompanySettings(values, cid);
    }

    // Unknown action
    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers });
  }
});
