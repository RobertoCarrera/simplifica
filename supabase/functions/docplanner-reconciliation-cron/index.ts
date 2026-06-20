// @ts-nocheck
// ================================================================
// Edge Function: docplanner-reconciliation-cron
// ================================================================
// Proactive booking reconciliation audit: compares DocPlanner API
// booking counts against CRM-synced counts per date across all
// active companies, stores snapshots in docplanner_reconciliation_audit.
//
// Runs via pg_cron:
//   - Daily (every 5h): scope=daily  — audits today only
//   - Weekly (Sunday 2am): scope=full — audits today → +90 days
//
// Auth:
//   - Cron: Authorization header with service_role key
//   - Manual: JWT Bearer token validated via getUser()
//
// Rate limit: DocPlanner API = 30 req/min
//   → 2-second delay between calls (never parallel within company)
//
// IMPORTANT: Do NOT deploy this function unless code is complete
//            and verified. Rate limit violations can blacklist the
//            integration.
// ================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from './cors.ts';
import { withSecurityHeaders } from '../_shared/security.ts';


/* ── Env ──────────────────────────────────────────────────────── */
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY    = Deno.env.get('ENCRYPTION_KEY')!;

/* ── DocPlanner constants ────────────────────────────────────── */
const DP_DOMAIN    = 'www.doctoralia.es';
const DP_BASE_URL  = `https://${DP_DOMAIN}/api/v3/integration`;
const DP_TOKEN_URL = `https://${DP_DOMAIN}/oauth/v2/token`;

/* ── Rate-limit enforcement ──────────────────────────────────── */
// DocPlanner API limit: 30 requests/minute
// Enforce 2-second minimum gap between consecutive API calls
// (2s × 30 calls = 60s, giving headroom below the limit)
const API_CALL_DELAY_MS = 2000;

/* ── Sleep utility ───────────────────────────────────────────── */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── AES-256-GCM token encrypt/decrypt ────────────────────────── */
async function getAesKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(ENCRYPTION_KEY.slice(0, 32));
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptToken(plaintext: string): Promise<string> {
  const key  = await getAesKey();
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const enc  = new TextEncoder().encode(plaintext);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  const combined = new Uint8Array(iv.length + new Uint8Array(ct).length);
  combined.set(iv);
  combined.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptToken(encryptedBase64: string): Promise<string> {
  const key     = await getAesKey();
  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv      = combined.slice(0, 12);
  const ct      = combined.slice(12);
  const dec      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}

/* ── OAuth token management ──────────────────────────────────── */
async function getAccessToken(clientId: string, clientSecret: string) {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(DP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=integration',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DocPlanner auth failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in || 86400 };
}

async function getValidToken(serviceClient: any, integration: any): Promise<string> {
  const now           = new Date();
  const expiresAt     = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  if (integration.access_token_encrypted && expiresAt && expiresAt > fiveMinFromNow) {
    return await decryptToken(integration.access_token_encrypted);
  }

  const clientId     = await decryptToken(integration.client_id_encrypted);
  const clientSecret = await decryptToken(integration.client_secret_encrypted);
  const tokenData    = await getAccessToken(clientId, clientSecret);
  const newExpiry    = new Date(now.getTime() + tokenData.expires_in * 1000);
  const encToken     = await encryptToken(tokenData.access_token);

  await serviceClient
    .from('docplanner_integrations')
    .update({
      access_token_encrypted: encToken,
      token_expires_at:        newExpiry.toISOString(),
      updated_at:              now.toISOString(),
    })
    .eq('id', integration.id);

  return tokenData.access_token;
}

/* ── DocPlanner fetch with 3-retries on 429 ──────────────────── */
async function dpFetch(token: string, path: string, retries = 3): Promise<any> {
  const url = `${DP_BASE_URL}${path}`;
  let lastError = '';

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });

    if (res.status === 429) {
      lastError = '429 Rate limit';
      if (attempt < retries) {
        console.warn(`[reconciliation] 429 on ${path}, retry ${attempt}/${retries} after 60s`);
        await sleep(60_000);
        continue;
      }
      throw new Error(`DocPlanner API ${path} rate-limited after ${retries} retries`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DocPlanner API GET ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    }

    if (res.status === 204) return null;
    return await res.json();
  }

  throw new Error(`DocPlanner API ${path} failed after ${retries} retries: ${lastError}`);
}

