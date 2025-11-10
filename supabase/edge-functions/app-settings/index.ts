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
    function cleanAppValues(raw: Record<string, unknown>) {
      // Whitelist allowed columns and drop null/undefined to avoid NOT NULL violations
      const allowed = new Set([
        'default_convert_policy',
        'ask_before_convert',
        'enforce_globally',
        'default_payment_terms',
        'default_invoice_delay_days',
        // tax defaults
        'default_prices_include_tax',
        'default_iva_enabled',
        'default_iva_rate',
        'default_irpf_enabled',
        'default_irpf_rate'
      ]);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw || {})) {
        if (!allowed.has(k)) continue;
        if (v === null || typeof v === 'undefined') continue; // omit nulls to keep DB defaults/current values
        // Coerce numeric text values
        if (['default_invoice_delay_days', 'default_iva_rate', 'default_irpf_rate'].includes(k)) {
          if (typeof v === 'string' && v.trim() === '') continue;
          const num = typeof v === 'number' ? v : Number(v);
          if (!Number.isFinite(num)) continue;
          out[k] = num;
          continue;
        }
        if (k === 'default_convert_policy') {
          // Normalize alias 'automatic'/'on_accept' kept as-is (both allowed by constraint)
          const val = String(v);
          if (!['manual', 'automatic', 'on_accept', 'scheduled'].includes(val)) continue;
          out[k] = val;
          continue;
        }
        out[k] = v;
      }
      return out;
    }

    function cleanCompanyValues(raw: Record<string, unknown>) {
      const allowed = new Set([
        'convert_policy',
        'ask_before_convert',
        'enforce_company_defaults',
        'payment_terms',
        'invoice_on_date',
        'default_invoice_delay_days',
        'deposit_percentage',
        // tax overrides
        'prices_include_tax',
        'iva_enabled',
        'iva_rate',
        'irpf_enabled',
        'irpf_rate'
      ]);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw || {})) {
        if (!allowed.has(k)) continue;
        if (v === null || typeof v === 'undefined') continue;
        if (['default_invoice_delay_days', 'deposit_percentage', 'iva_rate', 'irpf_rate'].includes(k)) {
          if (typeof v === 'string' && v.trim() === '') continue;
          const num = typeof v === 'number' ? v : Number(v);
          if (!Number.isFinite(num)) continue;
          out[k] = num;
          continue;
        }
        if (k === 'convert_policy') {
          const val = String(v);
          if (!['manual', 'automatic', 'on_accept', 'scheduled'].includes(val)) continue;
          out[k] = val;
          continue;
        }
        out[k] = v;
      }
      return out;
    }

    async function upsertAppSettings(values: Record<string, unknown>) {
      const cleaned = cleanAppValues(values);
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Only admin/owner can update global settings' }), { status: 403, headers });
      const { data: existing } = await sbAdmin.from('app_settings').select('id').limit(1).maybeSingle();
      if (existing?.id) {
        if (Object.keys(cleaned).length === 0) {
          // Nothing to update; return current row
          const { data } = await sbAdmin.from('app_settings').select('*').eq('id', existing.id).single();
          return new Response(JSON.stringify({ ok: true, app: data }), { status: 200, headers });
        }
        const { data, error } = await sbAdmin.from('app_settings').update(cleaned).eq('id', existing.id).select('*').single();
        if (error) return new Response(JSON.stringify({ error: error.message || 'update_failed' }), { status: 400, headers });
        return new Response(JSON.stringify({ ok: true, app: data }), { status: 200, headers });
      } else {
        const insertPayload = Object.keys(cleaned).length === 0 ? {} : cleaned;
        const { data, error } = await sbAdmin.from('app_settings').insert(insertPayload).select('*').single();
        if (error) return new Response(JSON.stringify({ error: error.message || 'insert_failed' }), { status: 400, headers });
        return new Response(JSON.stringify({ ok: true, app: data }), { status: 200, headers });
      }
    }
    async function getCompanySettings(cid: string) {
      const { data } = await sbAdmin.from('company_settings').select('*').eq('company_id', cid).maybeSingle();
      return data || { company_id: cid };
    }
    async function upsertCompanySettings(values: Record<string, unknown>, cid: string) {
      const cleaned = cleanCompanyValues(values);
      const payload = { ...cleaned, company_id: cid } as Record<string, unknown>;
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
