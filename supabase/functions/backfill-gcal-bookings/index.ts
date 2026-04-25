// @ts-nocheck
// ================================================================
// Edge Function: backfill-gcal-bookings
// ================================================================
// One-shot utility: syncs existing bookings (that have no
// google_event_id yet) to Google Calendar for all professionals
// that have a google_calendar_id configured.
//
// Auth: Service Role key required (Authorization: Bearer <key>)
//
// Query params:
//   ?limit=50        — max bookings to process (default: 50, max: 200)
//   ?company_id=xxx  — scope to a single company (optional)
//   ?force=true      — also re-sync bookings that already have google_event_id
//   ?dry_run=true    — only report what would be synced, don't call GCal
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  decrypt as decryptToken,
  encrypt as encryptToken,
  isEncrypted as isTokenEncrypted,
} from '../_shared/crypto-utils.ts';

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY   = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OAUTH_ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
const GOOGLE_CLIENT_ID    = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

/* ── Shared helpers (mirror of docplanner-sync-cron) ──── */

async function getGoogleAccessToken(
  serviceClient: any,
  userId: string
): Promise<string | null> {
  if (!OAUTH_ENCRYPTION_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;

  const { data: integration } = await serviceClient
    .from('integrations')
    .select('id, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .maybeSingle();

  if (!integration) return null;

  const storedAccess = isTokenEncrypted(integration.access_token)
    ? await decryptToken(integration.access_token, OAUTH_ENCRYPTION_KEY)
    : integration.access_token;

  const storedRefresh = integration.refresh_token && isTokenEncrypted(integration.refresh_token)
    ? await decryptToken(integration.refresh_token, OAUTH_ENCRYPTION_KEY)
    : integration.refresh_token;

  const expiresAt = new Date(integration.expires_at);
  const now = new Date();

  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    if (!storedRefresh) return null;
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: storedRefresh,
        grant_type: 'refresh_token',
      }),
    });
    const tokens = await refreshRes.json();
    if (tokens.error) {
      console.error('[backfill-gcal] Token refresh error:', tokens.error);
      return null;
    }
    const newExpiry = new Date(now.getTime() + tokens.expires_in * 1000);
    const encryptedNew = await encryptToken(tokens.access_token, OAUTH_ENCRYPTION_KEY);
    await serviceClient
      .from('integrations')
      .update({
        access_token: encryptedNew,
        expires_at: newExpiry.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', integration.id);
    return tokens.access_token;
  }

  return storedAccess;
}

