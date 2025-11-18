// @ts-nocheck
// Edge Function: upload-verifactu-cert
// Purpose: Store Veri*Factu certificate and configuration per company with server-side encryption.
// - Accepts plain PEM payload (cert_pem, key_pem, key_pass optional) and encrypts server-side with AES-GCM.
// - Backward-compat: if *_enc provided, server will ignore and re-encrypt from plain if available; if only *_enc present, rejects (to avoid client-managed crypto).
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

interface UploadPayload {
  software_code: string;
  issuer_nif: string;
  environment: 'pre' | 'prod';
  cert_pem?: string;       // plain cert (PEM)
  key_pem?: string;        // plain key (PEM)
  key_pass?: string | null;// plain passphrase (optional)
  cert_pem_enc?: string;   // deprecated: client-encrypted (ignored)
  key_pem_enc?: string;    // deprecated: client-encrypted (ignored)
  key_pass_enc?: string | null; // deprecated: client-encrypted (ignored)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // Only allow POST after CORS preflight
  if (req.method !== 'POST') {
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

  if (!body.software_code || !body.issuer_nif) {
    return new Response(JSON.stringify({ error: 'INVALID_PAYLOAD' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Require plain PEM inputs; phase out client-side encryption inputs
  if (!body.cert_pem || !body.key_pem) {
    return new Response(JSON.stringify({ error: 'MISSING_PLAIN_CERT_OR_KEY', hint: 'Provide cert_pem and key_pem (PEM format). Encryption is handled server-side.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // Server-side encryption helpers (AES-256-GCM)
  async function importAesKeyFromBase64(b64: string): Promise<CryptoKey> {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  }
  function encodeBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function toUtf8Bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }
  async function encryptText(plain: string, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = toUtf8Bytes(plain) as unknown as ArrayBuffer;
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const ivB64 = btoa(String.fromCharCode(...iv));
    return ivB64 + ':' + encodeBase64(ct);
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

  // Encrypt incoming plain values
  const encKeyB64 = Deno.env.get('VERIFACTU_CERT_ENC_KEY') || '';
  if (!encKeyB64) {
    return new Response(JSON.stringify({ error: 'MISSING_ENC_KEY', hint: 'Set VERIFACTU_CERT_ENC_KEY (base64-encoded 32-byte key) in environment.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
  let aesKey: CryptoKey;
  try {
    aesKey = await importAesKeyFromBase64(encKeyB64);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'INVALID_ENC_KEY', details: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  const cert_pem_enc = await encryptText(body.cert_pem, aesKey);
  const key_pem_enc = await encryptText(body.key_pem, aesKey);
  const key_pass_enc = body.key_pass ? await encryptText(body.key_pass, aesKey) : null;

  const upsertRow: any = {
    company_id: appUser.company_id,
    software_code: body.software_code.trim(),
    issuer_nif: issuerNif,
    environment: body.environment || 'pre',
    cert_pem_enc,
    key_pem_enc,
    key_pass_enc,
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