/* ── HAL pagination fetch ─────────────────────────────────────── */
async function dpFetchAllItems(token: string, path: string, maxPages = 50): Promise<any[]> {
  const allItems: any[] = [];
  let currentPath: string | null = path;
  let page = 0;

  while (currentPath && page < maxPages) {
    const data = await dpFetch(token, currentPath);
    const items = data?._items || [];
    allItems.push(...items);
    page++;

    const nextHref: string | undefined = data?._links?.next?.href;
    if (nextHref) {
      currentPath = nextHref.startsWith('http')
        ? nextHref.replace(DP_BASE_URL, '')
        : nextHref;
    } else {
      currentPath = null;
    }
  }

  return allItems;
}

/* ── 2-second delay between API calls (rate limit) ───────────── */
async function delayBetweenCalls(): Promise<void> {
  await sleep(API_CALL_DELAY_MS);
}

/* ── Reconcile a single company ──────────────────────────────── */
async function reconcileCompany(
  serviceClient: any,
  integration: any,
  dpToken: string,
  scope: 'daily' | 'full',
  logId: string,
  customStart?: string,
  customEnd?: string,
  shouldSync?: boolean,
  debugBookings?: any[],
): Promise<{ companyId: string; datesProcessed: number; syncedCount: number; errors: string[] }> {
  const mappings    = integration.doctor_mappings || [];
  const facilityId  = integration.facility_id;
  const companyId  = integration.company_id;

  // Skip companies with >50 unmapped doctors
  const unmappedCount = (mappings as any[]).filter(
    (m) => !m.dp_doctor_id || !m.professional_id,
  ).length;

  if (unmappedCount > 50) {
    console.warn(`[reconciliation] Company ${companyId}: ${unmappedCount} unmapped doctors — skipping`);
    if (logId) {
      await serviceClient.from('docplanner_sync_log').update({
        status:        'skipped',
        error_details: [`${unmappedCount} unmapped doctors (>50 threshold)`],
        completed_at:   new Date().toISOString(),
      }).eq('id', logId);
    }
    return { companyId, datesProcessed: 0, syncedCount: 0, errors: [`${unmappedCount} unmapped doctors (>50)`] };
  }

  const now = new Date();
  const startOfToday = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');

  // Use custom date range if provided, otherwise use scope-based range
  let startStr: string;
  let endStr: string;
  let endDate: Date;

  if (customStart && customEnd) {
    startStr = customStart;
    endStr   = customEnd;
    endDate  = new Date(customEnd);
  } else {
    endDate = scope === 'full'
      ? new Date(startOfToday.getTime() + 90 * 24 * 60 * 60 * 1000)
      : new Date(startOfToday.getTime() + 1  * 24 * 60 * 60 * 1000); // daily = today only

    startStr = startOfToday.toISOString().slice(0, 19) + 'Z';
    endStr   = endDate.toISOString().slice(0, 19) + 'Z';
  }

  // Collect DP bookings aggregated by date
  const dateCounts = new Map<string, { dp_total: number; breakdown: Record<string, number> }>();
  let syncedTotal = 0;

  for (const mapping of mappings as any[]) {
    if (!mapping.dp_doctor_id || !mapping.professional_id) continue;

    // Resolve address_id: use stored, or fetch from API
    let addressId = mapping.address_id;
    if (!addressId) {
      try {
        const addrData = await dpFetch(dpToken, `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses`);
        const addresses = addrData?._items || [];
        if (addresses.length > 0) {
          addressId = String(addresses[0].id);
          // Persist resolved address back to integration
          const updatedMappings = mappings.map((m: any) =>
            m.dp_doctor_id === mapping.dp_doctor_id
              ? { ...m, address_id: addressId }
              : m
          );
          await serviceClient.from('docplanner_integrations').update({
            doctor_mappings: updatedMappings,
            updated_at: now.toISOString(),
          }).eq('company_id', companyId);
        }
      } catch (e) {
        console.warn(`[reconciliation] Could not resolve address for doctor ${mapping.dp_doctor_id}: ${e}`);
      }
    }

    if (!addressId) {
      console.warn(`[reconciliation] No address for doctor ${mapping.dp_doctor_id}, skipping`);
      await delayBetweenCalls();
      continue;
    }

    try {
      const path = `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses/${addressId}/bookings?start=${startStr}&end=${endStr}&with=booking.patient,booking.address_service`;
      const dpBookings = await dpFetchAllItems(dpToken, path);

      for (const booking of dpBookings) {
        if (!booking.start_at) continue;
        const isCancelled = booking.status === 'canceled' || booking.status === 'cancelled' || booking.status === 'not_appeared';

        // Debug mode: collect all bookings (including cancelled)
        if (debugBookings) {
          debugBookings.push({
            id: String(booking.id),
            start_at: booking.start_at,
            end_at: booking.end_at || booking.start_at,
            patient_name: (booking.patient?.name || booking.customer_name || '').trim() || 'Paciente Doctoralia',
            patient_email: booking.patient?.email || null,
            patient_phone: booking.patient?.phone || null,
            doctor_id: String(mapping.dp_doctor_id),
            doctor_name: mapping.dp_doctor_name || String(mapping.dp_doctor_id),
            status: booking.status || 'unknown',
            service_name: booking.address_service?.name || null,
          });
        }

        // Skip cancelled for counting — only count active bookings
        if (isCancelled) continue;
        // Extract DATE in UTC (YYYY-MM-DD)
        const dateStr = booking.start_at.slice(0, 10);
        if (!dateCounts.has(dateStr)) {
          dateCounts.set(dateStr, { dp_total: 0, breakdown: {} });
        }
        const entry    = dateCounts.get(dateStr)!;
        entry.dp_total += 1;
        const docId    = String(mapping.dp_doctor_id);
        entry.breakdown[docId] = (entry.breakdown[docId] || 0) + 1;

        // Debug mode: collect individual booking info
        if (debugBookings) {
          debugBookings.push({
            id: String(booking.id),
            start_at: booking.start_at,
            end_at: booking.end_at || booking.start_at,
            patient_name: (booking.patient?.name || booking.customer_name || '').trim() || 'Paciente Doctoralia',
            patient_email: booking.patient?.email || null,
            patient_phone: booking.patient?.phone || null,
            doctor_id: String(mapping.dp_doctor_id),
            doctor_name: mapping.dp_doctor_name || String(mapping.dp_doctor_id),
            status: booking.status || 'unknown',
            service_name: booking.address_service?.name || null,
          });
        }

        // Sync mode: upsert booking into CRM
        if (shouldSync) {
          const bookingId = String(booking.id);
          const startAt = booking.start_at;
          const endAt = booking.end_at || booking.start_at; // fallback if no end_at
          const customerName = (booking.patient?.name || booking.customer_name || '').trim() || 'Paciente Doctoralia';
          const customerEmail = booking.patient?.email || booking.customer_email || null;
          const customerPhone = booking.patient?.phone || booking.customer_phone || null;

          const { error: upsertErr } = await serviceClient
            .from('bookings')
            .upsert({
              company_id: companyId,
              professional_id: mapping.professional_id,
              start_time: startAt,
              end_time: endAt,
              source: 'docplanner',
              docplanner_booking_id: bookingId,
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: customerPhone,
              status: booking.status === 'cancelled' ? 'cancelled' : 'confirmed',
            }, {
              onConflict: 'company_id,docplanner_booking_id',
              ignoreDuplicates: false,
            });

          if (upsertErr) {
            console.warn(`[reconciliation] Upsert failed for booking ${bookingId}:`, upsertErr.message);
          } else {
            syncedTotal++;
          }
        }
      }
    } catch (e) {
      console.error(`[reconciliation] Failed to fetch bookings for doctor ${mapping.dp_doctor_id} addr ${addressId}: ${e}`);
      // Continue to next doctor — partial data is acceptable
    }

    // CRITICAL: 2-second delay between API calls (rate limit enforcement)
    await delayBetweenCalls();
  }

  // Count CRM DocPlanner bookings per date (all statuses for date coverage, active-only for count)
  const crmStart = customStart || startOfToday.toISOString();
  const crmEnd   = customEnd || endDate.toISOString();

  const { data: crmRows } = await serviceClient
    .from('bookings')
    .select('start_time,status')
    .eq('company_id', companyId)
    .eq('source', 'docplanner')
    .gte('start_time', crmStart)
    .lt('start_time', crmEnd);

  const crmCounts = new Map<string, number>();
  for (const row of crmRows || []) {
    const dateStr = (row.start_time as string).slice(0, 10);
    if ((row as any).status !== 'cancelled') {
      crmCounts.set(dateStr, (crmCounts.get(dateStr) || 0) + 1);
    } else if (!crmCounts.has(dateStr)) {
      crmCounts.set(dateStr, 0); // ensure date exists in map even if all cancelled
    }
  }

  // Upsert audit rows — include dates from BOTH Doctoralia and CRM
  let datesProcessed = 0;
  const errors: string[] = [];
  const allDates = new Set([...dateCounts.keys(), ...crmCounts.keys()]);

  for (const dateStr of allDates) {
    const dcEntry = dateCounts.get(dateStr);
    const dp_total = dcEntry?.dp_total || 0;
    const breakdown = dcEntry?.breakdown || {};
    const crm_synced = crmCounts.get(dateStr) || 0;
    const discrepancy = dp_total - crm_synced;

    const { error: upsertErr } = await serviceClient
      .from('docplanner_reconciliation_audit')
      .upsert({
        company_id:   companyId,
        date:         dateStr,
        dp_total,
        crm_synced,
        discrepancy,
        dp_breakdown: breakdown,
        synced_at:    now.toISOString(),
      }, {
        onConflict: 'company_id,date',
      });

    if (upsertErr) {
      errors.push(`date ${dateStr}: ${upsertErr.message}`);
    } else {
      datesProcessed++;
    }
  }

  return { companyId, datesProcessed, syncedCount: syncedTotal, errors };
}

