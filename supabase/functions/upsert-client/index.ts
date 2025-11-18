// @ts-nocheck
// Supabase Edge Function: upsert-client
// Server-enforced company_id derivation (ignores any pcompanyid/p_company_id from clients)
// - Accepts canonical p_* keys and compact p... keys (normalized server-side).
// - Resolves company_id from authenticated user (public.users.auth_user_id -> company_id).
// - Normalizes inputs: uppercase (except email lowercased) and sanitizes strings.
// - Uses service role for writes (bypass RLS) after ownership checks to avoid RLS conflicts.
// - CORS via ALLOW_ALL_ORIGINS and ALLOWED_ORIGINS env vars; rate limited per IP.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============= RATE LIMITER (Inline) =============
interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
        if (entry.resetAt < now) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);

interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
}

function checkRateLimit(
    ip: string,
    limit: number = 100,
    windowMs: number = 60000
): RateLimitResult {
    const now = Date.now();
    const key = `ratelimit:${ip}`;
  
    let entry = rateLimitMap.get(key);
  
    if (!entry || entry.resetAt < now) {
        entry = {
            count: 0,
            resetAt: now + windowMs
        };
        rateLimitMap.set(key, entry);
    }
  
    entry.count++;
  
    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);
  
    return {
        allowed,
        limit,
        remaining,
        resetAt: entry.resetAt
    };
}

function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
        'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString()
    };
}
// ============= END RATE LIMITER =============

const FUNCTION_NAME = 'upsert-client';
const FUNCTION_VERSION = '2025-11-18-RLS-COMPANY-DERIVED';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s=>s.trim()).filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

function corsHeaders(origin) {
    const h = new Headers();
    h.set('Vary', 'Origin');
    h.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (ALLOW_ALL_ORIGINS) {
        h.set('Access-Control-Allow-Origin', origin || '*');
    } else {
        const ok = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
        if (ok) h.set('Access-Control-Allow-Origin', ok);
    }
    h.set('Content-Type', 'application/json');
    h.set('X-Function-Name', FUNCTION_NAME);
    h.set('X-Function-Version', FUNCTION_VERSION);
    return h;
}

function isOriginAllowed(origin) {
    if (!origin) return true; // server-to-server
    if (ALLOW_ALL_ORIGINS) return true;
    if (ALLOWED_ORIGINS.length === 0) return false;
    return ALLOWED_ORIGINS.includes(origin);
}

// Map canonical inputs to DB columns for clients table.
// Backwards compatible: accepts legacy p_* underscore style and new compact p<field> style.
const FIELD_MAP: Record<string,string> = {
    // Legacy keys
    p_id: 'id',
    p_name: 'name',
    p_apellidos: 'apellidos',
    p_email: 'email',
    p_phone: 'phone',
    p_dni: 'dni',
    p_metadata: 'metadata',
    // New spec keys (without underscore after p)
    pclienttype: 'client_type',
    pname: 'name',
    papellidos: 'apellidos',
    pemail: 'email',
    pphone: 'phone',
    pdni: 'dni',
    pbusinessname: 'business_name',
    pcifnif: 'cif_nif',
    ptradename: 'trade_name',
    plegalrepresentativename: 'legal_representative_name',
    plegalrepresentativedni: 'legal_representative_dni',
    pmercantileregistrydata: 'mercantile_registry_data'
};

