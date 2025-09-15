// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Config
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);

// Function metadata
const FUNCTION_NAME = 'link-ticket-device';
const FUNCTION_VERSION = '2025-09-15-1';

// Contract placeholders (for documentation clarity)
// FUNCTION_NAME: link-ticket-device
// RPC_NAME: ''
// TABLE_NAME: ticket_devices
// UNIQUE_ON: "ticket_id,device_id,relation_type"
// REQUIRED_FIELDS: ["p_ticket_id","p_device_id"]
// OPTIONAL_FIELDS: ["p_relation_type"]
// NUMERIC_ONLY_FIELD: ""

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false },
});

function corsHeaders(origin: string | null) {
  const headers = new Headers();
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (ALLOW_ALL_ORIGINS) {
    headers.set('Access-Control-Allow-Origin', origin || '*');
  } else {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
    if (allowed) headers.set('Access-Control-Allow-Origin', allowed);
  }
  return headers;
}

function isOriginAllowed(origin: string | null) {
  if (!origin) return false;
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function jsonResponse(status: number, body: any, origin: string | null) {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Function-Name', FUNCTION_NAME);
  headers.set('X-Function-Version', FUNCTION_VERSION);
  return new Response(JSON.stringify(body), { status, headers });
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(origin);
    if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
    }
    return new Response(null, { status: 200, headers });
  }

  // Only POST
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }, origin);
  }

  // CORS check for actual request
  if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
    return jsonResponse(403, { error: 'Origin not allowed' }, origin);
  }

  // Auth: require Bearer token
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return jsonResponse(401, { error: 'Missing Authorization bearer token' }, origin);
  }

  let authUserId: string | null = null;
  try {
    const userRes = await supabaseAdmin.auth.getUser(tokenMatch[1]);
    if (userRes.error || !userRes.data?.user) {
      return jsonResponse(401, { error: 'Invalid or expired token' }, origin);
    }
    authUserId = userRes.data.user.id;
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] auth.getUser error`, e);
    return jsonResponse(401, { error: 'Invalid token' }, origin);
  }

  // Parse JSON
  let body: any = null;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse(400, { error: 'Invalid JSON body' }, origin);
  }

  // Only accept p_* keys
  const received_keys = Object.keys(body || {});
  const invalidKeys = received_keys.filter((k) => !k.startsWith('p_'));
  if (invalidKeys.length > 0) {
    return jsonResponse(400, {
      error: 'Only p_* keys are accepted',
      details: { invalidKeys, received_keys },
    }, origin);
  }

  // Required/Optional fields
  const REQUIRED = ['p_ticket_id', 'p_device_id'];
  const OPTIONAL = ['p_relation_type'];
  const missing = REQUIRED.filter((k) => !(k in body));
  if (missing.length > 0) {
    return jsonResponse(400, {
      error: `Missing required fields: ${missing.join(', ')}`,
      details: { required: REQUIRED, optional: OPTIONAL, received_keys },
    }, origin);
  }

  // Normalize inputs
  const p_ticket_id = String(body.p_ticket_id);
  const p_device_id = String(body.p_device_id);
  let p_relation_type = body.p_relation_type == null ? 'repair' : String(body.p_relation_type).trim();
  if (!p_relation_type) p_relation_type = 'repair';

  try {
    // Load ticket and device, and derive company consistency
    const [{ data: ticket }, { data: device }] = await Promise.all([
      supabaseAdmin.from('tickets').select('id, company_id').eq('id', p_ticket_id).single(),
      supabaseAdmin.from('devices').select('id, company_id').eq('id', p_device_id).single(),
    ]);

    if (!ticket) {
      return jsonResponse(400, { error: 'Invalid ticket_id' }, origin);
    }
    if (!device) {
      return jsonResponse(400, { error: 'Invalid device_id' }, origin);
    }
    if (ticket.company_id !== device.company_id) {
      return jsonResponse(400, { error: 'Ticket and device must belong to the same company' }, origin);
    }

    // Verify user membership via public.users
    const companyId = ticket.company_id;
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('company_id', companyId)
      .eq('active', true)
      .maybeSingle();
    if (userErr || !userRow) {
      if (userErr) console.warn(`[${FUNCTION_NAME}] users check error`, userErr);
      return jsonResponse(403, { error: 'User not allowed for this company', code: 'not_company_member' }, origin);
    }

    // RPC attempt (none configured) — skipping since RPC_NAME is empty

    // Upsert into ticket_devices with onConflict: ticket_id,device_id,relation_type
    const insertObj = {
      ticket_id: p_ticket_id,
      device_id: p_device_id,
      relation_type: p_relation_type,
    };

    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from('ticket_devices')
      .upsert(insertObj, { onConflict: 'ticket_id,device_id,relation_type' })
      .select('*')
      .single();

    if (upsertErr) {
      console.error(`[${FUNCTION_NAME}] Upsert failed`, upsertErr);
      return jsonResponse(500, { error: 'Internal upsert error', details: upsertErr }, origin);
    }

    return jsonResponse(200, { result: upserted }, origin);
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Internal error`, e);
    return jsonResponse(500, { error: 'Internal server error', details: e?.message || e }, origin);
  }
});

/*
Context and contract summary
Operation: Upsert into ticket_devices (fallback only; no RPC configured).
Validation: Only accept p_* keys. Required: p_ticket_id, p_device_id. Optional: p_relation_type ('repair' default).
Security: Require Bearer token; check membership in ticket.company_id; writes via service_role.
CORS: OPTIONS 200 with proper headers; restrict by ALLOW_ALL_ORIGINS/ALLOWED_ORIGINS.
Methods: Only POST and OPTIONS.
Response: 200 { result: {...} } on success; JSON errors with codes on failure.

Quick tests (replace placeholders):

# 1) OPTIONS preflight ok (200)
curl -i -X OPTIONS "https://<YOUR_PROJECT>.supabase.co/functions/v1/link-ticket-device" \
  -H "Origin: http://localhost:4200"

# 2) POST without Authorization → 401
curl -i -X POST "https://<YOUR_PROJECT>.supabase.co/functions/v1/link-ticket-device" \
  -H "Origin: http://localhost:4200" \
  -H "Content-Type: application/json" \
  -d '{
    "p_ticket_id": "00000000-0000-0000-0000-000000000000",
    "p_device_id": "00000000-0000-0000-0000-000000000000"
  }'

# 3) POST with valid Authorization and body → 200
curl -i -X POST "https://<YOUR_PROJECT>.supabase.co/functions/v1/link-ticket-device" \
  -H "Origin: http://localhost:4200" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "p_ticket_id": "<TICKET_UUID>",
    "p_device_id": "<DEVICE_UUID>",
    "p_relation_type": "repair"
  }'

Deploy commands:
  supabase functions deploy link-ticket-device --project-ref <YOUR_PROJECT_REF>
*/