/* ── Main handler ─────────────────────────────────────────────── */
serve(async (req: Request) => {
  const corsHeaders     = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Auth: service_role key (pg_cron) or JWT (manual trigger) ──
  const authHeader = req.headers.get('Authorization') || '';
  const token      = authHeader.replace('Bearer ', '');
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (token !== SERVICE_ROLE_KEY) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      });
    }
  }

  // ── Determine scope: daily (default) or full (weekly) ────────
  const url   = new URL(req.url);
  const scope = url.searchParams.get('scope') === 'full' ? 'full' : 'daily';
  const customStart = url.searchParams.get('start') || undefined;
  const customEnd   = url.searchParams.get('end') || undefined;
  const shouldSync  = url.searchParams.get('action') === 'sync';
  const debugMode   = url.searchParams.get('debug') === '1';

  // ── Fetch all active DocPlanner integrations ─────────────────
  const { data: integrations, error: fetchErr } = await serviceClient
    .from('docplanner_integrations')
    .select('*')
    .eq('is_active', true)
    .eq('auto_sync', true);

  if (fetchErr) {
    console.error('[docplanner-reconciliation-cron] Failed to fetch integrations:', fetchErr);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  if (!integrations || integrations.length === 0) {
    return new Response(JSON.stringify({
      message:   'No active auto-sync integrations',
      processed: 0,
      scope,
    }), {
      status: 200,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  const results: Array<{
    company_id: string;
    status: string;
    dates_processed: number;
    synced_count: number;
    errors: string[];
  }> = [];

  for (const integration of integrations) {
    if (!integration.facility_id || !integration.doctor_mappings?.length) {
      console.warn(`[reconciliation] Integration ${integration.id} not fully configured — skipping`);
      continue;
    }

    // Create sync log entry
    const { data: logEntry } = await serviceClient
      .from('docplanner_sync_log')
      .insert({
        company_id: integration.company_id,
        sync_type:  'reconciliation',
        direction:  'pull',
        status:     'started',
      })
      .select()
      .single();

    try {
      const dpToken = await getValidToken(serviceClient, integration);
      const debugBookings: any[] = [];
      const { companyId, datesProcessed, syncedCount, errors } = await reconcileCompany(
        serviceClient,
        integration,
        dpToken,
        scope,
        logEntry?.id,
        customStart,
        customEnd,
        shouldSync,
        debugMode ? debugBookings : undefined,
      );

      const allErrors = errors || [];
      const status     = allErrors.length === 0 ? 'success' : 'partial';

      if (logEntry) {
        await serviceClient.from('docplanner_sync_log').update({
          status,
          records_synced:  datesProcessed,
          records_failed:  allErrors.length,
          error_details:   allErrors.length ? allErrors.slice(0, 20) : null,
          completed_at:    new Date().toISOString(),
        }).eq('id', logEntry.id);
      }

      results.push({
        company_id:      companyId,
        status,
        dates_processed: datesProcessed,
        synced_count:    syncedCount,
        errors:          allErrors,
        ...(debugMode ? { bookings: debugBookings } : {}),
      });
    } catch (e) {
      console.error(`[docplanner-reconciliation-cron] Company ${integration.company_id} error:`, e);

      if (logEntry) {
        await serviceClient.from('docplanner_sync_log').update({
          status:       'error',
          error_details: [String(e).slice(0, 500)],
          completed_at:  new Date().toISOString(),
        }).eq('id', logEntry.id);
      }

      results.push({
        company_id:      integration.company_id,
        status:          'error',
        dates_processed: 0,
        synced_count:    0,
        errors:          [String(e).slice(0, 200)],
      });
    }
  }

  return new Response(JSON.stringify({
    processed: results.length,
    scope,
    results,
  }), {
    status: 200,
    headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
  });
});