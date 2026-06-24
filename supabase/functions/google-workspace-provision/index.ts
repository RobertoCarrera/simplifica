/**
 * Edge Function: google-workspace-provision
 * Encrypts the SMTP password for a Google Workspace email account.
 *
 * Auth: Bearer JWT — user must be authenticated and company member.
 *
 * Input:
 *   {
 *     emailAccountId: string,
 *     smtpPassword: string    // Plaintext password to encrypt
 *   }
 *
 * Uses pgcrypto encrypt_text RPC to encrypt the password.
 * Updates company_email_accounts.smtp_encrypted_password.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';


// ── Rate-limit helper ────────────────────────────────────────────────────────

/**
 * Extract the `sub` claim from a Supabase JWT WITHOUT verifying the signature.
 * Used ONLY for rate-limit keying — the gateway already validates the JWT
 * (`verify_jwt = true` in config.toml). If the JWT is missing or malformed
 * we return null and fall back to IP-based keying in the caller.
 */
function getUserIdFromJwt(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.replace('Bearer ', '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return (decoded.sub as string) || null;
  } catch {
    return null;
  }
}


serve(async (req: Request) => {
  // Rate limiting FIRST (before CORS preflight) — Rafter v0.47 LOW batch.
  // 30/min/user_id — SMTP password provisioning, rare and sensitive.
  const rlUserId = getUserIdFromJwt(req);
  const rlIp = getClientIP(req);
  const rateKey = rlUserId ? `google-workspace-provision:${rlUserId}` : `google-workspace-provision:ip:${rlIp}`;
  const rl = await checkRateLimit(rateKey, 30, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      },
    });
  }

  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req) as Response;
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'missing_auth' }), {
      status: 401,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  const token = authHeader.replace('Bearer ', '');
  let tokenClaims: Record<string, unknown> = {};
  try {
    const payloadB64 = token.split('.')[1];
    const payloadJson = new TextDecoder().decode(
      Uint8Array.from(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
    );
    tokenClaims = JSON.parse(payloadJson);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'malformed_token' }), {
      status: 401,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  const userId = tokenClaims.sub as string;
  const companyId = tokenClaims.company_id as string;
  if (!userId || !companyId) {
    return new Response(JSON.stringify({ success: false, error: 'invalid_token' }), {
      status: 401,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { emailAccountId?: string; smtpPassword?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'invalid_json' }), {
      status: 400,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  const { emailAccountId, smtpPassword } = body;
  if (!emailAccountId || !smtpPassword) {
    return new Response(JSON.stringify({ success: false, error: 'missing_params' }), {
      status: 400,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Encrypt password ────────────────────────────────────────────────────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
  const { data: encryptedHex, error: encryptErr } = await supabaseAdmin.rpc('encrypt_text', {
    plaintext: smtpPassword,
    key: encryptionKey,
  });

  if (encryptErr) {
    return new Response(JSON.stringify({ success: false, error: `Encryption failed: ${encryptErr.message}` }), {
      status: 500,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Update account record ──────────────────────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('company_email_accounts')
    .update({
      smtp_encrypted_password: encryptedHex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', emailAccountId)
    .eq('company_id', companyId);

  if (updateErr) {
    return new Response(JSON.stringify({ success: false, error: `DB update failed: ${updateErr.message}` }), {
      status: 500,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  return new Response(
    JSON.stringify({ success: true, message: 'SMTP password encrypted and stored' }),
    { status: 200, headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }) },
  );
});
