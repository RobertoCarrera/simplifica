// Edge Function: verifactu-cert-history
// Lists certificate rotation history for the authenticated company (owner/admin only).
// Returns metadata, not decrypted content. Encrypted blobs included for integrity checks if needed.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(origin: string | null) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "").toLowerCase() === "true";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const isAllowed = allowAll || (origin ? allowedOrigins.includes(origin) : false);
  return {
    "Access-Control-Allow-Origin": allowAll ? "*" : (isAllowed ? origin ?? "" : ""),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  // Permitir GET y POST para compatibilidad con callEdgeFunction
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'NO_AUTH' }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
  const serviceClient = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'INVALID_TOKEN', details: userErr?.message }), { status: 401, headers: { 'Content-Type': 'application/json', ...cors } });
  }
  const authUserId = userData.user.id;

  const { data: appUser, error: mapErr } = await serviceClient
    .from('users')
    .select('company_id, role, deleted_at')
    .eq('auth_user_id', authUserId)
    .is('deleted_at', null)
    .maybeSingle();

  if (mapErr) {
    return new Response(JSON.stringify({ error: 'USER_LOOKUP_FAILED', details: mapErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
  if (!appUser?.company_id) {
    return new Response(JSON.stringify({ error: 'NO_COMPANY' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }
  const role = (appUser.role || '').toLowerCase();
  if (!['owner','admin'].includes(role)) {
    return new Response(JSON.stringify({ error: 'FORBIDDEN_ROLE' }), { status: 403, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Fetch current settings to determine state
  const { data: settings, error: settingsErr } = await serviceClient
    .from('verifactu_settings')
    .select('software_code, issuer_nif, environment, cert_pem_enc, key_pem_enc, key_pass_enc')
    .eq('company_id', appUser.company_id)
    .maybeSingle();

  if (settingsErr) {
    return new Response(JSON.stringify({ error: 'SETTINGS_FETCH_FAILED', details: settingsErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Determine configuration state (only encrypted mode exists now)
  const configured = !!(settings?.cert_pem_enc && settings?.key_pem_enc);
  const mode = configured ? 'encrypted' : 'none';

  const settingsResponse = settings ? {
    software_code: settings.software_code || '',
    issuer_nif: settings.issuer_nif || '',
    environment: settings.environment || 'pre',
    configured,
    mode
  } : {
    software_code: '',
    issuer_nif: '',
    environment: 'pre',
    configured: false,
    mode: 'none'
  };

  const { data: history, error: histErr } = await serviceClient
    .from('verifactu_cert_history')
    .select('version, stored_at, rotated_by, integrity_hash, notes, cert_pem_enc, key_pem_enc, key_pass_enc')
    .eq('company_id', appUser.company_id)
    .order('version', { ascending: false });

  if (histErr) {
    return new Response(JSON.stringify({ error: 'HISTORY_FETCH_FAILED', details: histErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Redact encrypted blobs length only for lighter responses
  const response = (history || []).map((h: any) => ({
    version: h.version,
    stored_at: h.stored_at,
    rotated_by: h.rotated_by,
    integrity_hash: h.integrity_hash,
    notes: h.notes,
    cert_len: h.cert_pem_enc ? h.cert_pem_enc.length : null,
    key_len: h.key_pem_enc ? h.key_pem_enc.length : null,
    pass_present: !!h.key_pass_enc
  }));

  return new Response(JSON.stringify({ ok: true, settings: settingsResponse, history: response }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
});
