import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt, isEncrypted } from '../_shared/crypto-utils.ts';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { withSecurityHeaders, sanitizeText } from '../_shared/security.ts';
import { BookingSchema } from '../_shared/validation.ts';

/**
 * BFF - Public Booking Edge Function
 * Security: API Key, Client-ID, Turnstile, Zod validation, CORS strict
 * Purpose: Handles public booking creation in the DMZ (Public Supabase)
 * Post-booking pipeline: sync → notification → calendar → email
 *
 * CSRF EXEMPT: This is an unauthenticated public endpoint. CSRF protection
 * is not applicable because there is no user session to hijack. Security
 * is enforced instead by: BOOKING_API_KEY (API key), x-client-id allowlist,
 * and Cloudflare Turnstile bot protection.
 */

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY');
const BOOKING_API_KEY = Deno.env.get('BOOKING_API_KEY');
const VALID_CLIENT_IDS = ['book-simplifica-web-v1', 'reservas-frontend-v1', 'simplifica-agenda-frontend'];
const DB_URL = Deno.env.get('PUBLIC_DB_URL');
// Local dev detection: production always uses https; local Docker uses http://kong:8000
const IS_LOCAL_DEV = !(Deno.env.get('SUPABASE_URL') || '').startsWith('https://');
const ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

// In production, PRIVATE_* vars are not needed (same project). Locally, they point to the remote project.
const PUBLIC_SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const PUBLIC_SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PRIVATE_SUPABASE_URL = Deno.env.get('PRIVATE_SUPABASE_URL') || PUBLIC_SUPABASE_URL;
const PRIVATE_SUPABASE_KEY =
  Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE_KEY') || PUBLIC_SUPABASE_KEY;

/**
 * Convert a Europe/Madrid local date+time (e.g. "2026-03-19" + "12:00") to the
 * correct UTC Date, handling DST automatically via Intl.
 * Deno parses "YYYY-MM-DDTHH:MM" as UTC, so we must adjust manually.
 */
