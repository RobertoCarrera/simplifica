import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * BFF - Public Booking Edge Function
 *
 * Routes:
 *   GET  /services?slug=...
 *   GET  /services/:id
 *   GET  /professionals/:id
 *   GET  /availability?slug=...&week_start=YYYY-MM-DD[&professional_id=...]
 *   POST /create-booking  { slug, service_id, professional_id, client_name,
 *                           client_email, client_phone, datetime, turnstile_token }
 *
 * Security: API Key, Client-ID allowlist, Turnstile, CORS strict, rate limit
 */

// ── Config ────────────────────────────────────────────────────────────────────

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY');
const BOOKING_API_KEY = Deno.env.get('BOOKING_API_KEY');

const VALID_CLIENT_IDS = [
    'simplifica-agenda-frontend', // Angular agenda frontend (primary)
    'book-simplifica-web-v1',     // Legacy vanilla JS
    'reservas-frontend-v1',       // Legacy reservas
];

// ── Rate limiting (in-memory — resets on cold start) ─────────────────────────
// For distributed rate limiting migrate to Deno KV (Supabase Edge KV store).
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per minute per IP

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
        return true;
    }
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
    return true;
}

// ── CORS ──────────────────────────────────────────────────────────────────────

function getAllowedOrigins(): string[] {
    const base = [
        'https://reservas.simplificacrm.es',
        'https://agenda.simplificacrm.es',
    ];
    // Set ALLOWED_ORIGINS env var (comma-separated) to add custom domains at deploy time
    const extra = Deno.env.get('ALLOWED_ORIGINS') ?? '';
    if (extra) base.push(...extra.split(',').map((s) => s.trim()).filter(Boolean));
    return base;
}

function getCorsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = getAllowedOrigins();
    const isAllowed = allowed.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin);
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':
            'authorization, x-client-info, apikey, content-type, x-api-key, x-client-id',
        'Access-Control-Max-Age': '86400',
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200, cors: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });
}

