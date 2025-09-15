// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
const AUTO_CREATE_DEFAULT_STAGES = (Deno.env.get('AUTO_CREATE_DEFAULT_STAGES') || 'false').toLowerCase() === 'true';

const FUNCTION_NAME = 'create-ticket';
const FUNCTION_VERSION = '2025-09-15-3';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false }
});

function jsonResponse(status: number, body: any, originAllowedHeader = '*') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Origin', originAllowedHeader);
  headers.set('X-Function-Name', FUNCTION_NAME);
  headers.set('X-Function-Version', FUNCTION_VERSION);
  return new Response(JSON.stringify(body), { status, headers });
}

function isOriginAllowed(origin: string | null) {
  if (!origin) return false;
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    const allow = (ALLOW_ALL_ORIGINS || isOriginAllowed(origin)) ? (origin || '*') : '';
    if (!allow) return jsonResponse(403, { error: 'Origin not allowed' }, '');
    const headers = new Headers();
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Origin', allow);
    return new Response(null, { status: 200, headers });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }, '*');
  }

  // CORS check
  if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
    return jsonResponse(403, { error: 'Origin not allowed' }, '');
  }

  // Auth check
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return jsonResponse(401, { error: 'Missing Authorization bearer token' }, origin || '*');
  }
  const token = tokenMatch[1];
  let authUserId: string | null = null;
  try {
    const userRes = await supabaseAdmin.auth.getUser(token);
    if (userRes.error || !userRes.data?.user) {
      return jsonResponse(401, { error: 'Invalid or expired token' }, origin || '*');
    }
    authUserId = userRes.data.user.id;
  } catch (_e) {
    return jsonResponse(401, { error: 'Invalid token' }, origin || '*');
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse(400, { error: 'Invalid JSON body' }, origin || '*');
  }

  // Only accept p_* keys
  const received_keys = Object.keys(body || {});
  const invalidKeys = received_keys.filter(k => !k.startsWith('p_'));
  if (invalidKeys.length > 0) {
    return jsonResponse(400, { error: 'Only p_* keys are accepted', details: { invalidKeys, received_keys } }, origin || '*');
  }

  // Required fields
  const REQUIRED = ['p_company_id','p_client_id','p_title','p_description'];
  const missing = REQUIRED.filter(f => !(f in body));
  if (missing.length > 0) {
    return jsonResponse(400, { error: `Missing required fields: ${missing.join(', ')}` }, origin || '*');
  }

  // Build payload
  const nowIso = new Date().toISOString();
  const payload: any = {
    company_id: body.p_company_id,
    client_id: body.p_client_id,
    title: (body.p_title || '').toString().trim(),
    description: (body.p_description || '').toString().trim(),
    stage_id: body.p_stage_id ?? null,
    priority: (body.p_priority || 'normal'),
    total_amount: body.p_total_amount ?? null,
    // due_date en la tabla es DATE; si nos pasan fecha, la normalizamos a YYYY-MM-DD
    due_date: body.p_due_date ? new Date(body.p_due_date).toISOString().slice(0,10) : null,
    created_at: nowIso,
    updated_at: nowIso
  };

  // Validate priority
  const allowedPriorities = ['low','normal','high','critical'];
  if (!allowedPriorities.includes(payload.priority)) payload.priority = 'normal';

  try {
    // Validate user belongs to the company via public.users (single-company membership)
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('company_id', payload.company_id)
      .eq('active', true)
      .maybeSingle();
    if (userErr || !userRow) {
      if (userErr) console.warn(`[${FUNCTION_NAME}] membership query error (users)`, userErr);
      return jsonResponse(403, { error: 'User not allowed for this company', code: 'not_company_member' }, origin || '*');
    }

    // Validate client belongs to same company
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, company_id')
      .eq('id', payload.client_id)
      .single();
    if (clientErr || !clientRow) {
      return jsonResponse(400, { error: 'Invalid client_id' }, origin || '*');
    }
    if (clientRow.company_id !== payload.company_id) {
      return jsonResponse(400, { error: 'Client does not belong to the provided company' }, origin || '*');
    }

    // Validate or auto-select stage (current schema: global stages, no company_id / is_active columns)
    let finalStageId: string | null = null;
    if (payload.stage_id) {
      try {
        const { data: stageRow } = await supabaseAdmin
          .from('ticket_stages')
          .select('id, deleted_at')
          .eq('id', payload.stage_id)
          .single();
        if (stageRow && stageRow.deleted_at == null) {
          finalStageId = stageRow.id;
        }
      } catch (_) { /* ignore validation failure */ }
    }
    if (!finalStageId) {
      // Fetch a small batch to pick a sensible default (prefer smallest positive position > 0, else any lowest position)
      const { data: stageList, error: listErr } = await supabaseAdmin
        .from('ticket_stages')
        .select('id, name, position, deleted_at, created_at')
        .is('deleted_at', null)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(20);

      let activeStages = (stageList || []).filter(s => s.deleted_at == null);

      if (activeStages.length === 0 && AUTO_CREATE_DEFAULT_STAGES) {
        // Bootstrap defaults only if table truly empty (global scope)
        const defaults = [
          { name: 'Recibido', color: '#ef4444', position: 1 },
          { name: 'En Diagnóstico', color: '#f59e0b', position: 2 },
          { name: 'Esperando Piezas', color: '#8b5cf6', position: 3 }
        ];
        const now = new Date().toISOString();
        const toInsert = defaults.map(d => ({
          id: crypto.randomUUID(),
          name: d.name,
          color: d.color,
          position: d.position,
          created_at: now,
          updated_at: now
        }));
        const { error: bootErr } = await supabaseAdmin.from('ticket_stages').insert(toInsert);
        if (bootErr) {
          console.error(`[${FUNCTION_NAME}] Failed to bootstrap global default stages`, bootErr);
        } else {
          const { data: refreshed } = await supabaseAdmin
            .from('ticket_stages')
            .select('id, name, position, deleted_at, created_at')
            .is('deleted_at', null)
            .order('position', { ascending: true })
            .order('created_at', { ascending: true })
            .limit(20);
          activeStages = (refreshed || []).filter(s => s.deleted_at == null);
        }
      }

      if (activeStages.length === 0) {
        return jsonResponse(400, { error: 'No active ticket stages available' }, origin || '*');
      }

      const preferred = activeStages.find(s => typeof s.position === 'number' && s.position > 0) || activeStages[0];
      finalStageId = preferred.id;
    }
    payload.stage_id = finalStageId;

  // Insert ticket (let ticket_number SERIAL be generated by DB)
  const insertObj = { ...payload };
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('tickets')
      .insert(insertObj)
      .select('*')
      .single();
    if (insErr) {
      console.error(`[${FUNCTION_NAME}] Insert failed`, insErr);
      return jsonResponse(500, { error: 'Insert failed', details: insErr }, origin || '*');
    }

    return jsonResponse(200, { result: inserted }, origin || '*');
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Internal error`, e?.message || e);
    return jsonResponse(500, { error: 'Internal server error', details: e?.message || e }, origin || '*');
  }
});

/*
Deploy:
  supabase functions deploy create-ticket --project-ref <YOUR_PROJECT_REF>

Local test (replace <TOKEN>):
  curl -i -X POST 'https://<YOUR_PROJECT>.supabase.co/functions/v1/create-ticket' \
    -H 'Origin: http://localhost:4200' \
    -H 'Authorization: Bearer <TOKEN>' \
    -H 'Content-Type: application/json' \
    -d '{
      "p_company_id":"00000000-0000-0000-0000-000000000000",
      "p_client_id":"00000000-0000-0000-0000-000000000000",
      "p_title":"Pantalla rota iPhone",
      "p_description":"El cliente reporta pantalla rota tras caída",
      "p_stage_id":"00000000-0000-0000-0000-000000000000",
      "p_priority":"normal"
    }'
*/
