// @ts-nocheck
// ================================================================
// Edge Function: cleanup-orphaned-gcal-events (ONE-SHOT)
// ================================================================
// Deletes orphaned Google Calendar events from room (resource)
// calendars. These orphans were created by a bug where
// assignRoomForBooking() re-ran on every sync, causing room
// ping-pong and leaving stale events on old room calendars.
//
// Auth: Authorization header with service_role key (or owner JWT)
// Invoke manually:
//   curl -X POST https://<project>.supabase.co/functions/v1/cleanup-orphaned-gcal-events \
//     -H "Authorization: Bearer <service_role_key>"
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  decrypt as decryptGoogleToken,
  isEncrypted as isGoogleTokenEncrypted,
} from '../_shared/crypto-utils.ts';

/* ── env ─────────────────────────────────────────────── */
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OAUTH_ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';
const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

/* ── Google token helper (same as docplanner-sync-cron) ── */
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

  const storedAccess = OAUTH_ENCRYPTION_KEY && isGoogleTokenEncrypted(integration.access_token)
    ? await decryptGoogleToken(integration.access_token, OAUTH_ENCRYPTION_KEY)
    : integration.access_token;

  const storedRefresh = integration.refresh_token && OAUTH_ENCRYPTION_KEY && isGoogleTokenEncrypted(integration.refresh_token)
    ? await decryptGoogleToken(integration.refresh_token, OAUTH_ENCRYPTION_KEY)
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
      console.error('[cleanup] Token refresh error:', tokens.error);
      return null;
    }
    const newExpiry = new Date(now.getTime() + tokens.expires_in * 1000);
    const encryptedNew = OAUTH_ENCRYPTION_KEY
      ? (await import('../_shared/crypto-utils.ts')).encrypt(tokens.access_token, OAUTH_ENCRYPTION_KEY)
      : tokens.access_token;
    await serviceClient
      .from('integrations')
      .update({ access_token: await encryptedNew, expires_at: newExpiry.toISOString(), updated_at: now.toISOString() })
      .eq('id', integration.id);
    return tokens.access_token;
  }

  return storedAccess;
}

