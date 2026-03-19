import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";

/**
 * BFF - Public Booking Edge Function
 * Security: API Key, Client-ID, Turnstile, Zod validation, CORS strict
 * Purpose: Handles public booking creation in the DMZ (Public Supabase)
 */

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY');
const BOOKING_API_KEY = Deno.env.get('BOOKING_API_KEY');
const VALID_CLIENT_IDS = ['book-simplifica-web-v1', 'reservas-frontend-v1'];
const DB_URL = Deno.env.get('PUBLIC_DB_URL'); // postgres://booking_writer:pass@host:5432/postgres

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') || '';
    const allowedOrigins = ['https://reservas.simplificacrm.es'];
    const isAllowed = allowedOrigins.includes(origin) || origin.startsWith('http://localhost:');

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-client-id',
        'Access-Control-Max-Age': '86400',
    };
}

async function verifyTurnstile(token: string, ip: string) {
    if (!token) return { success: false, error: 'Token missing' };
    
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${TURNSTILE_SECRET}&response=${token}&remoteip=${ip}`,
    });

    const outcome = await response.json();
    return outcome;
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Rate limiting: 30 req/min per IP (public booking endpoint)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const rateLimit = checkRateLimit(`booking:${ip}`, 30, 60000);
    if (!rateLimit.allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
            status: 429,
            headers: { ...corsHeaders, ...getRateLimitHeaders(rateLimit) },
        });
    }

    try {
        // 1. BFF Security Checks
        const apiKey = req.headers.get('x-api-key');
        const clientId = req.headers.get('x-client-id');

        if (!apiKey || apiKey !== BOOKING_API_KEY) {
            return new Response(JSON.stringify({ error: 'Unauthorized (key)' }), { status: 401, headers: corsHeaders });
        }
        if (!clientId || !VALID_CLIENT_IDS.includes(clientId)) {
            return new Response(JSON.stringify({ error: 'Unauthorized (client)' }), { status: 403, headers: corsHeaders });
        }

        console.log(`[booking-public] ${req.method} request received`);

        const url = new URL(req.url);

        // --- GET SERVICES: Proxy to private backend ---
        if (req.method === 'GET' && (url.pathname.endsWith('/services') || url.pathname.includes('/services'))) {
            const rawSlug = url.searchParams.get('slug');
            const slug = rawSlug?.toLowerCase().trim() ?? '';

            if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
                return new Response(JSON.stringify({ error: 'Valid slug required' }), { status: 400, headers: corsHeaders });
            }

            // Connect to the PRIVATE Supabase project (secured backend)
            const privateSupabase = createClient(
                Deno.env.get('PRIVATE_SUPABASE_URL') ?? '',
                Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            // 1. Resolve company by slug (include branding fields)
            const { data: company, error: companyError } = await privateSupabase
                .from('companies')
                .select('id, name, logo_url, settings')
                .eq('slug', slug)
                .eq('is_active', true)
                .maybeSingle();

            if (companyError) throw companyError;
            if (!company) {
                return new Response(JSON.stringify({ error: 'Company not found' }), { status: 404, headers: corsHeaders });
            }

            // 2. Fetch bookable services with their professionals
            const { data: services, error: servicesError } = await privateSupabase
                .from('services')
                .select(`
                    id,
                    name,
                    duration_minutes,
                    base_price,
                    booking_color,
                    professional_services (
                        professionals ( id, display_name )
                    )
                `)
                .eq('company_id', company.id)
                .eq('is_bookable', true)
                .eq('is_active', true);

            if (servicesError) throw servicesError;

            // 3. Sanitize response — expose only what the public frontend needs
            const sanitized = (services || []).map((s: any) => ({
                id: s.id,
                name: s.name,
                duration_minutes: s.duration_minutes,
                price: s.base_price,
                color: s.booking_color,
                professionals: (s.professional_services || [])
                    .map((ps: any) => ps.professionals)
                    .filter(Boolean)
                    .map((p: any) => ({ id: p.id, name: p.display_name })),
            }));

            // 4. Extract branding from settings JSONB
            const branding = company.settings?.branding || {};
            const enabledFilters = company.settings?.enabled_filters || ['services', 'professionals', 'duration'];
            
            const companyData = {
                name: company.name,
                logo_url: company.logo_url || null,
                primary_color: branding.primary_color || '#10B981',
                secondary_color: branding.secondary_color || '#3B82F6',
                enabled_filters: enabledFilters,
            };

            return new Response(JSON.stringify({ company: companyData, services: sanitized }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        // ---------------------------------

        // Skip payload reading for GET requests
        if (req.method === 'GET') {
            return new Response(JSON.stringify({ error: 'Method not allowed for JSON payload' }), { status: 405, headers: corsHeaders });
        }

        const payload = await req.json();
        const { action, turnstile_token, ...data } = payload;

        // 2. Bot/Spam Check (Turnstile)
        const ip = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || '';
        const turnstile = await verifyTurnstile(turnstile_token, ip);
        if (!turnstile.success) {
            return new Response(JSON.stringify({ error: 'Bot protection failed', details: turnstile['error-codes'] }), { status: 400, headers: corsHeaders });
        }

        // 3. Simple Zod-like validation (Simplified for brevity)
        if (action === 'create-booking') {
            const { company_slug, booking_type_id, client_name, client_email, requested_date, requested_time } = data;
            
            if (!company_slug || !booking_type_id || !client_email || !requested_date || !requested_time) {
                throw new Error('Missing required fields');
            }

            // 4. Persistence via Supabase (using service_role for now, but configured specifically for public project)
            // Note: In a real environment, you'd use a postgres driver with the booking_writer role
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            // Check if slot is taken (basic check)
            const { data: existing } = await supabase
                .from('public_bookings')
                .select('id')
                .match({
                    company_slug,
                    requested_date,
                    requested_time,
                    status: 'pending' // or confirmed
                })
                .maybeSingle();

            if (existing) {
                return new Response(JSON.stringify({ error: 'Slot already taken' }), { status: 409, headers: corsHeaders });
            }

            const { error: insertError } = await supabase.from('public_bookings').insert({
                company_slug,
                booking_type_id,
                client_name,
                client_email,
                client_phone: data.client_phone,
                requested_date,
                requested_time,
                turnstile_verified: true,
                ip_address: ip
            });

            if (insertError) throw insertError;

            return new Response(JSON.stringify({ success: true, message: 'Booking pending sync' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ error: 'Invalid action', method: req.method, url: req.url }), { status: 400, headers: corsHeaders });

    } catch (error: any) {
        console.error('BFF Error:', error.message);
        // Never leak internal error details or stack traces to public clients
        return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
