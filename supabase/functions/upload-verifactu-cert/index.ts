// Edge Function: upload-verifactu-cert
// Purpose: Store encrypted Veri*Factu certificate and configuration per company.
// - Accepts encrypted PEM payload from client.
// - Restricted to owner/admin via service role (function runs with service key) + RLS for direct reads.
// - CORS configurable via ALLOW_ALL_ORIGINS=true or ALLOWED_ORIGINS list.

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

interface UploadPayload {
  software_code: string;
  issuer_nif: string;
  environment: 'pre' | 'prod';
  cert_pem_enc: string;
  key_pem_enc: string;
  key_pass_enc?: string | null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
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

  // Map auth user -> company + role
  const { data: appUser, error: mapErr } = await serviceClient
    .from('users')
    .select('id, company_id, role, deleted_at')
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

  let body: UploadPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  if (!body.software_code || !body.issuer_nif || !body.cert_pem_enc || !body.key_pem_enc) {
    return new Response(JSON.stringify({ error: 'INVALID_PAYLOAD' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Normalized issuer
  const issuerNif = body.issuer_nif.trim().toUpperCase();

  // Fetch existing to rotate history
  const { data: existing, error: fetchExistingErr } = await serviceClient
    .from('verifactu_settings')
    .select('company_id, cert_pem_enc, key_pem_enc, key_pass_enc')
    .eq('company_id', appUser.company_id)
    .maybeSingle();

  if (fetchExistingErr) {
    return new Response(JSON.stringify({ error: 'FETCH_EXISTING_FAILED', details: fetchExistingErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // If existing encrypted cert present, store in history BEFORE overwrite.
  if (existing && (existing.cert_pem_enc || existing.key_pem_enc || existing.key_pass_enc)) {
    // Determine next version
    const { data: maxRow } = await serviceClient
      .from('verifactu_cert_history')
      .select('version')
      .eq('company_id', appUser.company_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (maxRow?.version || 0) + 1;
    const integritySource = (existing.cert_pem_enc || '') + (existing.key_pem_enc || '');
    const integrityHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(integritySource))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(''));
    const historyRow = {
      company_id: appUser.company_id,
      version: nextVersion,
      rotated_by: authUserId,
      cert_pem_enc: existing.cert_pem_enc || null,
      key_pem_enc: existing.key_pem_enc || null,
      key_pass_enc: existing.key_pass_enc || null,
      integrity_hash: integrityHash,
      notes: 'Auto-rotation before update'
    } as any;
    await serviceClient.from('verifactu_cert_history').insert(historyRow);
  }

  const upsertRow: any = {
    company_id: appUser.company_id,
    software_code: body.software_code.trim(),
    issuer_nif: issuerNif,
    environment: body.environment || 'pre',
    cert_pem_enc: body.cert_pem_enc,
    key_pem_enc: body.key_pem_enc,
    key_pass_enc: body.key_pass_enc ?? null,
    updated_at: new Date().toISOString()
  };

  const { error: upsertErr } = await serviceClient
    .from('verifactu_settings')
    .upsert(upsertRow, { onConflict: 'company_id' });

  if (upsertErr) {
    return new Response(JSON.stringify({ error: 'UPSERT_FAILED', details: upsertErr.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
});

// EOF