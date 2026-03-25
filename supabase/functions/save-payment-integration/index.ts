import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';

// TODO: Re-enable withCsrf once frontend implements X-CSRF-Token header

/* ── env ─────────────────────────────────────────────── */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[save-payment-integration] ENCRYPTION_KEY must be at least 32 characters');
}

/* ── AES-GCM helpers (same format as payment-webhook-stripe/decrypt) ── */
async function getAesKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(ENCRYPTION_KEY!.slice(0, 32));
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Prepend IV to ciphertext, then base64-encode (same layout decrypt() expects)
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const key = await getAesKey();
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

/* ── main handler ────────────────────────────────────── */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  // Rate limiting: 20 req/min per IP (payment credential storage)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`save-payment-integration:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...headers, ...getRateLimitHeaders(rl) },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  }

  try {
    /* ── 1. Auth: verify JWT server-side ─────────────── */
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers,
      });
    }
    const token = authHeader.replace('Bearer ', '');

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers,
      });
    }

    /* ── 2. Parse body ──────────────────────────────── */
    const body = await req.json();
    const {
      company_id,
      provider,
      credentials,
      webhook_secret,
      is_sandbox,
      is_active,
    }: {
      company_id: string;
      provider: 'stripe' | 'paypal';
      credentials?: Record<string, string>;
      webhook_secret?: string;
      is_sandbox?: boolean;
      is_active?: boolean;
    } = body;

    if (!company_id || !provider) {
      return new Response(JSON.stringify({ error: 'company_id and provider are required' }), {
        status: 400,
        headers,
      });
    }
    if (!['stripe', 'paypal'].includes(provider)) {
      return new Response(JSON.stringify({ error: 'Invalid provider' }), {
        status: 400,
        headers,
      });
    }

    /* ── 3. Authorise: user must be owner/admin of the company ── */
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: membership, error: memberError } = await supabaseAdmin
      .from('users')
      .select('id, app_role:app_roles(name)')
      .eq('auth_user_id', user.id)
      .eq('company_id', company_id)
      .single();

    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: 'Not a member of this company' }), {
        status: 403,
        headers,
      });
    }
    const memberRole = (membership as any).app_role?.name;
    if (!['owner', 'admin'].includes(memberRole)) {
      return new Response(JSON.stringify({ error: 'Only owner/admin can manage integrations' }), {
        status: 403,
        headers,
      });
    }

    /* ── 4. Encrypt secrets ─────────────────────────── */
    // Fetch existing row (if any) so we can preserve unchanged fields
    const { data: existing } = await supabaseAdmin
      .from('payment_integrations')
      .select('id, credentials_encrypted, webhook_secret_encrypted')
      .eq('company_id', company_id)
      .eq('provider', provider)
      .maybeSingle();

    // Credentials: only re-encrypt if the caller sent new ones
    let credentialsEncrypted: string;
    if (credentials && Object.keys(credentials).length > 0) {
      credentialsEncrypted = await encrypt(JSON.stringify(credentials));
    } else if (existing?.credentials_encrypted) {
      credentialsEncrypted = existing.credentials_encrypted;
    } else {
      return new Response(
        JSON.stringify({ error: 'credentials are required for a new integration' }),
        {
          status: 400,
          headers,
        },
      );
    }

    // Webhook secret: only re-encrypt if the caller sent a new one
    let webhookSecretEncrypted: string | null = existing?.webhook_secret_encrypted ?? null;
    if (webhook_secret) {
      webhookSecretEncrypted = await encrypt(webhook_secret);
    }

    /* ── 5. Upsert ──────────────────────────────────── */
    const row = {
      company_id,
      provider,
      is_active: is_active ?? true,
      is_sandbox: is_sandbox ?? false,
      credentials_encrypted: credentialsEncrypted,
      webhook_secret_encrypted: webhookSecretEncrypted,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing?.id) {
      // Update
      const { data, error } = await supabaseAdmin
        .from('payment_integrations')
        .update(row)
        .eq('id', existing.id)
        .select(
          'id, company_id, provider, is_active, is_sandbox, webhook_url, verification_status, last_verified_at, created_at, updated_at, webhook_secret_encrypted',
        )
        .single();
      if (error) throw error;
      result = data;
    } else {
      // Insert
      const { data, error } = await supabaseAdmin
        .from('payment_integrations')
        .insert({ ...row, id: crypto.randomUUID() })
        .select(
          'id, company_id, provider, is_active, is_sandbox, webhook_url, verification_status, last_verified_at, created_at, updated_at, webhook_secret_encrypted',
        )
        .single();
      if (error) throw error;
      result = data;
    }

    /* ── 6. Return masked response ──────────────────── */
    const response = {
      ...result,
      credentials_masked: {
        clientId: credentials?.clientId ? credentials.clientId.slice(0, 8) + '...' : '******',
        publishableKey: credentials?.publishableKey
          ? credentials.publishableKey.slice(0, 12) + '...'
          : '******',
      },
      webhook_secret_encrypted: result.webhook_secret_encrypted ? '[encrypted]' : null,
    };

    console.log(
      `[save-payment-integration] Saved ${provider} integration for company ${company_id}`,
    );
    return new Response(JSON.stringify(response), { status: 200, headers });
  } catch (err: any) {
    console.error('[save-payment-integration] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers,
    });
  }
});