// Security: Sanitize string to prevent XSS and injection
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    // Remove potential XSS/injection characters, trim whitespace
    return str.trim()
        .replace(/[<>\"'`]/g, '') // Remove HTML/script injection chars
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .substring(0, 500); // Max length protection
}

// Security: Validate email format
function isValidEmail(email) {
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    return emailRegex.test(email);
}

serve(async (req) => {
    const origin = req.headers.get('origin') || req.headers.get('Origin') || undefined;
    const headers = corsHeaders(origin);

    // Rate limiting check
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                         req.headers.get('x-real-ip') || 
                         'unknown';
    const rateLimit = checkRateLimit(ip, 100, 60000); // 100 req/min
  
    // Add rate limit headers to response
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
                retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
            }), 
            { status: 429, headers }
        );
    }

    // OPTIONS preflight
    if (req.method === 'OPTIONS') {
        if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
            return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
        }
        return new Response(null, { status: 204, headers });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed', allowed: ['POST','OPTIONS'] }), { status: 405, headers });
    }

    if (!(ALLOW_ALL_ORIGINS || isOriginAllowed(origin))) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers });
    }

    try {
        // Auth: require Bearer token
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            return new Response(JSON.stringify({ error: 'Missing Authorization Bearer token' }), { status: 401, headers });
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
            return new Response(JSON.stringify({ error: 'Email not confirmed. Please verify your email before creating clients.' }), { status: 403, headers });
        }

        // Create a Supabase client with user context (respects RLS) for reads
        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        });

        // Resolve company_id from users table using user context
        let company_id = null;
        try {
            const { data: urows, error: uerr } = await supabaseUser.from('users').select('company_id').eq('auth_user_id', authUserId).limit(1).maybeSingle();
            if (!uerr && urows && urows.company_id) company_id = urows.company_id;
        } catch (e) {
            console.error('[upsert-client] Error resolving company:', e);
        }
        if (!company_id) {
            return new Response(JSON.stringify({ error: 'Unable to determine company for authenticated user' }), { status: 403, headers });
        }

        // Parse body
        const body = await req.json().catch(()=>({}));
        if (!body || typeof body !== 'object') {
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
        }

        // Normalize keys: accept legacy p_* and compact p<field> variants; map to canonical names
        const norm: Record<string, any> = {};
        for (const [inKey, val] of Object.entries(body)) {
            if (!inKey || typeof inKey !== 'string') continue;
            let k = inKey.trim();
            k = k.toLowerCase();
            const spanishMap: Record<string,string> = {
                p_nombre: 'p_name',
                p_apellidos: 'p_apellidos',
                p_email: 'p_email',
                p_telefono: 'p_phone',
                p_dni: 'p_dni',
                p_empresa: 'p_businessname',
                p_cif_nif: 'p_cifnif',
                p_cif: 'p_cifnif',
                p_id: 'p_id',
                p_company_id: 'p_company_id'
            };
            if (spanishMap[k]) k = spanishMap[k];
            if (!k.includes('_') && k.startsWith('p') && k.length > 1) {
                k = 'p_' + k.substring(1);
            }
            if (!k.startsWith('p_') && k !== 'pclienttype') continue;
            if (k === 'p_company_id' || k === 'pcompanyid') continue; // ignore client-provided company id
            norm[k] = val;
        }

        // Security: Input validation and sanitization
        const normalized: Record<string, any> = {};
        for (const [k,v] of Object.entries(norm)) {
            if (v == null) { normalized[k] = v; continue; }
            if (typeof v === 'string') {
                const sanitized = sanitizeString(v);
                if (k === 'p_email') {
                    const emailLower = sanitized.toLowerCase();
                    if (emailLower && !isValidEmail(emailLower)) {
                        return new Response(JSON.stringify({ error: 'Invalid email format' }), { status: 400, headers });
                    }
                    normalized[k] = emailLower;
                } else {
                    normalized[k] = sanitized.toUpperCase();
                }
            } else if (typeof v === 'object' && k === 'p_metadata') {
                try {
                    const meta: any = { ...v };
                    for (const [mk, mv] of Object.entries(meta)) {
                        if (typeof mv === 'string') meta[mk] = sanitizeString(mv as string);
                    }
                    normalized[k] = meta;
                } catch(_) {
                    normalized[k] = v;
                }
            } else {
                normalized[k] = v;
            }
        }

        // Determine client type (default INDIVIDUAL)
        const rawType = (normalized.pclienttype || normalized.p_client_type || 'INDIVIDUAL');
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
            if (!row.dni) row.dni = '99999999X';
        } else if (clientType === 'BUSINESS') {
            if (!row.cif_nif) row.cif_nif = 'B99999999';
        }

        // Validate required per type
        if (clientType === 'BUSINESS') {
            if (!row.business_name || !row.cif_nif || !row.email) {
                return new Response(JSON.stringify({ error: 'Missing required business fields: pbusinessname, pcifnif, pemail' }), { status: 400, headers });
            }
        } else {
            if (!row.name || !row.email) {
                return new Response(JSON.stringify({ error: 'Missing required individual fields: pname (or p_name) and pemail (or p_email)' }), { status: 400, headers });
            }
        }

        // Insert/Update logic (company_id is always derived server-side)
        if (row.id) {
            // Update existing client - ensure it belongs to same company
            const { data: existing, error: existErr } = await supabaseAdmin
                .from('clients')
                .select('company_id,name,apellidos,client_type,dni,business_name,cif_nif')
                .eq('id', row.id)
                .limit(1)
                .maybeSingle();
            if (existErr) {
                console.error('[upsert-client] Error resolving existing client:', existErr);
                return new Response(JSON.stringify({ error: 'DB error resolving existing client', details: existErr.message || existErr }), { status: 500, headers });
            }
            if (!existing) {
                return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers });
            }
            if (existing.company_id !== company_id) {
                return new Response(JSON.stringify({ error: 'Not allowed to modify client from another company' }), { status: 403, headers });
            }

            row.updated_at = new Date().toISOString();
            // Expanded update set: include identification & business fields when provided.
            // Still keep a tight whitelist to avoid accidental schema drift issues.
            const whitelist = [
                'name','email','phone','metadata','apellidos','dni','business_name','cif_nif','trade_name','legal_representative_name','legal_representative_dni','mercantile_registry_data','client_type'
            ];
            const safeUpdate: any = {};
            for (const key of whitelist) {
                if (row[key] !== undefined) safeUpdate[key] = row[key];
            }
            // If name or apellidos changed/arrived, rebuild full display name as `${name} ${apellidos}`
            if ('name' in row || 'apellidos' in row) {
                const fullName = [row.name ?? existing?.name, row.apellidos ?? existing?.apellidos]
                    .filter(Boolean)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toUpperCase();
                if (fullName) safeUpdate.name = fullName;
            }
            // Preserve required identification fields based on client_type
            const typeForUpdate = (row.client_type || existing.client_type || '').toUpperCase();
            if (typeForUpdate === 'BUSINESS') {
                if (!safeUpdate.cif_nif && existing.cif_nif) safeUpdate.cif_nif = existing.cif_nif;
                if (!safeUpdate.business_name && existing.business_name) safeUpdate.business_name = existing.business_name;
            } else { // INDIVIDUAL
                if (!safeUpdate.dni && existing.dni) safeUpdate.dni = existing.dni;
            }
            if (Object.keys(safeUpdate).length === 0) {
                return new Response(JSON.stringify({ error: 'No valid fields to update' }), { status: 400, headers });
            }
            // Normalize client_type to lowercase storage convention used at insert time
            if (safeUpdate.client_type) safeUpdate.client_type = String(safeUpdate.client_type).toLowerCase();
            const { data: updated, error: updateErr } = await supabaseAdmin.from('clients').update(safeUpdate).eq('id', row.id).select().maybeSingle();
            if (updateErr) {
                console.error('[upsert-client] Update error:', updateErr);
                return new Response(JSON.stringify({ error: 'Failed to update client', details: updateErr.message || updateErr }), { status: 500, headers });
            }
            return new Response(JSON.stringify({ ok: true, method: 'update', updated_fields: Object.keys(safeUpdate), client: updated }), { status: 200, headers });
        } else {
            // Create new client (row already has required validated above)
      
            // Security: check for duplicate email within company
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
                return new Response(JSON.stringify({ error: 'DB error checking duplicates', details: dupErr.message || dupErr }), { status: 500, headers });
            }
      
            if (dupCheck) {
                return new Response(JSON.stringify({ error: 'A client with this email already exists in your company' }), { status: 409, headers });
            }
      
            // Insert required identification fields to satisfy check constraint
            // Build full name combining name + apellidos for display in single column
            const fullNameForInsert = [row.name, row.apellidos]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            const toInsertBase: any = {
                company_id,
                name: fullNameForInsert || row.name,
                apellidos: row.apellidos ?? null,
                email: row.email ?? null,
                phone: row.phone ?? null,
                metadata: row.metadata ?? {},
                client_type: clientType.toLowerCase()
            };

            if (clientType === 'INDIVIDUAL') {
                toInsertBase.dni = row.dni ?? '99999999X';
            } else {
                // BUSINESS
                toInsertBase.cif_nif = row.cif_nif ?? 'B99999999';
                toInsertBase.business_name = row.business_name ?? null;
            }
            const { data: inserted, error: insertErr } = await supabaseAdmin.from('clients').insert(toInsertBase).select().maybeSingle();
            if (insertErr) {
                console.error('[upsert-client] Insert error:', insertErr);
                return new Response(JSON.stringify({ error: 'Failed to create client', details: insertErr.message || String(insertErr) }), { status: 500, headers });
            }
            return new Response(JSON.stringify({ ok: true, method: 'create', client: inserted }), { status: 201, headers });
        }

    } catch (e) {
        console.error('[upsert-client] Unexpected error:', e);
        const h = corsHeaders(undefined);
        return new Response(JSON.stringify({ error: 'Internal error', details: String(e) }), { status: 500, headers: h });
    }
});

