// @ts-nocheck
// Supabase Edge Function: upsert-client
// Server-enforced company_id derivation (ignores any pcompanyid/p_company_id from clients)
// - Accepts canonical p_* keys and compact p... keys (normalized server-side).
// - Resolves company_id from authenticated user (public.users.auth_user_id -> company_id).
// - Normalizes inputs: uppercase (except email lowercased) and sanitizes strings.
// - Uses service role for writes (bypass RLS) after ownership checks to avoid RLS conflicts.
// - CORS via ALLOW_ALL_ORIGINS and ALLOWED_ORIGINS env vars; rate limited per IP.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

const FUNCTION_NAME = 'upsert-client';
const FUNCTION_VERSION = '2026-03-25-pii-encryption';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Fix #18: ALLOW_ALL_ORIGINS only active when NOT using a real HTTPS Supabase URL
// (i.e., only in local dev). In production this will always be false.
const ALLOW_ALL_ORIGINS =
  !(Deno.env.get('SUPABASE_URL') || '').startsWith('https://') &&
  (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Feature gate: set ENABLE_CLIENT_PII_ENCRYPTION=true in production to activate
// encryption path. Default false for safe rollout without breaking existing workflows.
const ENABLE_CLIENT_PII_ENCRYPTION =
  (Deno.env.get('ENABLE_CLIENT_PII_ENCRYPTION') || 'false').toLowerCase() === 'true';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function corsHeaders(origin, requestId?: string) {
  const h = new Headers();
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (ALLOW_ALL_ORIGINS) {
    h.set('Access-Control-Allow-Origin', origin || '');
  } else {
    const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
    if (ok) h.set('Access-Control-Allow-Origin', ok);
  }
  h.set('Content-Type', 'application/json');
  h.set('X-Function-Name', FUNCTION_NAME);
  h.set('X-Function-Version', FUNCTION_VERSION);
  // Fix #23: Add X-Request-ID for end-to-end tracing
  if (requestId) h.set('X-Request-ID', requestId);
  return h;
}

function isOriginAllowed(origin) {
  if (!origin) return true; // server-to-server
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

// Map canonical inputs to DB columns for clients table.
const FIELD_MAP: Record<string, string> = {
  p_id: 'id',
  p_name: 'name',
  p_apellidos: 'surname',
  p_email: 'email',
  p_phone: 'phone',
  p_dni: 'dni',
  p_metadata: 'metadata',
  pclienttype: 'client_type',
  pname: 'name',
  papellidos: 'surname',
  pemail: 'email',
  pphone: 'phone',
  pdni: 'dni',
  pbusinessname: 'business_name',
  pcifnif: 'cif_nif',
  ptradename: 'trade_name',
  plegalrepresentativename: 'legal_representative_name',
  plegalrepresentativedni: 'legal_representative_dni',
  pmercantileregistrydata: 'mercantile_registry_data',
};

// Security: Sanitize string to prevent XSS and injection
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .trim()
    .replace(/[<>\"'`]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .substring(0, 500);
}

// Security: Validate email format
function isValidEmail(email) {
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  return emailRegex.test(email);
}

// Fix #23: Generate a short request ID for tracing
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}

// Fix #7: Audit log helper — logs client operations via gdpr_audit_log RPC
async function auditLog(
  supabase,
  params: {
    userId: string;
    companyId: string;
    actionType: string;
    recordId?: string;
    subjectEmail?: string;
    newValues?: Record<string, unknown>;
    requestId?: string;
  },
): Promise<void> {
  try {
    await supabase.rpc('gdpr_log_access', {
      user_id: params.userId,
      company_id: params.companyId,
      action_type: params.actionType,
      table_name: 'clients',
      record_id: params.recordId || null,
      subject_email: params.subjectEmail || null,
      purpose: `Edge function: ${FUNCTION_NAME}`,
      new_values: { ...params.newValues, request_id: params.requestId },
    });
  } catch (e) {
    console.warn(`[${FUNCTION_NAME}] Audit log failed:`, e);
  }
}

// ── Health-data consent check (Task 1.2) ─────────────────────────────────────
// Returns true if the client has an active health_data consent record.
// Must pass before storing health-category client data (Art. 9 GDPR).
// CONSENT IS ONLY REQUIRED if the company has the 'historialClinico' module active.
async function hasHealthDataConsent(
  supabase: ReturnType<typeof createClient>,
  subjectEmail: string,
  companyId: string,
): Promise<boolean> {
  try {
    // 1. Check if company has 'historialClinico' module active
    const { data: moduleData, error: moduleError } = await supabase
      .from('company_modules')
      .select('company_id')
      .eq('company_id', companyId)
      .eq('module_key', 'historialClinico')
      .eq('status', 'active')
      .maybeSingle();

    if (moduleError) {
      console.warn(`[${FUNCTION_NAME}] Module check error:`, moduleError);
      return false;
    }

    // If company does NOT have historialClinico module active → consent NOT required
    if (!moduleData) {
      return true;
    }

    // 2. Check for active health_data consent record
    const { data, error } = await supabase
      .from('gdpr_consent_records')
      .select('id')
      .eq('subject_email', subjectEmail)
      .eq('company_id', companyId)
      .eq('consent_type', 'health_data')
      .eq('consent_given', true)
      .is('withdrawn_at', null)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`[${FUNCTION_NAME}] Health consent check error:`, error);
      return false;
    }
    return data !== null;
  } catch (e) {
    console.warn(`[${FUNCTION_NAME}] Health consent check exception:`, e);
    return false;
  }
}