async function syncOneBooking(
  serviceClient: any,
  booking: any,
  dryRun: boolean,
  ownerUserId: string,
  quotaExceededCalendars: Set<string>
): Promise<{ bookingId: string; result: string }> {
  const { id: bookingId, professional_id, google_event_id: existingEventId } = booking;

  // Get professional's calendar ID + display name
  const { data: prof } = await serviceClient
    .from('professionals')
    .select('google_calendar_id, display_name')
    .eq('id', professional_id)
    .maybeSingle();

  if (!prof?.google_calendar_id) {
    return { bookingId, result: 'skipped:no_calendar' };
  }

  if (dryRun) {
    return { bookingId, result: `dry_run:would_sync_to=${prof.google_calendar_id}` };
  }

  // Use the owner's user_id passed from auth (avoids re-querying company_members per booking)
  const accessToken = await getGoogleAccessToken(serviceClient, ownerUserId);
  if (!accessToken) return { bookingId, result: 'skipped:no_token' };

  const calendarId = prof.google_calendar_id;

  if (quotaExceededCalendars.has(calendarId)) {
    return { bookingId, result: 'skipped:quota_exceeded' };
  }

  const eventBody = {
    summary: `${booking.customer_name} — ${prof.display_name}`,
    description: booking.notes || undefined,
    start: { dateTime: booking.start_time, timeZone: 'Europe/Madrid' },
    end:   { dateTime: booking.end_time || booking.start_time, timeZone: 'Europe/Madrid' },
    attendees: booking.customer_email ? [{ email: booking.customer_email }] : undefined,
  };

  try {
    let googleEventId: string | null = null;

    if (existingEventId) {
      const patchFetch = () => fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}?sendUpdates=none`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        }
      );
      let patchRes = await patchFetch();
      if (!patchRes.ok && patchRes.status === 403) {
        const errBody = await patchRes.json().catch(() => ({}));
        if (errBody?.error?.errors?.some((e: any) => e.reason === 'quotaExceeded')) {
          quotaExceededCalendars.add(calendarId);
          return { bookingId, result: 'skipped:quota_exceeded' };
        }
      }
      if (patchRes.ok) {
        const updated = await patchRes.json();
        googleEventId = updated.id;
      } else if (patchRes.status !== 404) {
        const err = await patchRes.json().catch(() => ({}));
        return { bookingId, result: `error:patch_failed=${JSON.stringify(err)}` };
      }
      // 404 → fall through to create new event
    }

    if (!googleEventId) {
      const postFetch = () => fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        }
      );
      let postRes = await postFetch();
      if (!postRes.ok && postRes.status === 403) {
        const errBody = await postRes.json().catch(() => ({}));
        if (errBody?.error?.errors?.some((e: any) => e.reason === 'quotaExceeded')) {
          quotaExceededCalendars.add(calendarId);
          return { bookingId, result: 'skipped:quota_exceeded' };
        }
      }
      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({}));
        return { bookingId, result: `error:post_failed=${JSON.stringify(err)}` };
      }
      const created = await postRes.json();
      googleEventId = created.id;
    }

    if (googleEventId) {
      await serviceClient
        .from('bookings')
        .update({ google_event_id: googleEventId })
        .eq('id', bookingId);
      return { bookingId, result: `synced:event=${googleEventId}` };
    }

    return { bookingId, result: 'error:no_event_id' };
  } catch (err: any) {
    return { bookingId, result: `error:exception=${err?.message}` };
  }
}

/* ── Main handler ────────────────────────────────────── */

async function syncOneResourceBooking(
  serviceClient: any,
  booking: any,
  dryRun: boolean,
  ownerUserId: string,
  quotaExceededCalendars: Set<string>,
): Promise<{ bookingId: string; result: string }> {
  const { id: bookingId, resource_id, resource_google_event_id: existingEventId } = booking;

  const { data: resource } = await serviceClient
    .from('resources')
    .select('google_calendar_id, name')
    .eq('id', resource_id)
    .maybeSingle();

  if (!resource?.google_calendar_id) {
    return { bookingId, result: 'skipped:no_resource_calendar' };
  }

  if (dryRun) {
    return { bookingId, result: `dry_run:would_sync_to=${resource.google_calendar_id}` };
  }

  const accessToken = await getGoogleAccessToken(serviceClient, ownerUserId);
  if (!accessToken) return { bookingId, result: 'skipped:no_token' };

  const calendarId = resource.google_calendar_id;

  if (quotaExceededCalendars.has(calendarId)) {
    return { bookingId, result: 'skipped:quota_exceeded' };
  }

  const eventBody = {
    summary: booking.customer_name,
    description: booking.notes || undefined,
    start: { dateTime: booking.start_time, timeZone: 'Europe/Madrid' },
    end:   { dateTime: booking.end_time || booking.start_time, timeZone: 'Europe/Madrid' },
    extendedProperties: {
      shared: { simplificaBookingId: bookingId, source: 'resource_sync' },
    },
  };

  try {
    let resourceEventId: string | null = null;

    if (existingEventId) {
      const patchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}?sendUpdates=none`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        },
      );
      if (!patchRes.ok && patchRes.status === 403) {
        const errBody = await patchRes.json().catch(() => ({}));
        if (errBody?.error?.errors?.some((e: any) => e.reason === 'quotaExceeded')) {
          quotaExceededCalendars.add(calendarId);
          return { bookingId, result: 'skipped:quota_exceeded' };
        }
      }
      if (patchRes.ok) {
        const updated = await patchRes.json();
        resourceEventId = updated.id;
      } else if (patchRes.status !== 404) {
        const err = await patchRes.json().catch(() => ({}));
        return { bookingId, result: `error:patch_failed=${JSON.stringify(err)}` };
      }
      // 404 → fall through to create
    }

    if (!resourceEventId) {
      const postRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(eventBody),
        },
      );
      if (!postRes.ok && postRes.status === 403) {
        const errBody = await postRes.json().catch(() => ({}));
        if (errBody?.error?.errors?.some((e: any) => e.reason === 'quotaExceeded')) {
          quotaExceededCalendars.add(calendarId);
          return { bookingId, result: 'skipped:quota_exceeded' };
        }
      }
      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({}));
        return { bookingId, result: `error:post_failed=${JSON.stringify(err)}` };
      }
      const created = await postRes.json();
      resourceEventId = created.id;
    }

    if (resourceEventId) {
      await serviceClient
        .from('bookings')
        .update({ resource_google_event_id: resourceEventId })
        .eq('id', bookingId);
      return { bookingId, result: `synced:event=${resourceEventId}` };
    }

    return { bookingId, result: 'error:no_event_id' };
  } catch (err: any) {
    return { bookingId, result: `error:exception=${err?.message}` };
  }
}

