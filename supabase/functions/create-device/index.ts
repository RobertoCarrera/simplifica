// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);

const FUNCTION_NAME = 'create-device';

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
  const REQUIRED = ['p_company_id','p_client_id','p_brand','p_model','p_device_type','p_reported_issue'];
  const missing = REQUIRED.filter(f => !(f in body));
  if (missing.length > 0) {
    return jsonResponse(400, { error: `Missing required fields: ${missing.join(', ')}` }, origin || '*');
  }

  // Build payload
  const payload: any = {
    company_id: body.p_company_id,
    client_id: body.p_client_id,
    brand: (body.p_brand || '').toString().trim(),
    model: (body.p_model || '').toString().trim(),
    device_type: (body.p_device_type || '').toString().trim(),
    reported_issue: (body.p_reported_issue || '').toString().trim(),
    status: 'received',
    priority: (body.p_priority || 'normal'),
    received_at: body.p_received_at ? new Date(body.p_received_at).toISOString() : new Date().toISOString(),
    created_by: authUserId
  };

  // Optional fields
  const OPTIONAL_MAP: Record<string, string> = {
    p_serial_number: 'serial_number',
    p_imei: 'imei',
    p_color: 'color',
    p_condition_on_arrival: 'condition_on_arrival',
    p_operating_system: 'operating_system',
    p_storage_capacity: 'storage_capacity',
    p_estimated_cost: 'estimated_cost',
    p_final_cost: 'final_cost'
  };
  for (const [k, col] of Object.entries(OPTIONAL_MAP)) {
    if (k in body) payload[col] = body[k];
  }

  // Validate priority
  const allowedPriorities = ['low','normal','high','urgent'];
  if (!allowedPriorities.includes(payload.priority)) payload.priority = 'normal';

  try {
    // Validate user belongs to the company via public.users
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

    // Insert device with service role (bypass RLS safely)
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('devices')
      .insert(payload)
      // Disambiguate relationship using FK constraint name to avoid PGRST201
      .select('*, client:clients!devices_client_id_fkey(id, name, email, phone)')
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
  supabase functions deploy create-device --project-ref <YOUR_PROJECT_REF>

Local test (replace <TOKEN>):
  curl -i -X POST 'https://<YOUR_PROJECT>.supabase.co/functions/v1/create-device' \
    -H 'Origin: http://localhost:4200' \
    -H 'Authorization: Bearer <TOKEN>' \
    -H 'Content-Type: application/json' \
    -d '{
      "p_company_id":"00000000-0000-0000-0000-000000000000",
      "p_client_id":"00000000-0000-0000-0000-000000000000",
      "p_brand":"Apple",
      "p_model":"iPhone 12",
      "p_device_type":"smartphone",
      "p_reported_issue":"Pantalla rota"
    }'
*/