function madridToUTC(dateStr: string, timeStr: string): Date {
  // Treat input as UTC first (naïve reference)
  const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`);
  // What does Europe/Madrid's calendar show for that UTC instant?
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = Object.fromEntries(
    formatter
      .formatToParts(naiveUTC)
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  const h = p.hour === '24' ? '00' : p.hour;
  // Re-interpret what Madrid shows as if it were UTC → gives the Madrid clock reading in epoch
  const madridEpoch = new Date(
    `${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}Z`,
  ).getTime();
  // Madrid offset at this instant (positive = UTC+N)
  const offsetMs = madridEpoch - naiveUTC.getTime();
  // True UTC = input local − offset
  return new Date(naiveUTC.getTime() - offsetMs);
}

/** Add N minutes to a HH:MM string, returns a HH:MM string (no date rollover needed for business hours) */
function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return (
    String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
  );
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigins = [
    'https://portal.simplificacrm.es',
    'https://agenda.simplificacrm.es',
    'https://simplificacrm.es',
  ];
  const isAllowed = allowedOrigins.includes(origin) || origin.startsWith('http://localhost:');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-api-key, x-client-id',
    'Access-Control-Max-Age': '86400',
  };
}

async function verifyTurnstile(token: string, ip: string) {
  if (!token) return { success: false, error: 'Token missing' };
  // Dev bypass: no Turnstile secret configured, or running on local Supabase
  if (!TURNSTILE_SECRET || IS_LOCAL_DEV) return { success: true };

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
    return new Response('ok', { headers: withSecurityHeaders(corsHeaders) });
  }

  // Rate limiting: 30 req/min per IP (public booking endpoint)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const rateLimit = await checkRateLimit(`booking:${ip}`, 30, 60000);
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

    // Only enforce API key when it's configured (production). In local dev it's not set.
    if (BOOKING_API_KEY && (!apiKey || apiKey !== BOOKING_API_KEY)) {
      console.error('Auth Failure. Invalid or missing x-api-key header.');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    if (!BOOKING_API_KEY) {
      console.warn('⚠ BOOKING_API_KEY not set — running in dev/unprotected mode');
    }
    if (!clientId || !VALID_CLIENT_IDS.includes(clientId)) {
      return new Response(JSON.stringify({ error: 'Unauthorized (client)' }), {
        status: 403,
        headers: corsHeaders,
      });
    }



    const url = new URL(req.url);

    // --- GET SERVICES: Proxy to private backend ---
    if (
      req.method === 'GET' &&
      (url.pathname.endsWith('/services') || url.pathname.includes('/services'))
    ) {
      const rawSlug = url.searchParams.get('slug');
      const slug = rawSlug?.toLowerCase().trim() ?? '';

      if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        return new Response(JSON.stringify({ error: 'Valid slug required' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Connect to the PRIVATE Supabase project (secured backend)
      const privateSupabase = createClient(PRIVATE_SUPABASE_URL, PRIVATE_SUPABASE_KEY);

      // 1. Resolve company by slug (include branding + portal_features fields)
      const { data: company, error: companyError } = await privateSupabase
        .from('companies')
        .select('id, name, logo_url, settings, portal_features')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (companyError) throw companyError;
      if (!company) {
        return new Response(JSON.stringify({ error: 'Company not found' }), {
          status: 404,
          headers: corsHeaders,
        });
      }

      // 2. Fetch bookable services with their professionals AND ALL their variants.
      //    We do NOT filter variants at the query level because Supabase JS would
      //    turn the filter into an INNER JOIN, dropping every service without
      //    variants. We filter (is_active, is_hidden) in the sanitization step
      //    below so services with no variants still come through.
      const { data: services, error: servicesError } = await privateSupabase
        .from('services')
        .select(
          `
                    id,
                    name,
                    duration_minutes,
                    base_price,
                    booking_color,
                    professional_services (
                        professionals ( id, display_name, slug )
                    ),
                    service_variants (
                        id,
                        variant_name,
                        pricing,
                        display_config,
                        sort_order,
                        is_active,
                        is_hidden
                    )
                `,
        )
        .eq('company_id', company.id)
        .eq('is_public', true)
        .eq('is_bookable', true)
        .eq('is_active', true)
        .order('sort_order', { foreignTable: 'service_variants', ascending: true });

      if (servicesError) throw servicesError;

      // 3. Fetch professionals for this company (with slug for deep-link support)
      const { data: professionals, error: profError } = await privateSupabase
        .from('professionals')
        .select('id, display_name, title, bio, avatar_url, slug')
        .eq('company_id', company.id)
        .eq('is_active', true);

      if (profError) throw profError;

      // 4. Sanitize response — expose only what the public frontend needs
      //    Filter out inactive professionals (is_active=false) and hidden/inactive
      //    variants from the nested joins — they would otherwise leak into the
      //    Agenda because the Supabase nested-select syntax can't filter joined
      //    rows by is_active/is_hidden without turning it into an INNER JOIN that
      //    drops the whole service when it has zero matching variants.
      const sanitized = (services || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        duration_minutes: s.duration_minutes,
        price: s.base_price,
        color: s.booking_color,
        professionals: (s.professional_services || [])
          .map((ps: any) => ps.professionals)
          .filter((p: any) => p && p.is_active !== false)
          .map((p: any) => ({ id: p.id, display_name: p.display_name, slug: p.slug || null })),
        variants: (s.service_variants || [])
          .filter((v: any) => v.is_active !== false && v.is_hidden !== true)
          .map((v: any) => ({
            id: v.id,
            name: v.variant_name,
            pricing: v.pricing || [],
            display_config: v.display_config || null,
          })),
      }));

      // 5. Extract branding from settings JSONB
      const branding = company.settings?.branding || {};

      // 6. Resolve enabled filters from company_filter_visibility table.
      //    Default: visible=true when no row exists (backfill in seed_company_filter_visibility).
      //    The BFF queries the private CRM DB with service_role, so RLS doesn't apply here.
      let enabledFilters: string[] = ['services', 'professionals', 'duration'];
      try {
        const { data: visibility, error: visError } = await privateSupabase
          .from('company_filter_visibility')
          .select('filter_id, visible')
          .eq('company_id', company.id);

        if (visError) {
          console.error('[booking-public] filter_visibility query failed, falling back to defaults:', visError);
        } else if (visibility && visibility.length > 0) {
          enabledFilters = visibility
            .filter((v: any) => v.visible === true)
            .map((v: any) => v.filter_id);
        }
        // If visibility is an empty array, the company has explicitly hidden
        // ALL filters — return empty so the portal hides the tabs entirely.
      } catch (visErr) {
        console.error('[booking-public] filter_visibility unexpected error:', visErr);
      }

      const companyData = {
        name: company.name,
        logo_url: company.logo_url || null,
        primary_color: branding.primary_color || '#10B981',
        secondary_color: branding.secondary_color || '#3B82F6',
        enabled_filters: enabledFilters,
        // Per-company portal capability flags. Falls back to the booking-only
        // defaults if the column is NULL (legacy rows or future rows that
        // haven't been backfilled yet). Multiple flags can be true at once:
        // e.g. show_booking + show_catalog for a clinic that sells bonos.
        portal_features: {
          show_booking: (company.portal_features as any)?.show_booking ?? true,
          show_catalog: (company.portal_features as any)?.show_catalog ?? false,
          show_shop: (company.portal_features as any)?.show_shop ?? false,
          show_professionals: (company.portal_features as any)?.show_professionals ?? true,
          show_availability: (company.portal_features as any)?.show_availability ?? true,
        },
      };

      return new Response(JSON.stringify({
        company: companyData,
        services: sanitized,
        professionals: (professionals || []).map((p: any) => ({
          id: p.id,
          display_name: p.display_name,
          title: p.title || null,
          bio: p.bio || null,
          avatar_url: p.avatar_url || null,
          slug: p.slug || null,
        })),
      }), {
        headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      });
    }
    // ---------------------------------

    // --- GET AVAILABILITY: Return busy periods (DB bookings + Google Calendar freebusy) ---
    if (req.method === 'GET' && url.pathname.includes('/availability')) {
      const rawSlug = url.searchParams.get('slug');
      const slug = rawSlug?.toLowerCase().trim() ?? '';
      const weekStart = url.searchParams.get('week_start');
      const professionalId = url.searchParams.get('professional_id') || null;

      if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        return new Response(JSON.stringify({ error: 'Valid slug required' }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return new Response(JSON.stringify({ error: 'Valid week_start (YYYY-MM-DD) required' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const privateSupabase = createClient(PRIVATE_SUPABASE_URL, PRIVATE_SUPABASE_KEY);

      const { data: avCompany } = await privateSupabase
        .from('companies')
        .select('id')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (!avCompany) {
        return new Response(JSON.stringify({ error: 'Company not found' }), {
          status: 404,
          headers: corsHeaders,
        });
      }

      const weekStartDate = new Date(`${weekStart}T00:00:00`);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 7);

      const busyPeriods: Array<{ start: string; end: string }> = [];

      // 1. Already-booked slots from our own DB
      let bookingsQuery = privateSupabase
        .from('bookings')
        .select('start_time, end_time')
        .eq('company_id', avCompany.id)
        .in('status', ['confirmed', 'pending'])
        .gte('start_time', weekStartDate.toISOString())
        .lt('start_time', weekEndDate.toISOString());

      if (professionalId) {
        bookingsQuery = bookingsQuery.eq('professional_id', professionalId);
      }

      const { data: existingBookings } = await bookingsQuery;
      (existingBookings || []).forEach((b: any) => {
        busyPeriods.push({ start: b.start_time, end: b.end_time });
      });

      // 2. Google Calendar freebusy
      let avCalendarUserId: string | null = null;
      if (professionalId) {
        const { data: profUser } = await privateSupabase
          .from('professionals')
          .select('user_id')
          .eq('id', professionalId)
          .single();
        avCalendarUserId = profUser?.user_id || null;
      }
      if (!avCalendarUserId) {
        const { data: ownerMember } = await privateSupabase
          .from('company_members')
          .select('user_id, app_roles!inner(name)')
          .eq('company_id', avCompany.id)
          .eq('app_roles.name', 'owner')
          .limit(1)
          .maybeSingle();
        avCalendarUserId = ownerMember?.user_id || null;
      }

      if (avCalendarUserId && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        try {
          const { data: integration } = await privateSupabase
            .from('integrations')
            .select('access_token, refresh_token, expires_at, settings')
            .eq('user_id', avCalendarUserId)
            .eq('provider', 'google_calendar')
            .maybeSingle();

          if (integration) {
            let accessToken =
              ENCRYPTION_KEY && isEncrypted(integration.access_token)
                ? await decrypt(integration.access_token, ENCRYPTION_KEY)
                : integration.access_token;

            // Refresh if near expiry
            const expiresAt = new Date(integration.expires_at);
            if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
              const refreshToken =
                integration.refresh_token &&
                ENCRYPTION_KEY &&
                isEncrypted(integration.refresh_token)
                  ? await decrypt(integration.refresh_token, ENCRYPTION_KEY)
                  : integration.refresh_token;
              if (refreshToken) {
                const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                  }),
                });
                const tokens = await tokenResp.json();
                if (tokens.access_token) accessToken = tokens.access_token;
              }
            }

            // Use the "availability" calendar (e.g. Fundesplai), fallback to appointments or primary
            const calendarId =
              integration.settings?.calendar_id_availability ||
              integration.settings?.calendar_id_appointments ||
              'primary';

            const freebusyResp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                timeMin: weekStartDate.toISOString(),
                timeMax: weekEndDate.toISOString(),
                items: [{ id: calendarId }],
              }),
            });

            if (freebusyResp.ok) {
              const freebusyData = await freebusyResp.json();
              const calBusy = freebusyData.calendars?.[calendarId]?.busy || [];
              calBusy.forEach((period: any) => {
                busyPeriods.push({ start: period.start, end: period.end });
              });
              console.log(`✅ Freebusy: ${calBusy.length} busy slots from calendar ${calendarId}`);
            } else {
              const errText = await freebusyResp.text();
              console.error('⚠ Freebusy query failed:', freebusyResp.status, errText);
            }
          } else {
            console.log('ℹ No Google Calendar integration for user', avCalendarUserId);
          }
        } catch (avCalErr: any) {
          console.error('⚠ Availability calendar check failed:', avCalErr.message);
        }
      }

      // 3. Professional- and service-level blocked dates (vacaciones, días
      //    libres, etc.). We use the SECURITY DEFINER RPC `get_public_blocked_dates`
      //    instead of querying the tables directly, because the table RLS
      //    policies block the anon/authenticated roles used by the public
      //    portal edge function. The RPC exposes only the date range and
      //    all_day/start_time/end_time columns — no `reason`, no `created_by`.
      try {
        const { data: blocks, error: blocksErr } = await privateSupabase.rpc(
          'get_public_blocked_dates',
          {
            p_company_id: avCompany.id,
            p_professional_id: professionalId ?? null,
            p_from: weekStartDate.toISOString().split('T')[0],
            p_to: weekEndDate.toISOString().split('T')[0],
          }
        );

        if (blocksErr) {
          console.error('⚠ get_public_blocked_dates failed:', blocksErr.message);
        } else {
          console.log(`✅ Public blocked dates: ${blocks?.length || 0} records`);
          (blocks || []).forEach((b: any) => {
            const start = new Date(`${b.start_date}T00:00:00`);
            const end = new Date(`${b.end_date}T00:00:00`);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
              const dayStr = d.toISOString().split('T')[0];
              if (dayStr < weekStartDate.toISOString().split('T')[0]) continue;
              if (dayStr >= weekEndDate.toISOString().split('T')[0]) continue;
              if (b.all_day) {
                busyPeriods.push({
                  start: `${dayStr}T00:00:00.000Z`,
                  end: `${dayStr}T23:59:59.999Z`,
                });
              } else if (b.start_time && b.end_time) {
                busyPeriods.push({
                  start: `${dayStr}T${b.start_time}Z`,
                  end: `${dayStr}T${b.end_time}Z`,
                });
              }
            }
          });
        }
      } catch (blocksErr: any) {
        console.error('⚠ get_public_blocked_dates threw:', blocksErr.message);
      }

      return new Response(JSON.stringify({ busy_periods: busyPeriods }), {
        headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      });
    }
    // ---------------------------------

    // Skip payload reading for GET requests
    if (req.method === 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed for JSON payload' }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    // 2. Parse and validate POST body with Zod schema (Vector 4: Input Validation).
    // BookingSchema enforces all field types, formats, and length constraints.
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const parseResult = BookingSchema.safeParse(payload);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0];
      const message = firstError
        ? `${firstError.path.join('.') || 'input'}: ${firstError.message}`
        : 'Validation failed';
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const {
      action,
      turnstile_token,
      company_slug,
      booking_type_id,
      client_name,
      client_email,
      requested_date,
      requested_time,
      professional_id,
      client_phone,
      variant_id,
      variant_pricing_snapshot,
    } = parseResult.data;

    // Data is already validated by Zod — extract remaining fields for pipeline
    const data: Record<string, unknown> = {
      professional_id: professional_id ?? null,
      client_phone: client_phone ?? null,
      variant_id: variant_id ?? null,
      variant_pricing_snapshot: variant_pricing_snapshot ?? null,
    };

    // 3. Bot/Spam Check (Turnstile)
    const ip = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || '';
    const turnstile = await verifyTurnstile(turnstile_token, ip);
    if (!turnstile.success) {
      return new Response(
        JSON.stringify({ error: 'Bot protection failed', details: turnstile['error-codes'] }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (action === 'create-booking') {
      // 0. REQUIRED-FIELDS CHECK: the schema accepts both create-booking
      //    and create-lead shapes, so the per-booking fields are now
      //    optional. Validate them explicitly here before we touch the
      //    downstream code that assumes they're strings.
      if (!booking_type_id || !client_name || !client_email || !requested_date || !requested_time) {
        return new Response(
          JSON.stringify({ error: 'Faltan campos obligatorios para crear la reserva' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Field lengths are already capped by Zod (max(200), max(50))
      const safeClientName = client_name;
      const safeClientPhone = String(data.client_phone ?? '').substring(0, 50);

      // 0. PROFESSIONAL REQUIRED: Public booking must always select a professional
      if (!data.professional_id) {
        return new Response(
          JSON.stringify({ error: 'Debes seleccionar un profesional para continuar con la reserva.' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // 4. Persistence via Supabase (using service_role for now, but configured specifically for public project)
      // Note: In a real environment, you'd use a postgres driver with the booking_writer role
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      // Insert into public_bookings (unique constraint: company_slug + client_email + date + time)
      const { error: insertError, data: publicBooking } = await supabase
        .from('public_bookings')
        .insert({
          company_slug,
          booking_type_id,
          client_name: safeClientName,
          client_email: String(client_email).toLowerCase().trim(),
          client_phone: safeClientPhone || null,
          requested_date,
          requested_time,
          variant_id: data.variant_id ?? null,
          variant_pricing_snapshot: data.variant_pricing_snapshot ?? null,
          turnstile_verified: true,
          ip_address: ip,
        })
        .select()
        .single();

      if (insertError) {
        // Unique constraint violation → same client already booked this slot
        if (insertError.code === '23505') {
          return new Response(
            JSON.stringify({ error: 'Ya tienes una reserva para esa fecha y hora' }),
            { status: 409, headers: corsHeaders },
          );
        }
        throw insertError;
      }

      // ─────────────────────────────────────────────
      //  POST-BOOKING PIPELINE: Sync → Notify → Calendar → Email
      // ─────────────────────────────────────────────
      const pipelineErrors: string[] = [];
      let syncedBookingId: string | null = null;

      try {
        // Connect to private backend (remote project in dev, same DB in prod)
        const privateSupabase = createClient(PRIVATE_SUPABASE_URL, PRIVATE_SUPABASE_KEY);

        // 1. SYNC: Find company and insert into private bookings
        const { data: company } = await privateSupabase
          .from('companies')
          .select('id, name')
          .eq('slug', company_slug)
          .eq('is_active', true)
          .single();

        if (!company) {
          pipelineErrors.push('Company not found for sync');
          throw new Error('Company not found');
        }

        // Load email notification preferences
        const { data: settings } = await privateSupabase
          .from('company_settings')
          .select('email_preferences')
          .eq('company_id', company.id)
          .maybeSingle();
        const emailPrefs: Record<string, boolean> = {
          google_calendar_invite: true,
          booking_confirmation_client: true,
          booking_cancellation_client: true,
          booking_notification_owner: true,
          booking_notification_professional: true,
          ...((settings?.email_preferences || {}) as Record<string, boolean>),
        };

        // Get service info for duration calculation
        // Note: booking_type_id from the public form is actually a service ID
        const serviceId = booking_type_id;
        const { data: service } = await privateSupabase
          .from('services')
          .select('id, name, duration_minutes')
          .eq('id', serviceId)
          .eq('company_id', company.id)
          .single();

        const durationMinutes = service?.duration_minutes || 60;

        // Discrepancy Fix: Use local-compatible parsing (assume Europe/Madrid if offset not provided)
        // When we create a 'new Date("YYYY-MM-DDTHH:MM")', JS usually treats it as local time of the environment.
        // In Supabase functions (Deno), it might default to UTC.
        // We want to force it to be treated as local time (fixed at +01:00 or +02:00 for Spain, or just send with Z if it was UTC)
        // For now, let's just make it explicit for the Google Calendar payload below.
        // Convert user-selected time (Europe/Madrid local) to UTC for DB storage
        const startTime = madridToUTC(requested_date, requested_time);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

        // 2. VALIDATION: Check professional availability (prevent double-booking)
        {
          const { data: conflicts, error: conflictError } = await privateSupabase
            .from('bookings')
            .select('id')
            .eq('professional_id', data.professional_id as string)
            .neq('status', 'cancelled')
            .lt('start_time', endTime.toISOString())
            .gt('end_time', startTime.toISOString())
            .limit(1);
          if (!conflictError && conflicts?.length) {
            console.warn('⚠️ Professional already booked at this time');
            return new Response(
              JSON.stringify({ error: 'El profesional no está disponible en ese horario. Por favor, selecciona otra hora.' }),
              { status: 409, headers: corsHeaders },
            );
          }
        }

        // 3. CREATE BOOKING atomically with automatic resource assignment
        const bookingPayload = {
          customer_name: client_name,
          customer_email: client_email,
          customer_phone: data.client_phone || null,
          service_id: serviceId,
        };

        const { data: rpcResult, error: rpcError } = await privateSupabase.rpc(
          'create_booking_with_resource',
          {
            p_professional_id: data.professional_id,
            p_start_time: startTime.toISOString(),
            p_end_time: endTime.toISOString(),
            p_booking_data: bookingPayload,
            p_source: 'public_portal',
            p_variant_id: data.variant_id,
            p_variant_pricing_snapshot: data.variant_pricing_snapshot,
          },
        );

        if (rpcError) {
          console.error('❌ create_booking_with_resource failed:', rpcError);
          pipelineErrors.push('Resource assignment failed: ' + rpcError.message);
          throw new Error('resource_assignment_failed');
        }

        if (!rpcResult?.success) {
          let errorMsg: string;
          switch (rpcResult?.error) {
            case 'no_room_available':
              errorMsg = 'No hay salas disponibles para este horario. Por favor, selecciona otra hora.';
              break;
            case 'professional_blocked':
              errorMsg = 'El profesional no está disponible en esta fecha. Por favor, selecciona otra fecha u otro profesional.';
              break;
            case 'service_blocked':
              errorMsg = 'Este servicio no está disponible en esta fecha. Por favor, selecciona otra fecha.';
              break;
            case 'invalid_variant':
              errorMsg = 'La variante seleccionada no está disponible para este servicio. Por favor, elige otra opción.';
              break;
            default:
              errorMsg = rpcResult?.error || 'Error al crear la reserva';
          }
          console.warn('⚠️ Booking creation rejected:', errorMsg);
          return new Response(
            JSON.stringify({ error: errorMsg }),
            { status: 409, headers: corsHeaders },
          );
        }

        // Fetch the created booking to get full data for the pipeline
        const { data: newBooking, error: bookingError } = await privateSupabase
          .from('bookings')
          .select('id, company_id, service_id, customer_name, customer_email, client_id, start_time, end_time, status, source, resource_id, professional_id, variant_id, variant_pricing_snapshot')
          .eq('id', rpcResult.booking_id)
          .single();

        if (bookingError || !newBooking) {
          console.error('❌ Could not fetch created booking:', bookingError);
          pipelineErrors.push('Booking fetch failed: ' + (bookingError?.message || 'unknown'));
          throw new Error('booking_fetch_failed');
        }

        syncedBookingId = newBooking.id;
        console.log('✅ Booking created with resource:', newBooking.id, 'resource:', rpcResult.resource_id);

        // Update public_bookings status
        await supabase
          .from('public_bookings')
          .update({ status: 'synced', synced_at: new Date().toISOString() })
          .eq('id', publicBooking.id);

          // 3. AUTO-GENERATE QUOTE: Create draft quote from booking
          try {
            const { data: quoteResult, error: quoteError } = await privateSupabase.rpc(
              'generate_quote_from_booking',
              { p_booking_id: newBooking.id, p_trigger_source: 'booking_public_portal' }
            );
            if (quoteError) {
              console.error('⚠️ Quote auto-generation failed (non-blocking):', quoteError.message);
              pipelineErrors.push('Quote: ' + quoteError.message);
            } else if (quoteResult?.success) {
              console.log('✅ Quote auto-generated:', quoteResult.quote_id, 'log:', quoteResult.log_id);
            } else {
              console.warn('⚠️ Quote generation returned non-success:', JSON.stringify(quoteResult));
              pipelineErrors.push('Quote: ' + (quoteResult?.error || 'Unknown error'));
            }
          } catch (quoteErr: any) {
            console.error('⚠️ Quote generation exception (non-blocking):', quoteErr.message);
            pipelineErrors.push('Quote: ' + quoteErr.message);
          }

          // 2. NOTIFY: Create in-app notification for company owner
          try {
            const { data: ownerMember } = await privateSupabase
              .from('company_members')
              .select('user_id, role_id, app_roles!inner(name)')
              .eq('company_id', company.id)
              .eq('app_roles.name', 'owner')
              .limit(1)
              .maybeSingle();

            const recipientId = ownerMember?.user_id || null;
            const serviceName = service?.name || 'Servicio';
            const dateFormatted = requested_date; // YYYY-MM-DD
            const timeFormatted = requested_time.substring(0, 5); // HH:MM

            if (recipientId && emailPrefs.booking_notification_owner) {
              await privateSupabase.from('notifications').insert({
                company_id: company.id,
                recipient_id: recipientId,
                profile_type: 'owner',
                type: 'new_booking',
                reference_id: newBooking.id,
                title: '📅 Nueva Reserva',
                content: `${client_name} ha reservado "${serviceName}" para el ${dateFormatted} a las ${timeFormatted}.`,
                is_read: false,
                metadata: {
                  client_email: client_email,
                  service_name: serviceName,
                  date: requested_date,
                  time: requested_time,
                  source: 'public_portal',
                },
              });
              console.log('✅ Notification created for owner:', recipientId);
            }

            // Also notify the professional if different from owner
            if (data.professional_id) {
              const { data: prof } = await privateSupabase
                .from('professionals')
                .select('user_id')
                .eq('id', data.professional_id)
                .single();

              if (prof && prof.user_id && prof.user_id !== recipientId && emailPrefs.booking_notification_professional) {
                await privateSupabase.from('notifications').insert({
                  company_id: company.id,
                  recipient_id: prof.user_id,
                  profile_type: 'professional',
                  type: 'new_booking',
                  reference_id: newBooking.id,
                  title: '📅 Nueva Reserva Asignada',
                  content: `${client_name} ha reservado "${serviceName}" para el ${dateFormatted} a las ${timeFormatted}.`,
                  is_read: false,
                  metadata: {
                    client_email: client_email,
                    service_name: serviceName,
                    date: requested_date,
                    time: requested_time,
                    source: 'public_portal',
                  },
                });
                console.log('✅ Notification created for professional:', prof.user_id);
              }
            }
          } catch (notifyErr: any) {
            console.error('⚠ Notification failed (non-blocking):', notifyErr.message);
            pipelineErrors.push('Notification: ' + notifyErr.message);
          }

          // 3. CALENDAR: Create Google Calendar event using owner's Google OAuth
          // Calendar invite is sent to the client automatically via sendUpdates=all
          try {
            // Always use the owner as calendar user (owner owns the Google OAuth)
            const { data: ownerM } = await privateSupabase
              .from('company_members')
              .select('user_id')
              .eq('company_id', company.id)
              .eq('app_roles!inner(name)', 'owner')
              .limit(1)
              .maybeSingle();
            const calendarUserId = ownerM?.user_id || null;

            if (calendarUserId && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
              console.log('🗓 Checking Google Calendar integration for owner', calendarUserId);
              const { data: integration } = await privateSupabase
                .from('integrations')
                .select('access_token, refresh_token, expires_at, settings')
                .eq('user_id', calendarUserId)
                .eq('provider', 'google_calendar')
                .maybeSingle();

              if (integration) {
                // Decrypt access token
                let accessToken =
                  ENCRYPTION_KEY && isEncrypted(integration.access_token)
                    ? await decrypt(integration.access_token, ENCRYPTION_KEY)
                    : integration.access_token;

                // Refresh token if expired
                const expiresAt = new Date(integration.expires_at);
                if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
                  const refreshToken =
                    integration.refresh_token &&
                    ENCRYPTION_KEY &&
                    isEncrypted(integration.refresh_token)
                      ? await decrypt(integration.refresh_token, ENCRYPTION_KEY)
                      : integration.refresh_token;

                  if (refreshToken) {
                    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: new URLSearchParams({
                        client_id: GOOGLE_CLIENT_ID,
                        client_secret: GOOGLE_CLIENT_SECRET,
                        refresh_token: refreshToken,
                        grant_type: 'refresh_token',
                      }),
                    });
                    const tokens = await tokenResp.json();
                    if (tokens.access_token) {
                      accessToken = tokens.access_token;
                      console.log('✅ Google token refreshed');
                    }
                  }
                }

                // Create calendar event on owner's primary calendar
                const serviceName = service?.name || 'Reserva';
                // If a variant was chosen, append a short plan tag to the event so
                // the staff sees at a glance which tier was booked. We do NOT
                // re-query the variant name here because the snapshot is enough
                // (and saves a round-trip).
                const vSnap = (newBooking as any)?.variant_pricing_snapshot;
                const billingLabel: Record<string, string> = {
                  monthly: 'Mensual',
                  annual: 'Anual',
                  one_time: 'Pago único',
                  session: 'Por sesión',
                  custom: '',
                };
                const variantSuffix = vSnap
                  ? ` (${vSnap.base_price}€${vSnap.billing_period ? ' / ' + (billingLabel[vSnap.billing_period] || vSnap.billing_period) : ''})`
                  : '';
                const calendarEvent = {
                  summary: `${serviceName}${variantSuffix} — ${client_name}`,
                  description: `Reserva desde el portal público.\nCliente: ${client_name}\nEmail: ${client_email}${data.client_phone ? '\nTeléfono: ' + data.client_phone : ''}${vSnap ? '\nPlan: ' + (vSnap.base_price + '€' + (vSnap.billing_period ? ' / ' + vSnap.billing_period : '')) : ''}`,
                  start: {
                    dateTime: `${requested_date}T${requested_time}:00`,
                    timeZone: 'Europe/Madrid',
                  },
                  end: {
                    dateTime: `${requested_date}T${addMinutesToTime(requested_time, durationMinutes)}:00`,
                    timeZone: 'Europe/Madrid',
                  },
                  attendees: [
                    {
                      email: client_email,
                      displayName: client_name,
                      responseStatus: 'needsAction',
                    },
                  ],
                };

                const calResp = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${emailPrefs.google_calendar_invite ? 'all' : 'none'}`,
                  {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(calendarEvent),
                  },
                );

                if (calResp.ok) {
                  const createdEvent = await calResp.json();
                  await privateSupabase
                    .from('bookings')
                    .update({
                      google_event_id: createdEvent.id,
                      meeting_link: createdEvent.hangoutLink || null,
                    })
                    .eq('id', newBooking.id);
                  console.log('✅ Google Calendar event created:', createdEvent.id);
                } else {
                  const calErr = await calResp.text();
                  console.error('⚠ Google Calendar event failed:', calResp.status, calErr);
                  pipelineErrors.push('Calendar: ' + calResp.status);
                }
              } else {
                console.log('ℹ No Google Calendar integration for owner');
              }
            } else {
              console.log(
                'ℹ Calendar skipped — calendarUserId:',
                calendarUserId,
                'GoogleCreds:',
                !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET,
              );
            }
          } catch (calErr: any) {
            console.error('⚠ Calendar event failed (non-blocking):', calErr.message);
            pipelineErrors.push('Calendar: ' + calErr.message);
          }

          // 4. EMAIL: Send confirmation to client via send-branded-email (with SES fallback)
          try {
            if (!emailPrefs.booking_confirmation_client) {
              console.log('ℹ Client confirmation email disabled in preferences — skipping');
              // skip the whole block
            } else {
            const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
            const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
            const AWS_REGION = Deno.env.get('AWS_REGION') || 'eu-west-1';

            if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
              const serviceName = service?.name || 'Servicio';
              const dateFormatted = requested_date;
              const timeFormatted = requested_time.substring(0, 5);

              // If a variant pricing snapshot exists, surface it in the
              // confirmation email so the customer sees the tier they paid for.
              const emailVSnap: any = (newBooking as any)?.variant_pricing_snapshot;
              const emailBilling: Record<string, string> = {
                monthly: 'mes',
                annual: 'año',
                one_time: 'pago único',
                session: 'sesión',
                custom: '',
              };
              const priceCell = emailVSnap
                ? `${emailVSnap.base_price}€${emailVSnap.billing_period ? ' / ' + (emailBilling[emailVSnap.billing_period] || emailVSnap.billing_period) : ''}`
                : ((service as any)?.base_price ? `${(service as any).base_price}€` : '');

              const fromEmail = Deno.env.get('BOOKING_FROM_EMAIL') || `reservas@simplificacrm.es`;

              // Sanitize client_name before using in HTML to prevent XSS in email clients
              const safeName = sanitizeText(client_name, 200);

              // Client confirmation email HTML (for fallback)
              const clientHtml = `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <h2 style="color: #10B981;">✅ Reserva Confirmada</h2>
                                    <p>Hola <strong>${safeName}</strong>,</p>
                                    <p>Tu reserva ha sido confirmada con los siguientes datos:</p>
                                    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                                        <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Servicio</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${serviceName}</td></tr>
                                        <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Fecha</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${dateFormatted}</td></tr>
                                        <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Hora</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${timeFormatted}</td></tr>
                                        ${priceCell ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Plan</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${priceCell}</td></tr>` : ''}
                                        <tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Empresa</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${company.name}</td></tr>
                                    </table>
                                    <p style="color: #6b7280; font-size: 14px;">Si necesitas cancelar o modificar tu reserva, contacta directamente con ${company.name}.</p>
                                </div>`;

              const subjectLine = `Reserva confirmada: ${serviceName} — ${dateFormatted}`;

              // Try send-branded-email first, fall back to direct SES
              let emailSent = false;
              if (company.id && PRIVATE_SUPABASE_KEY) {
                try {
                  const functionsBase = `${PRIVATE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
                  const brandedResponse = await fetch(`${functionsBase}/send-branded-email`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${PRIVATE_SUPABASE_KEY}`,
                    },
                    body: JSON.stringify({
                      companyId: company.id,
                      emailType: 'booking_confirmation',
                      to: [{ email: client_email, name: client_name }],
                      subject: subjectLine,
                      data: {
                        clientName: client_name,
                        serviceName,
                        dateFormatted,
                        timeFormatted,
                        company: { name: company.name },
                        ...(priceCell ? { planLabel: priceCell } : {}),
                      },
                    }),
                  });

                  const brandedResult = await brandedResponse.json();
                  if (brandedResult.success) {
                    emailSent = true;
                    console.log('✅ Branded confirmation email sent to:', client_email);
                  } else {
                    console.warn('⚠ send-branded-email failed:', brandedResult.error);
                  }
                } catch (brandedErr: any) {
                  console.warn('⚠ send-branded-email not available, falling back to SES:', brandedErr.message);
                }
              }

              // Fallback to direct SES if branded email not available
              if (!emailSent) {
                const sesParams = new URLSearchParams();
                sesParams.append('Action', 'SendEmail');
                sesParams.append('Source', `"${company.name}" <${fromEmail}>`);
                sesParams.append('Destination.ToAddresses.member.1', client_email);
                sesParams.append('Message.Subject.Data', subjectLine);
                sesParams.append('Message.Body.Html.Data', clientHtml);
                sesParams.append(
                  'Message.Body.Text.Data',
                  `Hola ${client_name}, tu reserva de ${serviceName} para el ${dateFormatted} a las ${timeFormatted} ha sido confirmada.`,
                );

                const aws = new AwsClient({
                  accessKeyId: AWS_ACCESS_KEY_ID,
                  secretAccessKey: AWS_SECRET_ACCESS_KEY,
                  region: AWS_REGION,
                  service: 'email',
                });

                const sesResp = await aws.fetch(`https://email.${AWS_REGION}.amazonaws.com`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: sesParams.toString(),
                });

                if (sesResp.ok) {
                  console.log('✅ Confirmation email (SES fallback) sent to:', client_email);
                } else {
                  const errText = await sesResp.text();
                  console.error('⚠ SES email failed:', sesResp.status, errText);
                  pipelineErrors.push('Email client: ' + sesResp.status);
                }
              }
            } else {
              console.log('ℹ AWS credentials not configured — skipping email');
            }
            } // end if emailPrefs.booking_confirmation_client
          } catch (emailErr: any) {
            console.error('⚠ Email failed (non-blocking):', emailErr.message);
            pipelineErrors.push('Email: ' + emailErr.message);
          }
      } catch (pipelineErr: any) {
        console.error('⚠ Pipeline error (booking still created):', pipelineErr.message);
      }

      // Return success regardless of pipeline errors (booking was created)
      const result: Record<string, unknown> = {
        success: true,
        message: syncedBookingId ? 'Booking confirmed' : 'Booking pending sync',
        booking_id: syncedBookingId,
      };
      if (pipelineErrors.length > 0) {
        result.warnings = pipelineErrors;
      }

      return new Response(JSON.stringify(result), {
        headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      });
    }

    // ── create-lead (catalog mode) ──────────────────────────────────
    // The customer has clicked a service tier in the catalog and wants
    // to "Contratar". We don't create a booking — we create a Lead in the
    // CRM's leads table so the company owner can follow up. This is the
    // "Quiero este plan" flow.
    if (action === 'create-lead') {
      // Re-parse minimal fields from the raw body. We could extend the
      // BookingSchema but leads are a different shape, so a dedicated
      // inline validation here is clearer.
      const leadBody = payload as Record<string, unknown>;
      const leadCompanySlug = String(leadBody.company_slug ?? '').toLowerCase().trim();
      const leadServiceId = String(leadBody.service_id ?? '');
      const leadVariantId = leadBody.variant_id ? String(leadBody.variant_id) : null;
      const leadFirstName = String(leadBody.first_name ?? '').trim();
      const leadLastName = String(leadBody.last_name ?? '').trim();
      const leadEmail = String(leadBody.email ?? '').trim().toLowerCase();
      const leadPhone = leadBody.phone ? String(leadBody.phone).trim() : null;
      const leadMessage = leadBody.message ? String(leadBody.message).trim() : null;
      const leadNotes = leadBody.notes ? String(leadBody.notes).trim() : null;
      const leadTurnstileToken = String(leadBody.turnstile_token ?? '');

      if (!/^[a-z0-9-]+$/.test(leadCompanySlug)) {
        return new Response(JSON.stringify({ error: 'Invalid company_slug' }), {
          status: 400, headers: corsHeaders,
        });
      }
      if (!leadServiceId || !leadFirstName || !leadLastName || !leadEmail || !leadTurnstileToken) {
        return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
          status: 400, headers: corsHeaders,
        });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
        return new Response(JSON.stringify({ error: 'Email no válido' }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Bot protection (re-use the same helper as create-booking)
      const leadIp = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || '';
      const leadTurnstile = await verifyTurnstile(leadTurnstileToken, leadIp);
      if (!leadTurnstile.success) {
        return new Response(
          JSON.stringify({ error: 'Bot protection failed', details: leadTurnstile['error-codes'] }),
          { status: 400, headers: corsHeaders },
        );
      }

      const privateSupabase = createClient(PRIVATE_SUPABASE_URL, PRIVATE_SUPABASE_KEY);

      // Resolve company
      const { data: leadCompany } = await privateSupabase
        .from('companies')
        .select('id, name')
        .eq('slug', leadCompanySlug)
        .eq('is_active', true)
        .maybeSingle();
      if (!leadCompany) {
        return new Response(JSON.stringify({ error: 'Empresa no encontrada' }), {
          status: 404, headers: corsHeaders,
        });
      }

      // Resolve service for the interest field (just the name, not the price)
      const { data: leadService } = await privateSupabase
        .from('services')
        .select('id, name')
        .eq('id', leadServiceId)
        .eq('company_id', leadCompany.id)
        .maybeSingle();
      if (!leadService) {
        return new Response(JSON.stringify({ error: 'Servicio no encontrado' }), {
          status: 404, headers: corsHeaders,
        });
      }

      // Build the metadata payload with the variant info so the CRM can
      // see what tier the customer wanted.
      const leadVariantPricingSnapshot = leadBody.variant_pricing_snapshot ?? null;
      const leadMetadata = {
        source: 'portal_catalog',
        service_id: leadServiceId,
        variant_id: leadVariantId,
        variant_pricing_snapshot: leadVariantPricingSnapshot,
      };

      // Insert the lead. RLS allows service_role to INSERT, which is
      // what the BFF uses.
      const { data: insertedLead, error: leadInsertError } = await privateSupabase
        .from('leads')
        .insert({
          company_id: leadCompany.id,
          source: 'web_form',
          status: 'new',
          first_name: leadFirstName,
          last_name: leadLastName,
          email: leadEmail,
          phone: leadPhone,
          interest: leadService.name,
          notes: leadMessage,
          metadata: leadMetadata,
          gdpr_accepted: true,
          gdpr_consent_sent_at: new Date().toISOString(),
        })
        .select('id, created_at')
        .single();

      if (leadInsertError) {
        console.error('❌ Lead insert failed:', leadInsertError);
        return new Response(JSON.stringify({ error: 'No se pudo registrar la solicitud' }), {
          status: 500, headers: corsHeaders,
        });
      }

      console.log(`✅ Lead created: ${insertedLead?.id} for company ${leadCompany.id}, service ${leadService.name}`);

      return new Response(JSON.stringify({
        success: true,
        lead_id: insertedLead?.id,
        message: 'Solicitud registrada. Te contactaremos en menos de 24h.',
      }), {
        headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      });
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action', method: req.method, url: req.url }),
      { status: 400, headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }) },
    );
  } catch (error: any) {
    console.error('BFF Error:', error.message);
    // Never leak internal error details or stack traces to public clients
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }
});