function privateClient() {
    const url = Deno.env.get('PRIVATE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    return createClient(url, key, { auth: { persistSession: false } });
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
    if (!token || !TURNSTILE_SECRET) return false;
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip)}`,
    });
    const out = await res.json();
    return out.success === true;
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9-]+$/;

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleGetServices(
    url: URL,
    db: ReturnType<typeof privateClient>,
    cors: Record<string, string>,
): Promise<Response> {
    const slug = url.searchParams.get('slug')?.toLowerCase().trim() ?? '';
    if (!slug || !SLUG_RE.test(slug)) return json({ error: 'Valid slug required' }, 400, cors);

    const { data: company, error: ce } = await db
        .from('companies')
        .select('id, name, logo_url, settings')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
    if (ce) throw ce;
    if (!company) return json({ error: 'Company not found' }, 404, cors);

    const { data: services, error: se } = await db
        .from('services')
        .select(`id, name, description, duration_minutes, base_price, booking_color,
            professional_services ( professionals ( id, display_name, avatar_url, is_active, is_public ) )`)
        .eq('company_id', (company as any).id)
        .eq('is_bookable', true)
        .eq('is_public', true)
        .eq('is_active', true);
    if (se) throw se;

    const { data: professionals, error: pe } = await db
        .from('professionals')
        .select('id, display_name, title, bio, avatar_url, slug')
        .eq('company_id', (company as any).id)
        .eq('is_active', true)
        .eq('is_public', true);
    if (pe) throw pe;

    // Resolve enabled filters from company_filter_visibility table.
    // Defaults to all three visible when no rows exist.
    // BFF uses service_role, so RLS doesn't apply.
    let enabledFilters: string[] = ['services', 'professionals', 'duration'];
    try {
        const { data: visibility, error: visErr } = await db
            .from('company_filter_visibility')
            .select('filter_id, visible')
            .eq('company_id', (company as any).id);
        if (visErr) {
            console.error('[booking-public] filter_visibility query failed:', visErr);
        } else if (visibility && visibility.length > 0) {
            enabledFilters = visibility
                .filter((v: any) => v.visible === true)
                .map((v: any) => v.filter_id);
        }
    } catch (visCatch) {
        console.error('[booking-public] filter_visibility unexpected error:', visCatch);
    }

    const branding = (company as any).settings?.branding ?? {};
    return json({
        company: {
            name: (company as any).name,
            logo_url: (company as any).logo_url ?? null,
            primary_color: branding.primary_color ?? '#10B981',
            secondary_color: branding.secondary_color ?? null,
            enabled_filters: enabledFilters,
        },
        services: (services ?? []).map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? null,
            duration_minutes: s.duration_minutes,
            price: s.base_price,
            color: s.booking_color,
            professionals: (s.professional_services ?? [])
                .map((ps: any) => ps.professionals)
                .filter((p: any) => p?.id && p?.display_name && p.is_active !== false && p.is_public !== false)
                .map((p: any) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url ?? null })),
        })),
        professionals: (professionals ?? []).map((p: any) => ({
            id: p.id,
            display_name: p.display_name,
            title: p.title ?? null,
            bio: p.bio ?? null,
            avatar_url: p.avatar_url ?? null,
            slug: p.slug ?? null,
        })),
    }, 200, cors);
}

async function handleGetServiceById(
    id: string,
    db: ReturnType<typeof privateClient>,
    cors: Record<string, string>,
): Promise<Response> {
    if (!UUID_RE.test(id)) return json({ error: 'Invalid service ID' }, 400, cors);

    const { data, error } = await db
        .from('services')
        .select(`id, name, description, duration_minutes, base_price, booking_color,
            companies ( name, logo_url, settings ),
            professional_services ( professionals ( id, display_name, avatar_url ) )`)
        .eq('id', id)
        .eq('is_active', true)
        .eq('is_bookable', true)
        .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'Service not found' }, 404, cors);

    const company = (data as any).companies ?? {};
    const branding = company.settings?.branding ?? {};
    return json({
        id: (data as any).id,
        name: (data as any).name,
        description: (data as any).description ?? null,
        duration_minutes: (data as any).duration_minutes,
        price: (data as any).base_price,
        color: (data as any).booking_color,
        company: {
            name: company.name ?? null,
            logo_url: company.logo_url ?? null,
            primary_color: branding.primary_color ?? '#10B981',
            secondary_color: branding.secondary_color ?? null,
        },
        professionals: ((data as any).professional_services ?? [])
            .map((ps: any) => ps.professionals)
            .filter((p: any) => p?.id && p?.display_name)
            .map((p: any) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url ?? null })),
    }, 200, cors);
}

async function handleGetProfessionalById(
    id: string,
    db: ReturnType<typeof privateClient>,
    cors: Record<string, string>,
): Promise<Response> {
    if (!UUID_RE.test(id)) return json({ error: 'Invalid professional ID' }, 400, cors);

    const { data, error } = await db
        .from('professionals')
        .select(`id, display_name, title, bio, avatar_url,
            professional_services ( services ( id, name, duration_minutes, base_price, booking_color ) )`)
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: 'Professional not found' }, 404, cors);

    return json({
        id: (data as any).id,
        display_name: (data as any).display_name,
        title: (data as any).title ?? null,
        bio: (data as any).bio ?? null,
        avatar_url: (data as any).avatar_url ?? null,
        services: ((data as any).professional_services ?? [])
            .map((ps: any) => ps.services)
            .filter(Boolean)
            .map((s: any) => ({
                id: s.id,
                name: s.name,
                duration_minutes: s.duration_minutes,
                price: s.base_price,
                color: s.booking_color,
            })),
    }, 200, cors);
}

async function handleGetAvailability(
    url: URL,
    db: ReturnType<typeof privateClient>,
    cors: Record<string, string>,
): Promise<Response> {
    const slug = url.searchParams.get('slug')?.toLowerCase().trim() ?? '';
    const weekStart = url.searchParams.get('week_start') ?? '';
    const profesionalId = url.searchParams.get('professional_id') ?? url.searchParams.get('profesional_id') ?? null;
    const serviceId = url.searchParams.get('service_id') ?? null;

    if (!slug || !SLUG_RE.test(slug)) return json({ error: 'Valid slug required' }, 400, cors);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: 'week_start must be YYYY-MM-DD' }, 400, cors);
    if (profesionalId && !UUID_RE.test(profesionalId)) return json({ error: 'Invalid professional_id' }, 400, cors);
    if (serviceId && !UUID_RE.test(serviceId)) return json({ error: 'Invalid service_id' }, 400, cors);

    let query = db
        .from('bookings')
        .select('start_time, end_time, professional_id, service_id')
        .gte('start_time', weekStart)
        .lt('start_time', addDays(weekStart, 7))
        .in('status', ['pending', 'confirmed']);

    if (serviceId) {
        query = query.eq('service_id', serviceId);
    }

    // Resolve the company up-front so we can also fetch the schedule.
    const { data: company } = await db
        .from('companies')
        .select('id')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
    if (!company) return json({ error: 'Company not found' }, 404, cors);

    if (profesionalId) {
        query = query.eq('professional_id', profesionalId);
    } else {
        const { data: profs } = await db
            .from('professionals')
            .select('id')
            .eq('company_id', (company as any).id)
            .eq('is_active', true)
            .eq('is_public', true);
        const ids = (profs ?? []).map((p: any) => p.id);
        if (ids.length > 0) query = query.in('professional_id', ids);
    }

    const { data: bookings, error } = await query;
    if (error) throw error;

    // Fetch the working schedule for the active+public profesionales of this
    // company. When the request includes a `profesionalId`, scope to that
    // professional so the payload is smaller and the frontend can't pick up
    // another professional's window. The frontend uses this to draw day-by-day
    // availability and show Saturday only when the profesional works.
    let scheduleData: any[] = [];
    try {
        let schedQ = db
            .from('professional_schedules')
            .select('professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active');
        if (profesionalId) schedQ = schedQ.eq('professional_id', profesionalId);
        const res = await schedQ;
        if (res.error) {
            console.error('[booking-public] schedule query error:', res.error);
        } else {
            scheduleData = (res.data ?? []).filter((s: any) => s.is_active !== false);
        }
    } catch (schedErr) {
        console.error('[booking-public] schedule unexpected error:', schedErr);
    }

    // Professional blocked dates (vacations, days off, etc).
    // Scoped to the company for performance. Date range overlap with the week.
    const weekEnd = addDays(weekStart, 7); // exclusive
    let profBlocks: any[] = [];
    try {
        let q = db
            .from('professional_blocked_dates')
            .select('professional_id, start_date, end_date, all_day, start_time, end_time')
            .eq('company_id', (company as any).id)
            .lte('start_date', weekEnd)
            .gte('end_date', weekStart);
        if (profesionalId) q = q.eq('professional_id', profesionalId);
        const { data, error } = await q;
        if (error) {
            console.error('[booking-public] prof_blocked_dates query error:', error);
        } else {
            profBlocks = data ?? [];
        }
    } catch (e) {
        console.error('[booking-public] prof_blocked_dates unexpected error:', e);
    }

    // Service blocked dates (a specific service is unavailable for a range).
    // Scoped to the company.
    let svcBlocks: any[] = [];
    try {
        let q = db
            .from('service_blocked_dates')
            .select('service_id, start_date, end_date, all_day, start_time, end_time')
            .eq('company_id', (company as any).id)
            .lte('start_date', weekEnd)
            .gte('end_date', weekStart);
        if (serviceId) q = q.eq('service_id', serviceId);
        const { data, error } = await q;
        if (error) {
            console.error('[booking-public] svc_blocked_dates query error:', error);
        } else {
            svcBlocks = data ?? [];
        }
    } catch (e) {
        console.error('[booking-public] svc_blocked_dates unexpected error:', e);
    }

    // Resource busy periods (non-booking busy slots, e.g. maintenance).
    // No dedicated table yet — schema lookup confirmed only professional_blocked_dates
    // and service_blocked_dates exist. Returning empty array for forward-compat.
    const resource_busy_periods: any[] = [];

    return json({
        busy_periods: (bookings ?? []).map((b: any) => ({
            start: b.start_time,
            end: b.end_time,
        })),
        schedule: (scheduleData ?? []).map((s: any) => ({
            professional_id: s.professional_id,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            break_start: s.break_start,
            break_end: s.break_end,
        })),
        professional_blocked_dates: profBlocks.map((b: any) => ({
            professional_id: b.professional_id,
            start_date: b.start_date,
            end_date: b.end_date,
            all_day: b.all_day,
            start_time: b.start_time,
            end_time: b.end_time,
        })),
        service_blocked_dates: svcBlocks.map((b: any) => ({
            service_id: b.service_id,
            start_date: b.start_date,
            end_date: b.end_date,
            all_day: b.all_day,
            start_time: b.start_time,
            end_time: b.end_time,
        })),
        resource_busy_periods,
    }, 200, cors);
}

async function handleCreateBooking(
    req: Request,
    ip: string,
    db: ReturnType<typeof privateClient>,
    cors: Record<string, string>,
): Promise<Response> {
    const body = await req.json();
    const { slug, service_id, professional_id, client_name, client_email, client_phone, datetime, turnstile_token } = body;

    // Required field validation
    if (!slug || !service_id || !client_name || !client_email || !datetime) {
        return json({ error: 'Missing required fields: slug, service_id, client_name, client_email, datetime' }, 400, cors);
    }
    if (!SLUG_RE.test(String(slug).toLowerCase())) return json({ error: 'Invalid slug' }, 400, cors);
    if (!UUID_RE.test(String(service_id))) return json({ error: 'Invalid service_id' }, 400, cors);
    if (professional_id && !UUID_RE.test(String(professional_id))) return json({ error: 'Invalid professional_id' }, 400, cors);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(client_email))) return json({ error: 'Invalid email' }, 400, cors);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(datetime))) return json({ error: 'datetime must be ISO 8601' }, 400, cors);

    // Datetime must be in the future
    const slotStart = new Date(datetime);
    if (isNaN(slotStart.getTime())) return json({ error: 'Invalid datetime' }, 400, cors);
    if (slotStart.getTime() < Date.now() - 60_000) {
        return json({ error: 'Cannot book a slot in the past' }, 400, cors);
    }

    const safeName = String(client_name).trim().slice(0, 100);
    const safeEmail = String(client_email).trim().toLowerCase().slice(0, 254);
    const safePhone = String(client_phone ?? '').trim().slice(0, 20) || null;

    // Turnstile verification
    if (!await verifyTurnstile(String(turnstile_token ?? ''), ip)) {
        return json({ error: 'Bot protection check failed' }, 400, cors);
    }

    // Resolve company
    const { data: company } = await db
        .from('companies')
        .select('id')
        .eq('slug', String(slug).toLowerCase().trim())
        .eq('is_active', true)
        .maybeSingle();
    if (!company) return json({ error: 'Company not found' }, 404, cors);
    const companyId = (company as any).id;

    // Validate the service belongs to this company AND is bookable+public+active.
    // Reject early if the service does not exist or is not bookable.
    const { data: svc } = await db
        .from('services')
        .select('id, duration_minutes, name')
        .eq('id', service_id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('is_bookable', true)
        .eq('is_public', true)
        .maybeSingle();
    if (!svc) return json({ error: 'Service not available' }, 404, cors);

    // If a professional is specified, it must belong to this company, be active+public,
    // AND offer the requested service (via professional_services).
    let profDefaultResource: string | null = null;
    if (professional_id) {
        const { data: prof } = await db
            .from('professionals')
            .select('id, default_resource_id')
            .eq('id', professional_id)
            .eq('company_id', companyId)
            .eq('is_active', true)
            .eq('is_public', true)
            .maybeSingle();
        if (!prof) return json({ error: 'Professional not available' }, 404, cors);
        profDefaultResource = (prof as any).default_resource_id ?? null;

        const { data: link } = await db
            .from('professional_services')
            .select('professional_id, service_id')
            .eq('professional_id', professional_id)
            .eq('service_id', service_id)
            .maybeSingle();
        if (!link) return json({ error: 'Professional does not offer this service' }, 400, cors);
    }

    // Compute slot end from the validated service duration
    const slotEnd = new Date(slotStart.getTime() + (svc as any).duration_minutes * 60_000);

    // Check the day is not blocked for the professional (if specified) or for the service.
    const dayStr = datetime.slice(0, 10); // YYYY-MM-DD
    if (professional_id) {
        const { data: profBlock } = await db
            .from('professional_blocked_dates')
            .select('id, all_day, start_time, end_time')
            .eq('professional_id', professional_id)
            .lte('start_date', dayStr)
            .gte('end_date', dayStr)
            .maybeSingle();
        if (profBlock) {
            if ((profBlock as any).all_day) return json({ error: 'Day is blocked for this professional' }, 409, cors);
            // Time-of-day block: if the requested slot overlaps the block window
            const blockStart = (profBlock as any).start_time;
            const blockEnd = (profBlock as any).end_time;
            if (blockStart && blockEnd) {
                const t = datetime.slice(11, 19); // HH:MM:SS
                if (t >= blockStart && t < blockEnd) {
                    return json({ error: 'Time slot is blocked for this professional' }, 409, cors);
                }
            }
        }
    }
    const { data: svcBlock } = await db
        .from('service_blocked_dates')
        .select('id, all_day, start_time, end_time')
        .eq('service_id', service_id)
        .lte('start_date', dayStr)
        .gte('end_date', dayStr)
        .maybeSingle();
    if (svcBlock) {
        if ((svcBlock as any).all_day) return json({ error: 'Service is not available on this day' }, 409, cors);
        const blockStart = (svcBlock as any).start_time;
        const blockEnd = (svcBlock as any).end_time;
        if (blockStart && blockEnd) {
            const t = datetime.slice(11, 19);
            if (t >= blockStart && t < blockEnd) {
                return json({ error: 'Time slot is not available for this service' }, 409, cors);
            }
        }
    }

    // Professional-level conflict check (the slot may be blocked for THIS prof
    // even if a resource happens to be free).
    let profConflictQuery = db
        .from('bookings')
        .select('id')
        .lt('start_time', slotEnd.toISOString())
        .gt('end_time', datetime)
        .in('status', ['pending', 'confirmed']);
    if (professional_id) profConflictQuery = profConflictQuery.eq('professional_id', professional_id);
    const { data: profConflict } = await profConflictQuery.maybeSingle();
    if (profConflict) return json({ error: 'Time slot not available' }, 409, cors);

    // Resource assignment. Strategy:
    //   1. If the professional has `default_resource_id` set, use it.
    //   2. Otherwise, list active resources for the company and pick the FIRST one
    //      that has NO overlapping booking in [datetime, slotEnd).
    //   3. If none free, return 409 — the slot is genuinely full.
    // The DB-level `bookings_no_resource_overlap` EXCLUDE constraint guarantees
    // atomic no-overlap even under concurrent requests, so the chosen resource_id
    // cannot be claimed by another booking at the same time.
    let resourceId: string | null = null;
    if (profDefaultResource) {
        // Verify the default resource is still free at this slot (defensive).
        const { data: defaultBusy } = await db
            .from('bookings')
            .select('id')
            .eq('resource_id', profDefaultResource)
            .lt('start_time', slotEnd.toISOString())
            .gt('end_time', datetime)
            .in('status', ['pending', 'confirmed'])
            .maybeSingle();
        if (!defaultBusy) {
            resourceId = profDefaultResource;
        }
    }
    if (!resourceId) {
        // List the company's active resources ordered by `order_position` then name
        // for stable assignment (NOT round-robin, NOT random — first free wins).
        const { data: resources, error: resErr } = await db
            .from('resources')
            .select('id, name, capacity')
            .eq('company_id', companyId)
            .eq('is_active', true)
            .order('order_position', { ascending: true })
            .order('name', { ascending: true });
        if (resErr) throw resErr;

        if (!resources || resources.length === 0) {
            return json({ error: 'No resources configured for this company' }, 409, cors);
        }

        // Find resources that are NOT occupied during the slot. For each candidate,
        // count active bookings that overlap [datetime, slotEnd). If count < capacity,
        // the resource is free. (Capacity 1 = exclusive; capacity > 1 = chairs.)
        for (const r of resources as any[]) {
            const cap = typeof r.capacity === 'number' && r.capacity > 0 ? r.capacity : 1;
            const { count, error: cntErr } = await db
                .from('bookings')
                .select('id', { count: 'exact', head: true })
                .eq('resource_id', r.id)
                .lt('start_time', slotEnd.toISOString())
                .gt('end_time', datetime)
                .in('status', ['pending', 'confirmed']);
            if (cntErr) throw cntErr;
            if ((count ?? 0) < cap) {
                resourceId = r.id;
                break;
            }
        }
    }
    if (!resourceId) {
        return json({ error: 'No resources available at this time' }, 409, cors);
    }

    // Insert with the assigned resource. The DB EXCLUDE constraint will reject
    // any concurrent attempt to claim the same resource+time window, so a 23P01
    // error here means we lost the race — surface that as 409.
    const { data: booking, error: insertError } = await db
        .from('bookings')
        .insert({
            company_id: companyId,
            service_id,
            professional_id: professional_id || null,
            resource_id: resourceId,
            customer_name: safeName,
            customer_email: safeEmail,
            customer_phone: safePhone,
            start_time: datetime,
            end_time: slotEnd.toISOString(),
            status: 'pending',
            source: 'online',
        })
        .select('id')
        .single();
    if (insertError) {
        // 23P01 = exclusion_violation, 23505 = unique_violation
        if (insertError.code === '23P01' || insertError.code === '23505') {
            return json({ error: 'Resource was just booked by another request. Please try another slot.' }, 409, cors);
        }
        throw insertError;
    }

    return json({ success: true, booking_id: (booking as any).id, resource_id: resourceId }, 201, cors);
}

// ── Main router ───────────────────────────────────────────────────────────────

serve(async (req) => {
    const cors = getCorsHeaders(req);

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? '0.0.0.0';

    if (!checkRateLimit(ip)) return json({ error: 'Too many requests' }, 429, cors);

    // Auth
    const apiKey = req.headers.get('x-api-key');
    const clientId = req.headers.get('x-client-id');
    if (!apiKey || apiKey !== BOOKING_API_KEY) return json({ error: 'Unauthorized' }, 401, cors);
    if (!clientId || !VALID_CLIENT_IDS.includes(clientId)) return json({ error: 'Forbidden' }, 403, cors);

    const url = new URL(req.url);
    // Strip Supabase function prefix: /functions/v1/booking-public/...
    const parts = url.pathname.replace(/.*\/booking-public\/?/, '').split('/').filter(Boolean);
    // parts[0] = 'services'|'availability'|'create-booking'|'professionals'
    // parts[1] = optional UUID (route param)

    try {
        const db = privateClient();

        if (req.method === 'GET' && parts[0] === 'services' && parts[1]) {
            return await handleGetServiceById(parts[1], db, cors);
        }
        if (req.method === 'GET' && parts[0] === 'services') {
            return await handleGetServices(url, db, cors);
        }
        if (req.method === 'GET' && parts[0] === 'professionals' && parts[1]) {
            return await handleGetProfessionalById(parts[1], db, cors);
        }
        if (req.method === 'GET' && parts[0] === 'availability') {
            return await handleGetAvailability(url, db, cors);
        }
        if (req.method === 'POST' && parts[0] === 'create-booking') {
            return await handleCreateBooking(req, ip, db, cors);
        }

        return json({ error: 'Not found' }, 404, cors);

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('BFF Error:', msg);
        // NEVER expose stack traces or internal details to clients
        return json({ error: 'Internal server error' }, 500, cors);
    }
});