/* ── List ALL events from a GCal calendar (paginated) ── */
async function listAllCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<Array<{ id: string; summary?: string; start?: any; extendedProperties?: any }>> {
  const allEvents: any[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: '250',
      singleEvents: 'true',
      showDeleted: 'false',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[cleanup] Failed to list events for ${calendarId}: ${res.status}`, errText);
      break;
    }

    const data = await res.json();
    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allEvents;
}

/* ── Delete a single GCal event ─────────────────────── */
async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  return res.ok || res.status === 410; // 410 = already deleted
}

/* ── Concurrency control ─────────────────────────────── */
const CONCURRENCY_LIMIT = 10;

/** Execute async tasks with bounded concurrency */
async function parallelBatch<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit);
    const batchResults = await Promise.allSettled(batch.map(fn => fn()));
    results.push(...batchResults);
  }
  return results;
}

/* ── Main handler ────────────────────────────────────── */
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    // Auth: service_role key, user JWT, or one-shot secret in body
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    // Parse body first (need it for auth and config)
    let dryRun = false;
    let bodySecret = '';
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
      bodySecret = body?.secret || '';
    } catch {
      // No body or invalid JSON
    }

    let authorized = false;
    if (token === SERVICE_ROLE_KEY) {
      authorized = true;
    } else if (bodySecret === 'cleanup-orphans-2025-run') {
      // One-shot secret for internal invocation — DELETE this function after use
      authorized = true;
    } else if (token) {
      const tmpClient = createClient(SUPABASE_URL, token);
      const { data: { user } } = await tmpClient.auth.getUser();
      if (user) authorized = true;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log(`[cleanup] Starting orphaned GCal event cleanup (dryRun=${dryRun})`);

    // 1. Get all companies with DP integration (auto_sync enabled)
    const { data: companies } = await serviceClient
      .from('docplanner_integrations')
      .select('company_id')
      .eq('auto_sync', true);

    if (!companies?.length) {
      return new Response(JSON.stringify({ message: 'No companies with auto_sync', deleted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch owner role ONCE (was repeated per company)
    const { data: ownerRole } = await serviceClient
      .from('app_roles')
      .select('id')
      .eq('name', 'owner')
      .maybeSingle();

    if (!ownerRole) {
      return new Response(JSON.stringify({ message: 'No owner role found', deleted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    type OrphanEvent = {
      accessToken: string;
      calendarId: string;
      eventId: string;
      roomName: string;
      summary?: string;
      start?: string;
      bookingId?: string;
    };

    const allOrphans: OrphanEvent[] = [];
    const results: any[] = [];

    for (const { company_id: companyId } of companies) {
      console.log(`[cleanup] Processing company ${companyId}`);

      // 3. Get company owner for Google token
      const { data: ownerMember } = await serviceClient
        .from('company_members')
        .select('user_id')
        .eq('company_id', companyId)
        .eq('role_id', ownerRole.id)
        .maybeSingle();

      if (!ownerMember) {
        console.warn(`[cleanup] No owner found for company ${companyId}, skipping`);
        continue;
      }

      const accessToken = await getGoogleAccessToken(serviceClient, ownerMember.user_id);
      if (!accessToken) {
        console.warn(`[cleanup] No Google access token for company ${companyId}, skipping`);
        continue;
      }

      // 4. Fetch resources and bookings in PARALLEL (was sequential)
      const [resourcesRes, bookingsRes] = await Promise.all([
        serviceClient
          .from('resources')
          .select('id, name, google_calendar_id')
          .eq('company_id', companyId)
          .not('google_calendar_id', 'is', null),
        serviceClient
          .from('bookings')
          .select('resource_google_event_id, resource_id')
          .eq('company_id', companyId)
          .not('resource_google_event_id', 'is', null),
      ]);

      const resources = resourcesRes.data;
      const validBookings = bookingsRes.data;

      if (!resources?.length) {
        console.log(`[cleanup] No resources with Google Calendar for company ${companyId}`);
        continue;
      }

      const validEventIds = new Set(
        (validBookings || []).map((b: any) => b.resource_google_event_id)
      );

      console.log(`[cleanup] Found ${validEventIds.size} valid resource event IDs across ${resources.length} rooms`);

      // 5. Time range: 30 days back to 60 days forward
      const now = new Date();
      const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

      // 6. Scan ALL resources in PARALLEL (was sequential — biggest bottleneck for listing)
      const listTasks = resources.map((resource: any) => async () => {
        const calendarId = resource.google_calendar_id;
        const events = await listAllCalendarEvents(accessToken, calendarId, timeMin, timeMax);
        return { resource, events };
      });

      const listResults = await parallelBatch(listTasks, CONCURRENCY_LIMIT);

      for (const listResult of listResults) {
        if (listResult.status === 'rejected') {
          console.error('[cleanup] Failed to list events for resource:', listResult.reason);
          continue;
        }

        const { resource, events } = listResult.value;
        console.log(`[cleanup] Found ${events.length} total events in "${resource.name}"`);

        const orphanDetails: any[] = [];

        for (const event of events) {
          // Only consider events created by our sync
          const isOurEvent = event.extendedProperties?.shared?.source === 'resource_sync';
          if (!isOurEvent) continue;

          // Check if this event ID is still valid in the DB
          if (validEventIds.has(event.id)) continue;

          // Orphan: exists in GCal but not in DB
          const detail = {
            eventId: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date,
            bookingId: event.extendedProperties?.shared?.simplificaBookingId,
          };
          orphanDetails.push(detail);
          allOrphans.push({
            accessToken,
            calendarId: resource.google_calendar_id,
            eventId: event.id,
            roomName: resource.name,
            ...detail,
          });
        }

        results.push({
          room: resource.name,
          calendarId: resource.google_calendar_id,
          totalEvents: events.length,
          orphanCount: orphanDetails.length,
          deletedCount: 0, // updated after batch deletion
          orphans: orphanDetails,
        });

        console.log(`[cleanup] Room "${resource.name}": ${events.length} total, ${orphanDetails.length} orphans`);
      }
    }

    // 7. BATCH DELETE all orphans in parallel (was: one-by-one sequential await)
    let totalDeleted = 0;
    if (!dryRun && allOrphans.length > 0) {
      console.log(`[cleanup] Deleting ${allOrphans.length} orphan events in batches of ${CONCURRENCY_LIMIT}`);

      const deleteTasks = allOrphans.map(orphan => async () => {
        const ok = await deleteCalendarEvent(orphan.accessToken, orphan.calendarId, orphan.eventId);
        return { calendarId: orphan.calendarId, eventId: orphan.eventId, roomName: orphan.roomName, deleted: ok };
      });

      const deleteResults = await parallelBatch(deleteTasks, CONCURRENCY_LIMIT);

      // Tally per-room delete counts
      const deletedByCalendar = new Map<string, number>();
      for (const r of deleteResults) {
        if (r.status === 'fulfilled' && r.value.deleted) {
          totalDeleted++;
          const key = r.value.calendarId;
          deletedByCalendar.set(key, (deletedByCalendar.get(key) || 0) + 1);
        } else if (r.status === 'rejected') {
          console.warn('[cleanup] Delete batch error:', r.reason);
        } else if (r.status === 'fulfilled' && !r.value.deleted) {
          console.warn(`[cleanup] Failed to delete event ${r.value.eventId} from ${r.value.roomName}`);
        }
      }

      // Patch results with actual counts
      for (const room of results) {
        room.deletedCount = deletedByCalendar.get(room.calendarId) || 0;
      }
    }

    const totalOrphans = allOrphans.length;

    const summary = {
      dryRun,
      totalOrphans,
      totalDeleted,
      rooms: results,
    };

    console.log(`[cleanup] Done. Total orphans: ${totalOrphans}, deleted: ${totalDeleted}${dryRun ? ' (dry run)' : ''}`);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[cleanup] Unhandled error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
