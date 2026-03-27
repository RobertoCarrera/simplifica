// @ts-nocheck
// ================================================================
// Edge Function: save-holded-integration
// ================================================================
// Saves / verifies / removes the Holded API key for a company.
//
// POST body:
//   { company_id: string, api_key?: string, disconnect?: boolean }
//
// Security:
//   - JWT auth required (owner or admin of the company)
//   - API key encrypted AES-256-GCM before storage, never returned raw
//   - Tests the key against Holded before saving
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';

/* ── env ─────────────────────────────────────────────────── */
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY     = Deno.env.get('ENCRYPTION_KEY');

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[save-holded-integration] ENCRYPTION_KEY must be at least 32 characters');
}

/* ── AES-256-GCM helpers ─────────────────────────────────── */
async function getAesKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(ENCRYPTION_KEY!.slice(0, 32));
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/* ── Holded connectivity test ────────────────────────────── */
async function testHoldedKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.holded.com/api/invoicing/v1/documents/invoice?page=1', {
      method: 'GET',
      headers: {
        'key': apiKey,
        'Accept': 'application/json',
      },
    });
    if (res.ok || res.status === 200) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'API Key inválida o sin permisos' };
    // Holded returns 400 for invalid key format too
    const body = await res.text().catch(() => '');
    return { ok: false, error: `Holded respondió ${res.status}: ${body.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar con Holded: ' + String(e) };
  }
}

/* ── main handler ─────────────────────────────────────────── */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  // Rate limit: 10 req/min per IP (credential storage endpoint)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`save-holded:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...headers, ...getRateLimitHeaders(rl) },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    /* ── 1. Auth ──────────────────────────────────────────── */
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[save-holded-integration] Missing Authorization header');
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), { status: 401, headers });
    }
    const token = authHeader.replace('Bearer ', '');

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      console.error('[save-holded-integration] Auth failed:', authError?.message ?? 'no user');
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers });
    }

    /* ── 2. Parse body ────────────────────────────────────── */
    const body = await req.json();
    const { company_id, api_key, disconnect } = body as {
      company_id: string;
      api_key?: string;
      disconnect?: boolean;
    };

    if (!company_id) {
      return new Response(JSON.stringify({ error: 'company_id is required' }), { status: 400, headers });
    }
    if (!disconnect && !api_key) {
      return new Response(JSON.stringify({ error: 'api_key is required' }), { status: 400, headers });
    }
    if (api_key && api_key.length < 20) {
      return new Response(JSON.stringify({ error: 'api_key parece demasiado corta para ser válida' }), { status: 400, headers });
    }

    /* ── 3. Authorise: user must be owner/admin of company ── */

    const { data: membership, error: memberError } = await admin
      .from('users')
      .select('id, app_role:app_roles(name)')
      .eq('auth_user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: 'No eres miembro de esta empresa' }), { status: 403, headers });
    }
    const memberRole = (membership as any).app_role?.name;
    if (!['owner', 'admin'].includes(memberRole)) {
      return new Response(JSON.stringify({ error: 'Solo el propietario o administrador puede gestionar integraciones' }), { status: 403, headers });
    }

    /* ── 4. Disconnect path ───────────────────────────────── */
    if (disconnect) {
      const { error: delError } = await admin
        .from('holded_integrations')
        .delete()
        .eq('company_id', company_id);
      if (delError) throw delError;
      console.log(`[save-holded-integration] Disconnected Holded for company ${company_id}`);
      return new Response(JSON.stringify({ success: true, disconnected: true }), { status: 200, headers });
    }

    /* ── 5. Test the API key against Holded ─────────────────*/
    const test = await testHoldedKey(api_key!);
    if (!test.ok) {
      return new Response(JSON.stringify({ error: test.error ?? 'API Key no válida' }), { status: 422, headers });
    }

    /* ── 6. Encrypt and upsert ───────────────────────────── */
    const encryptedKey = await encrypt(api_key!);
    const now          = new Date().toISOString();

    const { data: existing } = await admin
      .from('holded_integrations')
      .select('id')
      .eq('company_id', company_id)
      .maybeSingle();

    const row = {
      company_id,
      api_key_encrypted:   encryptedKey,
      is_active:           true,
      verification_status: 'verified',
      connected_at:        now,
      last_verified_at:    now,
      updated_at:          now,
    };

    if (existing?.id) {
      const { error } = await admin
        .from('holded_integrations')
        .update(row)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('holded_integrations')
        .insert({ id: crypto.randomUUID(), created_at: now, ...row });
      if (error) throw error;
    }

    /* ── 7. Return masked key (last 4 chars) ─────────────── */
    const masked = '••••••••' + api_key!.slice(-4);
    console.log(`[save-holded-integration] Saved & verified Holded key for company ${company_id}`);

    return new Response(JSON.stringify({
      success:             true,
      is_active:           true,
      verification_status: 'verified',
      api_key_masked:      masked,
      connected_at:        now,
    }), { status: 200, headers });

  } catch (err: any) {
    console.error('[save-holded-integration] Error:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500, headers });
  }
});