// ── PII Encryption (Task 1.2) ────────────────────────────────────────────────
// Calls the SECURITY DEFINER RPC encrypt_client_pii() from the DB.
// Returns { dni_encrypted, birth_date_encrypted } or null on failure.
async function encryptClientPii(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  dni: string,
  birthDate?: string,
): Promise<{ dni_encrypted: string; birth_date_encrypted: string | null } | null> {
  try {
    const { data, error } = await supabase.rpc('encrypt_client_pii', {
      p_company_id: companyId,
      p_dni: dni,
      p_birth_date: birthDate ?? null,
    });

    if (error) {
      console.error(`[${FUNCTION_NAME}] encrypt_client_pii RPC error:`, error);
      return null;
    }
    return data as { dni_encrypted: string; birth_date_encrypted: string | null };
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] encrypt_client_pii exception:`, e);
    return null;
  }
}

serve(async (req) => {
  const requestId = generateRequestId();
  const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
  const headers = corsHeaders(origin, requestId);

  // Rate limiting check
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rateLimit = await checkRateLimit(`upsert-client:${ip}`, 100, 60000); // 100 req/min per IP

  const rateLimitHeaders = getRateLimitHeaders(rateLimit);
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    headers.set(key, value);
  }

  if (!rateLimit.allowed) {
    console.warn(`[${FUNCTION_NAME}] Rate limit exceeded for IP: ${ip}`);
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded. Please try again later.',
        limit: rateLimit.limit,
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      }),
      { status: 429, headers },
    );
  }

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers,
      });
    }
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }),
      { status: 405, headers },
    );
  }

  if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
  }

  try {
    // Auth: require Bearer token
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), {
        status: 401,
        headers,
      });
    }
    const token = match[1];

    // Validate token and get user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }
    const authUserId = userData.user.id;

    // Security: verify user email is confirmed
    if (!userData.user.email_confirmed_at && !userData.user.confirmed_at) {
      return new Response(
        JSON.stringify({
          error: 'Email not confirmed. Please verify your email before creating clients.',
        }),
        { status: 403, headers },
      );
    }

    // Create a Supabase client with user context (respects RLS) for reads
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Resolve company_id from users table using user context
    let company_id = null;
    let internalUserId = null;
    try {
      const { data: urows, error: uerr } = await supabaseUser
        .from('users')
        .select('id, company_id')
        .eq('auth_user_id', authUserId)
        .limit(1)
        .maybeSingle();
      if (!uerr && urows && urows.company_id) {
        company_id = urows.company_id;
        internalUserId = urows.id;
      }
    } catch (e) {
      console.error('[upsert-client] Error resolving company:', e);
    }
    if (!company_id) {
      return new Response(
        JSON.stringify({ error: 'Unable to determine company for authenticated user' }),
        { status: 403, headers },
      );
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
    }

    // Normalize keys
    const norm: Record<string, any> = {};
    for (const [inKey, val] of Object.entries(body)) {
      if (!inKey || typeof inKey !== 'string') continue;
      let k = inKey.trim();
      k = k.toLowerCase();
      const spanishMap: Record<string, string> = {
        p_nombre: 'p_name',
        p_apellidos: 'p_apellidos',
        p_email: 'p_email',
        p_telefono: 'p_phone',
        p_dni: 'p_dni',
        p_empresa: 'p_businessname',
        p_cif_nif: 'p_cifnif',
        p_cif: 'p_cifnif',
        p_id: 'p_id',
        p_company_id: 'p_company_id',
      };
      if (spanishMap[k]) k = spanishMap[k];
      if (!k.includes('_') && k.startsWith('p') && k.length > 1) {
        k = 'p_' + k.substring(1);
      }
      if (!k.startsWith('p_') && k !== 'pclienttype') continue;
      if (k === 'p_company_id' || k === 'pcompanyid') continue;
      norm[k] = val;
    }

    // Security: Input validation and sanitization
    const normalized: Record<string, any> = {};
    for (const [k, v] of Object.entries(norm)) {
      if (v == null) {
        normalized[k] = v;
        continue;
      }
      if (typeof v === 'string') {
        const sanitized = sanitizeString(v);
        if (k === 'p_email') {
          const emailLower = sanitized.toLowerCase();
          if (emailLower && !isValidEmail(emailLower)) {
            return new Response(JSON.stringify({ error: 'Invalid email format' }), {
              status: 400,
              headers,
            });
          }
          normalized[k] = emailLower;
        } else {
          normalized[k] = sanitized;
        }
      } else if (typeof v === 'object' && k === 'p_metadata') {
        try {
          const meta: any = {};
          const MAX_META_KEYS = 50;
          let keyCount = 0;
          for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
            // Fix #25: Block prototype pollution including nested property names
            if (
              [
                '__proto__',
                'constructor',
                'prototype',
                'toString',
                'valueOf',
                'hasOwnProperty',
              ].includes(mk)
            )
              continue;
            if (++keyCount > MAX_META_KEYS) break;
            if (!/^[a-zA-Z0-9_]{1,64}$/.test(mk)) continue;
            // Fix #25: Also sanitize string values that could contain prototype-pollution payloads
            if (typeof mv === 'string') meta[mk] = sanitizeString(mv as string);
            else if (typeof mv === 'number' || typeof mv === 'boolean' || mv === null)
              meta[mk] = mv;
            // Skip complex nested objects to prevent arbitrary data storage and pollution
          }
          const serialized = JSON.stringify(meta);
          if (serialized.length > 10240) {
            console.warn('[upsert-client] Metadata too large, truncating');
            normalized[k] = {};
          } else {
            normalized[k] = meta;
          }
        } catch (_) {
          normalized[k] = {};
        }
      } else {
        // Fix #19: Only pass through known primitive types; reject objects/arrays
        if (typeof v === 'number' || typeof v === 'boolean') {
          normalized[k] = v;
        }
        // Silently drop unexpected types (arrays, objects for non-metadata fields)
      }
    }

    // Determine client type (default INDIVIDUAL)
    const rawType = normalized.pclienttype || normalized.p_client_type || 'INDIVIDUAL';
    const clientType = String(rawType).toUpperCase() === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL';
    normalized.pclienttype = clientType;

    // Map normalized fields
    const row: any = {};
    for (const [pk, col] of Object.entries(FIELD_MAP)) {
      if (pk in normalized && normalized[pk] !== undefined) {
        row[col] = normalized[pk];
      }
    }
    if (!row.client_type) row.client_type = clientType;

    // Defaults per type
    if (clientType === 'INDIVIDUAL') {
      if (!row.dni) row.dni = 'PENDIENTE';
    } else if (clientType === 'BUSINESS') {
      if (!row.cif_nif) row.cif_nif = 'PENDIENTE';
    }

    // Validate required per type
    if (clientType === 'BUSINESS') {
      if (!row.business_name || !row.cif_nif || !row.email) {
        return new Response(
          JSON.stringify({
            error: 'Missing required business fields: pbusinessname, pcifnif, pemail',
          }),
          { status: 400, headers },
        );
      }
    } else {
      if (!row.name || !row.email) {
        return new Response(
          JSON.stringify({
            error: 'Missing required individual fields: pname (or p_name) and pemail (or p_email)',
          }),
          { status: 400, headers },
        );
      }
    }

    // Insert/Update logic
    if (row.id) {
      // Update existing client
      const { data: existing, error: existErr } = await supabaseAdmin
        .from('clients')
        .select('company_id,name,surname,client_type,dni,business_name,cif_nif,email')
        .eq('id', row.id)
        .limit(1)
        .maybeSingle();
      if (existErr) {
        console.error('[upsert-client] Error resolving existing client:', existErr);
        return new Response(JSON.stringify({ error: 'Failed to resolve existing client' }), {
          status: 500,
          headers,
        });
      }
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Client not found' }), {
          status: 404,
          headers,
        });
      }
      if (existing.company_id !== company_id) {
        return new Response(
          JSON.stringify({ error: 'Not allowed to modify client from another company' }),
          { status: 403, headers },
        );
      }

      row.updated_at = new Date().toISOString();
      const whitelist = [
        'name',
        'email',
        'phone',
        'metadata',
        'surname',
        'dni',
        'business_name',
        'cif_nif',
        'trade_name',
        'legal_representative_name',
        'legal_representative_dni',
        'mercantile_registry_data',
        'client_type',
      ];
      const safeUpdate: any = {};
      for (const key of whitelist) {
        if (row[key] !== undefined) safeUpdate[key] = row[key];
      }
      if ('name' in row || 'surname' in row) {
        const fullName = [row.name ?? existing?.name, row.surname ?? existing?.surname]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();
        if (fullName) safeUpdate.name = fullName;
      }
      const typeForUpdate = (row.client_type || existing.client_type || '').toUpperCase();
      if (typeForUpdate === 'BUSINESS') {
        if (!safeUpdate.cif_nif && existing.cif_nif) safeUpdate.cif_nif = existing.cif_nif;
        if (!safeUpdate.business_name && existing.business_name)
          safeUpdate.business_name = existing.business_name;
      } else {
        if (!safeUpdate.dni && existing.dni) safeUpdate.dni = existing.dni;
      }
      if (Object.keys(safeUpdate).length === 0) {
        return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
          status: 400,
          headers,
        });
      }
      if (safeUpdate.client_type)
        safeUpdate.client_type = String(safeUpdate.client_type).toLowerCase();

      // ── Task 1.2: Encrypt updated DNI when PII encryption is active ──
      if (ENABLE_CLIENT_PII_ENCRYPTION && safeUpdate.dni && safeUpdate.dni !== 'PENDIENTE') {
        const encrypted = await encryptClientPii(supabaseAdmin, company_id, safeUpdate.dni);
        if (encrypted) {
          safeUpdate.dni_encrypted = encrypted.dni_encrypted;
          safeUpdate.birth_date_encrypted = encrypted.birth_date_encrypted;
          safeUpdate.pii_key_version = 1;
        } else {
          console.error(`[${FUNCTION_NAME}] DNI encryption failed during update, blocking`);
          return new Response(
            JSON.stringify({ error: 'Failed to encrypt client PII. Please contact support.' }),
            { status: 500, headers },
          );
        }
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('clients')
        .update(safeUpdate)
        .eq('id', row.id)
        .select()
        .maybeSingle();
      if (updateErr) {
        console.error('[upsert-client] Update error:', updateErr);
        return new Response(JSON.stringify({ error: 'Failed to update client' }), {
          status: 500,
          headers,
        });
      }

      // Fix #7: Audit log the update
      await auditLog(supabaseAdmin, {
        userId: internalUserId || authUserId,
        companyId: company_id,
        actionType: 'UPDATE_CLIENT',
        recordId: row.id,
        subjectEmail: existing.email || row.email,
        newValues: { updated_fields: Object.keys(safeUpdate) },
        requestId,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          method: 'update',
          updated_fields: Object.keys(safeUpdate),
          client: updated,
        }),
        { status: 200, headers },
      );
    } else {
      // Create new client
      const { data: dupCheck, error: dupErr } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('company_id', company_id)
        .ilike('email', row.email)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();

      if (dupErr && dupErr.code !== 'PGRST116') {
        console.error('[upsert-client] Error checking duplicates:', dupErr);
        return new Response(JSON.stringify({ error: 'Failed to check for duplicates' }), {
          status: 500,
          headers,
        });
      }

      if (dupCheck) {
        return new Response(
          JSON.stringify({ error: 'A client with this email already exists in your company' }),
          { status: 409, headers },
        );
      }

      // ── Task 1.2: Consent gate — block health-data inserts without explicit consent ──
      // A client is flagged as health-data when metadata.is_health_client = true.
      const isHealthClient = row.metadata?.is_health_client === true;
      if (isHealthClient && row.email) {
        const consentGranted = await hasHealthDataConsent(supabaseAdmin, row.email, company_id);
        if (!consentGranted) {
          console.warn(
            `[${FUNCTION_NAME}] Blocked health-data insert: no health_data consent for ${row.email}`,
          );
          return new Response(
            JSON.stringify({
              error: 'Health data consent required',
              code: 'CONSENT_REQUIRED',
              consent_type: 'health_data',
              message:
                'El cliente debe otorgar consentimiento para datos de salud (Art. 9 RGPD) antes de almacenar información sanitaria.',
            }),
            { status: 422, headers },
          );
        }
      }

      const fullNameForInsert = [row.name, row.surname]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const toInsertBase: any = {
        company_id,
        name: fullNameForInsert || row.name,
        surname: row.surname ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        metadata: row.metadata ?? {},
        client_type: clientType.toLowerCase(),
      };

      if (clientType === 'INDIVIDUAL') {
        const plainDni = row.dni ?? 'PENDIENTE';
        toInsertBase.dni = plainDni;

        // ── Task 1.2: PII Encryption — store encrypted DNI alongside plaintext ──
        // Feature-gated so existing workflows are never broken during rollout.
        if (ENABLE_CLIENT_PII_ENCRYPTION && plainDni && plainDni !== 'PENDIENTE') {
          const encrypted = await encryptClientPii(supabaseAdmin, company_id, plainDni);
          if (encrypted) {
            toInsertBase.dni_encrypted = encrypted.dni_encrypted;
            toInsertBase.birth_date_encrypted = encrypted.birth_date_encrypted;
            toInsertBase.pii_key_version = 1;
          } else {
            // Encryption failure blocks insert when gate is active — security > availability
            console.error(
              `[${FUNCTION_NAME}] DNI encryption failed for new client, blocking insert`,
            );
            return new Response(
              JSON.stringify({ error: 'Failed to encrypt client PII. Please contact support.' }),
              { status: 500, headers },
            );
          }
        }
      } else {
        toInsertBase.cif_nif = row.cif_nif ?? 'PENDIENTE';
        toInsertBase.business_name = row.business_name ?? null;
      }
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('clients')
        .insert(toInsertBase)
        .select()
        .maybeSingle();
      if (insertErr) {
        console.error('[upsert-client] Insert error:', insertErr);
        return new Response(JSON.stringify({ error: 'Failed to create client' }), {
          status: 500,
          headers,
        });
      }

      // Fix #7: Audit log the creation
      await auditLog(supabaseAdmin, {
        userId: internalUserId || authUserId,
        companyId: company_id,
        actionType: 'CREATE_CLIENT',
        recordId: inserted?.id,
        subjectEmail: row.email,
        newValues: { client_type: clientType },
        requestId,
      });

      return new Response(JSON.stringify({ ok: true, method: 'create', client: inserted }), {
        status: 201,
        headers,
      });
    }
  } catch (e) {
    console.error('[upsert-client] Unexpected error:', e);
    const h = corsHeaders(undefined, requestId);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: h,
    });
  }
});