serve(async (req) => {
  const corsResponse = handleCorsOptions(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  // Auth: validate user JWT and check they are owner of their company
  const authHeader = req.headers.get('Authorization') || '';
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Bridge auth.uid() → public.users.id (company_members.user_id uses public UUID, not auth UUID)
  console.log('[backfill-gcal] auth user id:', user.id);
  const { data: publicUser, error: publicUserError } = await serviceClient
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  console.log('[backfill-gcal] public user lookup:', { publicUser, publicUserError });

  if (!publicUser) {
    return new Response(JSON.stringify({ error: 'Forbidden: user profile not found' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Resolve the company where this user is owner/admin (company_members uses role_id FK to app_roles)
  const { data: memberRows, error: membershipError } = await serviceClient
    .from('company_members')
    .select('company_id, app_roles!role_id(name)')
    .eq('user_id', publicUser.id)
    .eq('status', 'active');

  console.log('[backfill-gcal] membership lookup:', { memberRows, membershipError });

  const membership = (memberRows ?? []).find((m: any) => {
    const roleName = m.app_roles?.name;
    return roleName === 'owner' || roleName === 'admin';
  });

  if (!membership) {
    return new Response(JSON.stringify({ error: 'Forbidden: owner or admin required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const url     = new URL(req.url);
  const limit   = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  // Always scope to the authenticated user's company — ignore any query param
  const companyId = membership.company_id;
  const force   = url.searchParams.get('force') === 'true';
  const dryRun  = url.searchParams.get('dry_run') === 'true';
  // mode: 'professionals' (default) | 'resources' | 'all'
  const modeParam = url.searchParams.get('mode') || 'professionals';

  // Parse body for same params
  let bodyMode = modeParam;
  let bodyLimit = limit;
  let bodyForce = force;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.limit) bodyLimit = Math.min(parseInt(body.limit), 200);
    if (body?.mode) bodyMode = body.mode;
    if (body?.force !== undefined) bodyForce = body.force === true;
  } catch { /* ignore */ }

  const processResources = bodyMode === 'resources' || bodyMode === 'all';
  const processProfessionals = bodyMode === 'professionals' || bodyMode === 'all' || bodyMode === modeParam;

  const results: Array<{ bookingId: string; result: string }> = [];
  const quotaExceededCalendars = new Set<string>();

  // ── Professional calendar backfill ─────────────────────
  if (processProfessionals && bodyMode !== 'resources') {
    let query = serviceClient
      .from('bookings')
      .select('id, company_id, professional_id, customer_name, customer_email, start_time, end_time, notes, status, google_event_id')
      .not('professional_id', 'is', null)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: false })
      .limit(bodyLimit);

    query = query.eq('company_id', companyId);
    if (!bodyForce) {
      query = query.is('google_event_id', null);
    }

    const { data: bookings, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    for (const booking of bookings ?? []) {
      const res = await syncOneBooking(serviceClient, booking, dryRun, publicUser.id, quotaExceededCalendars);
      results.push(res);
      console.log(`[backfill-gcal] ${res.bookingId} → ${res.result}`);
      if (!res.result.startsWith('skipped')) {
        await sleep(300);
      }
    }
  }

  // ── Resource (room) calendar backfill ──────────────────
  if (processResources) {
    let resourceQuery = serviceClient
      .from('bookings')
      .select('id, company_id, resource_id, customer_name, start_time, end_time, notes, status, resource_google_event_id')
      .not('resource_id', 'is', null)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: false })
      .limit(bodyLimit);

    resourceQuery = resourceQuery.eq('company_id', companyId);
    if (!bodyForce) {
      resourceQuery = resourceQuery.is('resource_google_event_id', null);
    }

    const { data: resourceBookings, error: resourceError } = await resourceQuery;

    if (resourceError) {
      return new Response(JSON.stringify({ error: resourceError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    for (const booking of resourceBookings ?? []) {
      const res = await syncOneResourceBooking(serviceClient, booking, dryRun, publicUser.id, quotaExceededCalendars);
      results.push(res);
      console.log(`[backfill-gcal] resource ${res.bookingId} → ${res.result}`);
      if (!res.result.startsWith('skipped')) {
        await sleep(300);
      }
    }
  }

  if (!results.length) {
    return new Response(
      JSON.stringify({ message: 'No bookings to process', count: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  const synced  = results.filter(r => r.result.startsWith('synced')).length;
  const skipped = results.filter(r => r.result.startsWith('skipped')).length;
  const errors  = results.filter(r => r.result.startsWith('error')).length;

  return new Response(
    JSON.stringify({
      dry_run: dryRun,
      total:   results.length,
      synced,
      skipped,
      errors,
      results,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  );
});
