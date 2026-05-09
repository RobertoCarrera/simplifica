// @ts-nocheck

// ================================================================

// Edge Function: docplanner-api

// ================================================================

// Manages DocPlanner (Doctoralia) integration: credential storage,

// OAuth token management, and API proxy for sync operations.

//

// POST body: { action: string, ...params }

//

// Actions:

//   save-credentials   â€” Encrypt & store client_id + client_secret, test connection

//   test-connection     â€” Verify stored credentials work

//   disconnect          â€” Remove integration

//   get-facilities      â€” List facilities from DocPlanner

//   get-doctors         â€” List doctors for a facility

//   get-addresses       â€” List addresses (locations) for a doctor

//   get-bookings        â€” Get bookings for a doctor/address in date range

//   save-config         â€” Save facility, doctor mappings, sync settings

//   sync-bookings       â€” Pull bookings from DocPlanner â†’ Simplifica

//

// Security:

//   - JWT auth required (owner or admin of the company)

//   - Credentials encrypted AES-256-GCM, never returned raw

//   - Rate limited: 10 req/min for credential ops, 30 req/min for reads

//   - CORS origin validation

// ================================================================



import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

import { getClientIP } from '../_shared/security.ts';

import { decrypt as oauthDecrypt, isEncrypted as isOAuthEncrypted, encrypt as oauthEncrypt } from '../_shared/crypto-utils.ts';



/* â”€â”€ env â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;

const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ENCRYPTION_KEY    = Deno.env.get('ENCRYPTION_KEY');

const OAUTH_ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';

const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID') || '';

const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';



if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {

  throw new Error('[docplanner-api] ENCRYPTION_KEY must be at least 32 characters');

}



/* â”€â”€ DocPlanner constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const DP_DOMAIN    = 'www.doctoralia.es';

const DP_BASE_URL  = `https://${DP_DOMAIN}/api/v3/integration`;

const DP_TOKEN_URL = `https://${DP_DOMAIN}/oauth/v2/token`;



/* â”€â”€ AES-256-GCM helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function getAesKey(): Promise<CryptoKey> {

  const keyData = new TextEncoder().encode(ENCRYPTION_KEY!.slice(0, 32));

  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

}



async function encrypt(plaintext: string): Promise<string> {

  const key = await getAesKey();

  const iv  = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);

  combined.set(iv);

  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));

}



async function decrypt(encryptedBase64: string): Promise<string> {

  const key = await getAesKey();

  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  const iv = combined.slice(0, 12);

  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  return new TextDecoder().decode(decrypted);

}



/* â”€â”€ OAuth token management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function getAccessToken(

  clientId: string,

  clientSecret: string

): Promise<{ access_token: string; expires_in: number }> {

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

  return {

    access_token: data.access_token,

    expires_in: data.expires_in || 86400, // default 24h

  };

}



/**

 * Get a valid access token for a company's DocPlanner integration.

 * Auto-refreshes if expired or expiring within 5 minutes.

 */

async function getValidToken(

  serviceClient: any,

  companyId: string

): Promise<string> {

  const { data: integration, error } = await serviceClient

    .from('docplanner_integrations')

    .select('*')

    .eq('company_id', companyId)

    .single();



  if (error || !integration) throw new Error('DocPlanner integration not found');

  if (!integration.is_active) throw new Error('DocPlanner integration is not active');



  const now = new Date();

  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;

  const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);



  // Token still valid

  if (integration.access_token_encrypted && expiresAt && expiresAt > fiveMinFromNow) {

    return await decrypt(integration.access_token_encrypted);

  }



  // Need to refresh â€” decrypt credentials first

  const clientId = await decrypt(integration.client_id_encrypted);

  const clientSecret = await decrypt(integration.client_secret_encrypted);



  const tokenData = await getAccessToken(clientId, clientSecret);

  const encryptedToken = await encrypt(tokenData.access_token);

  const newExpiry = new Date(now.getTime() + tokenData.expires_in * 1000);



  // Store refreshed token

  await serviceClient

    .from('docplanner_integrations')

    .update({

      access_token_encrypted: encryptedToken,

      token_expires_at: newExpiry.toISOString(),

      updated_at: now.toISOString(),

    })

    .eq('company_id', companyId);



  return tokenData.access_token;

}



/* â”€â”€ Per-doctor address resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**

 * Resolve the correct address_id for a specific doctor by querying the

 * DocPlanner API.  Returns the first address_id or '' if none found.

 *

 * DocPlanner requires bookings to be fetched with an address that actually

 * belongs to the doctor â€” using another doctor's address yields a 403.

 */

async function resolveAddressForDoctor(

  token: string,

  facilityId: string,

  dpDoctorId: string,

): Promise<string> {

  const addrData = await dpFetch(token, `/facilities/${facilityId}/doctors/${dpDoctorId}/addresses`);

  const addresses = addrData?._items || [];

  return addresses.length > 0 ? String(addresses[0].id) : '';

}



/**

 * Re-resolve address_id for a single mapping, persist the update,

 * and return the corrected address_id.

 */

async function refreshMappingAddress(

  serviceClient: any,

  companyId: string,

  token: string,

  facilityId: string,

  mappings: any[],

  dpDoctorId: string,

): Promise<string> {

  const newAddr = await resolveAddressForDoctor(token, facilityId, dpDoctorId);

  if (newAddr) {

    const updated = mappings.map((m: any) =>

      String(m.dp_doctor_id) === String(dpDoctorId) ? { ...m, address_id: newAddr } : m

    );

    await serviceClient.from('docplanner_integrations')

      .update({ doctor_mappings: updated, updated_at: new Date().toISOString() })

      .eq('company_id', companyId);

    console.log(`[resolve-addr] Doctor ${dpDoctorId}: address updated to ${newAddr}`);

  }

  return newAddr;

}



/* â”€â”€ DocPlanner API call helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function dpFetch(

  token: string,

  path: string,

  method = 'GET',

  body?: any

): Promise<any> {

  const url = `${DP_BASE_URL}${path}`;

  const headers: Record<string, string> = {

    'Authorization': `Bearer ${token}`,

    'Accept': 'application/json',

  };

  if (body) headers['Content-Type'] = 'application/json';



  const res = await fetch(url, {

    method,

    headers,

    body: body ? JSON.stringify(body) : undefined,

  });



  if (!res.ok) {

    const text = await res.text().catch(() => '');

    throw new Error(`DocPlanner API ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);

  }



  // Some DELETE endpoints return 204 No Content

  if (res.status === 204) return null;

  return await res.json();

}



/**

 * Fetch all pages from a DocPlanner list endpoint (HAL-style pagination).

 * Follows `_links.next.href` until exhausted or `maxPages` reached.

 */

async function dpFetchAllItems(

  token: string,

  path: string,

  maxPages = 50

): Promise<any[]> {

  const allItems: any[] = [];

  let currentPath: string | null = path;

  let page = 0;



  while (currentPath && page < maxPages) {

    const data = await dpFetch(token, currentPath);

    const items = data?._items || [];

    allItems.push(...items);

    page++;



    // Follow HAL pagination link

    const nextHref: string | undefined = data?._links?.next?.href;

    if (nextHref) {

      // nextHref may be absolute URL or relative path

      currentPath = nextHref.startsWith('http')

        ? nextHref.replace(DP_BASE_URL, '')

        : nextHref;

    } else {

      currentPath = null;

    }

  }



  return allItems;

}



/* â”€â”€ Tag helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */



/**

 * Ensure a "Doctoralia" tag exists for the company, return its ID.

 */

async function ensureDocplannerTag(

  serviceClient: any,

  companyId: string

): Promise<string | null> {

  const { data: existing } = await serviceClient

    .from('global_tags')

    .select('id')

    .eq('company_id', companyId)

    .ilike('name', 'doctoralia')

    .maybeSingle();



  if (existing) return existing.id;



  const { data: newTag, error } = await serviceClient

    .from('global_tags')

    .insert({

      company_id: companyId,

      name: 'Doctoralia',

      color: '#00b8a9',

      category: 'IntegraciÃ³n',

      scope: ['clients', 'professionals'],

      description: 'Importado desde Doctoralia (DocPlanner)',

    })

    .select('id')

    .single();



  if (error) {

    console.error('[ensureDocplannerTag] Failed to create tag:', error);

    return null;

  }

  return newTag.id;

}



/**

 * Tag a record via the unified item_tags table. Idempotent.

 */

async function tagRecord(

  serviceClient: any,

  tagId: string,

  recordId: string,

  recordType: string

): Promise<void> {

  if (recordType === 'client') {

    // Use clients_tags (the table the Angular frontend reads from)

    await serviceClient

      .from('clients_tags')

      .upsert(

        { tag_id: tagId, client_id: recordId },

        { onConflict: 'client_id,tag_id', ignoreDuplicates: true }

      );

  } else {

    await serviceClient

      .from('item_tags')

      .upsert(

        { tag_id: tagId, record_id: recordId, record_type: recordType },

        { ignoreDuplicates: true }

      );

  }

}



/* â”€â”€ Action handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */



async function handleSaveCredentials(

  serviceClient: any,

  companyId: string,

  body: any

): Promise<Response> {

  const { client_id, client_secret } = body;

  if (!client_id?.trim() || !client_secret?.trim()) {

    return jsonResponse(400, { error: 'client_id and client_secret are required' });

  }



  // Test the credentials by requesting a token

  let tokenData;

  try {

    tokenData = await getAccessToken(client_id.trim(), client_secret.trim());

  } catch (e) {

    return jsonResponse(400, {

      error: 'Invalid credentials â€” could not authenticate with DocPlanner',

      detail: String(e),

    });

  }



  // Encrypt everything

  const encClientId     = await encrypt(client_id.trim());

  const encClientSecret = await encrypt(client_secret.trim());

  const encToken        = await encrypt(tokenData.access_token);

  const expiresAt       = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();



  // Upsert integration

  const { error } = await serviceClient

    .from('docplanner_integrations')

    .upsert({

      company_id: companyId,

      client_id_encrypted: encClientId,

      client_secret_encrypted: encClientSecret,

      access_token_encrypted: encToken,

      token_expires_at: expiresAt,

      is_active: true,

      updated_at: new Date().toISOString(),

    }, { onConflict: 'company_id' });



  if (error) {

    console.error('[save-credentials] DB error:', error);

    return jsonResponse(500, { error: 'Failed to save integration' });

  }



  return jsonResponse(200, { success: true, message: 'DocPlanner connected successfully' });

}



async function handleTestConnection(

  serviceClient: any,

  companyId: string

): Promise<Response> {

  try {

    const token = await getValidToken(serviceClient, companyId);

    const data = await dpFetch(token, '/facilities');

    const facilities = data?._items || [];

    return jsonResponse(200, {

      ok: true,

      facilityCount: facilities.length,

      facilities: facilities.map((f: any) => ({ id: f.id, name: f.name })),

    });

  } catch (e) {

    return jsonResponse(200, { ok: false, error: String(e) });

  }

}



async function handleDisconnect(

  serviceClient: any,

  companyId: string

): Promise<Response> {

  const { error } = await serviceClient

    .from('docplanner_integrations')

    .delete()

    .eq('company_id', companyId);



  if (error) {

    return jsonResponse(500, { error: 'Failed to disconnect' });

  }

  return jsonResponse(200, { success: true });

}



async function handleGetFacilities(

  serviceClient: any,

  companyId: string

): Promise<Response> {

  const token = await getValidToken(serviceClient, companyId);

  const data = await dpFetch(token, '/facilities');

  return jsonResponse(200, { facilities: data?._items || [] });

}



async function handleGetDoctors(

  serviceClient: any,

  companyId: string,

  body: any

): Promise<Response> {

  const { facility_id } = body;

  if (!facility_id) return jsonResponse(400, { error: 'facility_id is required' });



  const token = await getValidToken(serviceClient, companyId);

  const data = await dpFetch(token, `/facilities/${facility_id}/doctors`);

  return jsonResponse(200, { doctors: data?._items || [] });

}



async function handleGetAddresses(

  serviceClient: any,

  companyId: string,

  body: any

): Promise<Response> {

  const { facility_id, doctor_id } = body;

  if (!facility_id || !doctor_id) {

    return jsonResponse(400, { error: 'facility_id and doctor_id are required' });

  }



  const token = await getValidToken(serviceClient, companyId);

  const data = await dpFetch(token, `/facilities/${facility_id}/doctors/${doctor_id}/addresses`);

  return jsonResponse(200, { addresses: data?._items || [] });

}



async function handleGetBookings(

  serviceClient: any,

  companyId: string,

  body: any

): Promise<Response> {

  const { facility_id, doctor_id, address_id, start, end } = body;

  if (!facility_id || !doctor_id || !address_id) {

    return jsonResponse(400, { error: 'facility_id, doctor_id, and address_id are required' });

  }



  const token = await getValidToken(serviceClient, companyId);



  let path = `/facilities/${facility_id}/doctors/${doctor_id}/addresses/${address_id}/bookings`;

  const params = new URLSearchParams();

  if (start) params.set('start', start);

  if (end)   params.set('end', end);

  params.set('with', 'booking.patient,booking.address_service');

  const qs = params.toString();

  if (qs) path += `?${qs}`;



  const data = await dpFetchAllItems(token, path);

  return jsonResponse(200, { bookings: data?._items || [] });

}



async function handleSaveConfig(

  serviceClient: any,

  companyId: string,

  body: any

): Promise<Response> {

  const { facility_id, facility_name, doctor_mappings, sync_bookings, sync_patients, auto_sync } = body;



  const updates: Record<string, any> = { updated_at: new Date().toISOString() };



  if (facility_id !== undefined) updates.facility_id = facility_id;

  if (facility_name !== undefined) updates.facility_name = facility_name;

  if (doctor_mappings !== undefined) updates.doctor_mappings = doctor_mappings;

  if (sync_bookings !== undefined) updates.sync_bookings = sync_bookings;

  if (sync_patients !== undefined) updates.sync_patients = sync_patients;

  if (auto_sync !== undefined) updates.auto_sync = auto_sync;



  const { error } = await serviceClient

    .from('docplanner_integrations')

    .update(updates)

    .eq('company_id', companyId);



  if (error) {

    return jsonResponse(500, { error: 'Failed to save configuration' });

  }

  return jsonResponse(200, { success: true });

}



async function handleSyncBookings(

  serviceClient: any,

  companyId: string

): Promise<Response> {

  // Get integration config

  const { data: integration, error: intError } = await serviceClient

    .from('docplanner_integrations')

    .select('*')

    .eq('company_id', companyId)

    .single();



  if (intError || !integration) {

    return jsonResponse(400, { error: 'Integration not configured' });

  }

  if (!integration.facility_id) {

    return jsonResponse(400, { error: 'No facility selected â€” configure the integration first' });

  }



  const mappings = integration.doctor_mappings || [];

  if (!mappings.length) {

    return jsonResponse(400, { error: 'No doctor mappings configured' });

  }



  // NOTE: do NOT auto-activate professionals here â€” some may be intentionally inactive

  // (e.g. former doctors kept for historical booking data). Bookings are visible

  // in the calendar regardless of the professional's is_active flag.



  // Create sync log entry

  const { data: logEntry } = await serviceClient

    .from('docplanner_sync_log')

    .insert({

      company_id: companyId,

      sync_type: 'bookings',

      direction: 'pull',

      status: 'started',

    })

    .select()

    .single();



  const token = await getValidToken(serviceClient, companyId);



  // Pull bookings for the next 90 days (3 months) from each mapped doctor/address
  // NOTE: use start-of-day (not "now") so already-passed bookings today are included
  const now = new Date();
  const startOfToday = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  const ninetyDaysLater = new Date(startOfToday.getTime() + 90 * 24 * 60 * 60 * 1000);
  const startStr = startOfToday.toISOString().slice(0, 19) + 'Z';
  const endStr   = ninetyDaysLater.toISOString().slice(0, 19) + 'Z';


  let totalSynced = 0;

  let totalFailed = 0;

  let roomConflicts = 0;

  const errors: string[] = [];



  for (const mapping of mappings) {

    if (!mapping.dp_doctor_id || !mapping.professional_id) continue;



    // Resolve address_id: use stored value, or fetch from API

    let addressId = mapping.address_id;

    if (!addressId) {

      try {

        addressId = await refreshMappingAddress(

          serviceClient, companyId, token, integration.facility_id, mappings, mapping.dp_doctor_id);

      } catch (_) { /* will be caught below */ }

    }

    if (!addressId) {

      errors.push(`Doctor ${mapping.dp_doctor_name || mapping.dp_doctor_id}: no address_id (no se pudo resolver)`);

      totalFailed++;

      continue;

    }



    try {

      const bookingsPath = `/facilities/${integration.facility_id}/doctors/${mapping.dp_doctor_id}/addresses/${addressId}/bookings?start=${startStr}&end=${endStr}&with=booking.patient,booking.address_service`;

      const dpBookings = await dpFetchAllItems(token, bookingsPath);



      for (const dpBooking of dpBookings) {

        try {

          const result = await upsertBookingFromDP(serviceClient, companyId, dpBooking, mapping);

          totalSynced++;

          if (result.roomConflict) roomConflicts++;

        } catch (e) {

          totalFailed++;

          errors.push(`Booking ${dpBooking.id}: ${String(e)}`);

        }

      }

    } catch (e) {

      // If 403 "address does not belong to this doctor", re-resolve and retry once

      if (String(e).includes('403') && String(e).includes('address')) {

        console.log(`[sync] 403 for doctor ${mapping.dp_doctor_id} with address ${addressId}, re-resolving...`);

        try {

          const newAddr = await refreshMappingAddress(

            serviceClient, companyId, token, integration.facility_id, mappings, mapping.dp_doctor_id);

          if (newAddr && newAddr !== addressId) {

            addressId = newAddr;

            const retryPath = `/facilities/${integration.facility_id}/doctors/${mapping.dp_doctor_id}/addresses/${addressId}/bookings?start=${startStr}&end=${endStr}&with=booking.patient,booking.address_service`;

            const dpBookings = await dpFetchAllItems(token, retryPath);

            for (const dpBooking of dpBookings) {

              try {

                const result = await upsertBookingFromDP(serviceClient, companyId, dpBooking, mapping);

                totalSynced++;

                if (result.roomConflict) roomConflicts++;

              } catch (e2) {

                totalFailed++;

                errors.push(`Booking ${dpBooking.id}: ${String(e2)}`);

              }

            }

            continue; // retry succeeded, skip to next mapping

          }

        } catch (_) { /* retry failed, fall through to original error */ }

      }

      totalFailed++;

      errors.push(`Doctor ${mapping.dp_doctor_name || mapping.dp_doctor_id}: ${String(e)}`);

    }

  }



  const status = totalFailed === 0 ? 'success' : (totalSynced > 0 ? 'partial' : 'error');



  // Update sync log

  if (logEntry) {

    await serviceClient

      .from('docplanner_sync_log')

      .update({

        status,

        records_synced: totalSynced,

        records_failed: totalFailed,

        error_details: errors.length ? errors : null,

        completed_at: new Date().toISOString(),

      })

      .eq('id', logEntry.id);

  }



  // Update integration last sync

  await serviceClient

    .from('docplanner_integrations')

    .update({

      last_sync_at: new Date().toISOString(),

      last_sync_status: status,

      last_sync_message: status === 'success'

        ? `${totalSynced} bookings synced`

        : `${totalSynced} synced, ${totalFailed} failed`,

      updated_at: new Date().toISOString(),

    })

    .eq('company_id', companyId);



  return jsonResponse(200, {

    status,

    synced: totalSynced,

    failed: totalFailed,

    errors: errors.slice(0, 10), // Limit errors in response

    roomConflicts,

  });

}



/* â”€â”€ Room assignment (conflict-free) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**

 * Returns the resource_id (room) to assign to a booking.

 * Tries the professional's default room first; if busy, tries other active

 * rooms in the company. Returns null if no room is available.

 */

async function assignRoomForBooking(

  serviceClient: any,

  companyId: string,

  professionalId: string,

  startTime: string,

  endTime: string,

): Promise<{ id: string | null; hadConflict: boolean }> {

  const { data: professional } = await serviceClient

    .from('professionals')

    .select('default_resource_id')

    .eq('id', professionalId)

    .maybeSingle();



  const hasConflict = async (resourceId: string): Promise<boolean> => {

    const { data: conflicts } = await serviceClient

      .from('bookings')

      .select('id')

      .eq('resource_id', resourceId)

      .neq('status', 'cancelled')

      .lt('start_time', endTime)

      .gt('end_time', startTime)

      .limit(1);

    return (conflicts?.length ?? 0) > 0;

  };



  // If professional has a fixed room, try it first

  if (professional?.default_resource_id) {

    if (!(await hasConflict(professional.default_resource_id))) {

      return { id: professional.default_resource_id, hadConflict: false };

    }

  }



  // Find any available active room (skip fixed room already checked above)

  let roomsQuery = serviceClient

    .from('resources')

    .select('id')

    .eq('company_id', companyId)

    .eq('type', 'room')

    .eq('is_active', true);

  if (professional?.default_resource_id) {

    roomsQuery = roomsQuery.neq('id', professional.default_resource_id);

  }

  const { data: rooms } = await roomsQuery;



  if (rooms) {

    for (const room of rooms) {

      if (!(await hasConflict(room.id))) return { id: room.id, hadConflict: false };

    }

  }



  return { id: null, hadConflict: true }; // all rooms occupied

}



/* â”€â”€ Google Calendar sync for DocPlanner bookings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**

 * Creates or updates a Google Calendar event for a booking on the

 * professional's calendar. Non-fatal: logs warnings and returns silently

 * on any failure (no Google integration, missing tokens, API errors).

 */

async function syncBookingToGoogleCalendar(

  serviceClient: any,

  professionalId: string,

  bookingId: string,

  data: {

    customer_name: string;

    start_time: string;

    end_time: string;

    notes?: string | null;

    resource_id?: string | null;

  },

  existingEventId: string | null,

): Promise<void> {

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_ENCRYPTION_KEY) return;



  const { data: professional } = await serviceClient

    .from('professionals')

    .select('user_id, google_calendar_id')

    .eq('id', professionalId)

    .maybeSingle();



  if (!professional?.google_calendar_id || !professional?.user_id) return;



  const { data: integration } = await serviceClient

    .from('integrations')

    .select('id, access_token, refresh_token, expires_at')

    .eq('user_id', professional.user_id)

    .eq('provider', 'google_calendar')

    .maybeSingle();



  if (!integration) return;



  // Decrypt tokens (backward-compatible: handles plaintext if not yet encrypted)

  const storedAccessToken =

    OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.access_token)

      ? await oauthDecrypt(integration.access_token, OAUTH_ENCRYPTION_KEY)

      : integration.access_token;



  const storedRefreshToken =

    integration.refresh_token && OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.refresh_token)

      ? await oauthDecrypt(integration.refresh_token, OAUTH_ENCRYPTION_KEY)

      : integration.refresh_token;



  let accessToken = storedAccessToken;

  const expiresAt = new Date(integration.expires_at);

  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {

    if (!storedRefreshToken) return;

    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {

      method: 'POST',

      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },

      body: new URLSearchParams({

        client_id: GOOGLE_CLIENT_ID,

        client_secret: GOOGLE_CLIENT_SECRET,

        refresh_token: storedRefreshToken,

        grant_type: 'refresh_token',

      }),

    });

    const refreshed = await refreshRes.json();

    if (refreshed.error || !refreshed.access_token) {

      console.warn('[syncBookingToGoogleCalendar] Token refresh failed:', refreshed.error);

      return;

    }

    accessToken = refreshed.access_token;

    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);

    const encryptedNew = await oauthEncrypt(accessToken, OAUTH_ENCRYPTION_KEY);

    await serviceClient

      .from('integrations')

      .update({

        access_token: encryptedNew,

        expires_at: newExpiry.toISOString(),

        updated_at: new Date().toISOString(),

      })

      .eq('id', integration.id);

  }



  const calendarEvent: Record<string, unknown> = {

    summary: data.customer_name,

    start: { dateTime: data.start_time, timeZone: 'UTC' },

    end: { dateTime: data.end_time, timeZone: 'UTC' },

    extendedProperties: {

      shared: { simplificaBookingId: bookingId, source: 'docplanner' },

    },

  };

  if (data.notes) calendarEvent.description = data.notes;



  const calendarId = encodeURIComponent(professional.google_calendar_id);

  const url = existingEventId

    ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(existingEventId)}?sendUpdates=all`

    : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all`;



  const gcalRes = await fetch(url, {

    method: existingEventId ? 'PUT' : 'POST',

    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },

    body: JSON.stringify(calendarEvent),

  });



  if (!gcalRes.ok) {

    const err = await gcalRes.text();

    console.warn(`[syncBookingToGoogleCalendar] API error for booking ${bookingId}:`, err);

    return;

  }



  const result = await gcalRes.json();

  if (result.id) {

    await serviceClient.from('bookings').update({ google_event_id: result.id }).eq('id', bookingId);

  }

}



/* â”€â”€ Company owner OAuth token helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function getOwnerGoogleAccessToken(

  serviceClient: any,

  companyId: string,

): Promise<string | null> {

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_ENCRYPTION_KEY) return null;



  const { data: ownerMember } = await serviceClient

    .from('company_members')

    .select('user_id')

    .eq('company_id', companyId)

    .eq('role', 'owner')

    .maybeSingle();

  if (!ownerMember) return null;



  const { data: integration } = await serviceClient

    .from('integrations')

    .select('id, access_token, refresh_token, expires_at')

    .eq('user_id', ownerMember.user_id)

    .eq('provider', 'google_calendar')

    .maybeSingle();

  if (!integration) return null;



  const storedAccessToken =

    OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.access_token)

      ? await oauthDecrypt(integration.access_token, OAUTH_ENCRYPTION_KEY)

      : integration.access_token;



  const storedRefreshToken =

    integration.refresh_token && OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.refresh_token)

      ? await oauthDecrypt(integration.refresh_token, OAUTH_ENCRYPTION_KEY)

      : integration.refresh_token;



  let accessToken = storedAccessToken;

  const expiresAt = new Date(integration.expires_at);

  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {

    if (!storedRefreshToken) return null;

    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {

      method: 'POST',

      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },

      body: new URLSearchParams({

        client_id: GOOGLE_CLIENT_ID,

        client_secret: GOOGLE_CLIENT_SECRET,

        refresh_token: storedRefreshToken,

        grant_type: 'refresh_token',

      }),

    });

    const refreshed = await refreshRes.json();

    if (refreshed.error || !refreshed.access_token) return null;

    accessToken = refreshed.access_token;

    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);

    const encryptedNew = await oauthEncrypt(accessToken, OAUTH_ENCRYPTION_KEY);

    await serviceClient

      .from('integrations')

      .update({

        access_token: encryptedNew,

        expires_at: newExpiry.toISOString(),

        updated_at: new Date().toISOString(),

      })

      .eq('id', integration.id);

  }



  return accessToken;

}



/* â”€â”€ Resource (room) Google Calendar sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function syncBookingToResourceCalendar(

  serviceClient: any,

  companyId: string,

  bookingId: string,

  data: {

    resource_id?: string | null;

    customer_name: string;

    start_time: string;

    end_time: string;

    notes?: string | null;

  },

  existingResourceEventId: string | null,

): Promise<void> {

  if (!data.resource_id) return;



  const { data: resource } = await serviceClient

    .from('resources')

    .select('google_calendar_id')

    .eq('id', data.resource_id)

    .maybeSingle();

  if (!resource?.google_calendar_id) return;



  const accessToken = await getOwnerGoogleAccessToken(serviceClient, companyId);

  if (!accessToken) return;



  const calendarId = resource.google_calendar_id;

  const eventBody: Record<string, unknown> = {

    summary: data.customer_name,

    start: { dateTime: data.start_time, timeZone: 'UTC' },

    end: { dateTime: data.end_time, timeZone: 'UTC' },

    extendedProperties: {

      shared: { simplificaBookingId: bookingId, source: 'resource_sync' },

    },

  };

  if (data.notes) eventBody.description = data.notes;



  try {

    let resourceEventId: string | null = null;



    if (existingResourceEventId) {

      const res = await fetch(

        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingResourceEventId)}?sendUpdates=none`,

        {

          method: 'PATCH',

          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },

          body: JSON.stringify(eventBody),

        },

      );

      if (res.ok) {

        const updated = await res.json();

        resourceEventId = updated.id;

      } else if (res.status !== 404) {

        return;

      }

    }



    if (!resourceEventId) {

      const res = await fetch(

        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,

        {

          method: 'POST',

          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },

          body: JSON.stringify(eventBody),

        },

      );

      if (!res.ok) return;

      const created = await res.json();

      resourceEventId = created.id;

    }



    if (resourceEventId) {

      await serviceClient

        .from('bookings')

        .update({ resource_google_event_id: resourceEventId })

        .eq('id', bookingId);

    }

  } catch (err) {

    console.error('[api][syncBookingToResourceCalendar] error:', err);

  }

}



/* â”€â”€ Booking upsert from DocPlanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function upsertBookingFromDP(

  serviceClient: any,

  companyId: string,

  dpBooking: any,

  mapping: any

): Promise<{ roomConflict: boolean }> {

  const patient = dpBooking.patient || {};

  const service = dpBooking.address_service || {};



  // Map DP status to Simplifica status

  const statusMap: Record<string, string> = {

    booked: 'confirmed',

    canceled: 'cancelled',

    not_appeared: 'cancelled',

  };



  const startTime = dpBooking.start_at || dpBooking.booked_at;

  const endTime = dpBooking.end_at;



  // â”€â”€ Client deduplication (cascade: email â†’ phone â†’ name) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Note: DocPlanner booking API does NOT return patient.id, so we deduplicate

  // by email â†’ phone â†’ create new. We store dp-dedup key in docplanner_patient_id

  // as a composite key for future re-matching.

  let clientId: string | null = null;

  let isNewClient = false;

  const tagId = await ensureDocplannerTag(serviceClient, companyId);



  const hasPatientData = patient.email || patient.phone || patient.name || patient.surname;

  if (hasPatientData) {

    const normalizedEmail = patient.email ? patient.email.toLowerCase().trim() : null;

    // Composite dedup key: phone digits â†’ email â†’ name|surname (mirrors handleImportPatients)

    const dpDigits = patient.phone ? patient.phone.replace(/\D/g, '') : null;

    const dpLast9  = dpDigits && dpDigits.length >= 9 ? dpDigits.slice(-9) : null;

    const dpKey    = dpLast9

      ?? normalizedEmail

      ?? (`${patient.name ?? ''}|${patient.surname ?? ''}`.toLowerCase().trim() || null);



    // Step 1: Find by docplanner_patient_id (composite key stored previously)

    if (dpKey) {

      const { data: existingByDp } = await serviceClient

        .from('clients')

        .select('id')

        .eq('company_id', companyId)

        .eq('docplanner_patient_id', dpKey)

        .maybeSingle();

      if (existingByDp) clientId = existingByDp.id;

    }



    // Step 2: Find by email (case-insensitive)

    if (!clientId && normalizedEmail) {

      const { data: existingByEmail } = await serviceClient

        .from('clients')

        .select('id')

        .eq('company_id', companyId)

        .ilike('email', normalizedEmail)

        .maybeSingle();



      if (existingByEmail) {

        clientId = existingByEmail.id;

        if (dpKey) {

          await serviceClient

            .from('clients')

            .update({ docplanner_patient_id: dpKey })

            .eq('id', clientId);

        }

        if (tagId) await tagRecord(serviceClient, tagId, clientId, 'client');

      }

    }



    // Step 3: Find by phone (last 9 digits, handles format differences)

    if (!clientId && dpLast9) {

      const { data: phoneCandidates } = await serviceClient

        .from('clients')

        .select('id, phone')

        .eq('company_id', companyId)

        .not('phone', 'is', null)

        .limit(1000);



      if (phoneCandidates) {

        const match = phoneCandidates.find((c: any) => {

          const cDigits = (c.phone || '').replace(/\D/g, '');

          return cDigits.length >= 9 && cDigits.slice(-9) === dpLast9;

        });

        if (match) {

          clientId = match.id;

          if (dpKey) {

            await serviceClient

              .from('clients')

              .update({ docplanner_patient_id: dpKey })

              .eq('id', clientId);

          }

          if (tagId) await tagRecord(serviceClient, tagId, clientId, 'client');

        }

      }

    }



    // Step 4: Create new client

    if (!clientId && (patient.name || patient.surname)) {

      const { data: newClient } = await serviceClient

        .from('clients')

        .insert({

          company_id: companyId,

          name: patient.name || '',

          surname: patient.surname || '',

          email: normalizedEmail,

          phone: patient.phone || null,

          docplanner_patient_id: dpKey,

        })

        .select('id')

        .single();



      if (newClient) {

        clientId = newClient.id;

        isNewClient = true;

        if (tagId) await tagRecord(serviceClient, tagId, newClient.id, 'client');

      }

    }

  }



  // â”€â”€ Service matching (exact â†’ fuzzy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let serviceId: string | null = null;

  if (service.name) {

    const svcName = service.name.trim();



    // Step 1: Exact match (case-insensitive)

    const { data: exactMatch } = await serviceClient

      .from('services')

      .select('id')

      .eq('company_id', companyId)

      .ilike('name', svcName)

      .maybeSingle();



    if (exactMatch) {

      serviceId = exactMatch.id;

    } else {

      // Step 2: Fuzzy â€” DP name contained in CRM name or vice versa

      const { data: fuzzyMatches } = await serviceClient

        .from('services')

        .select('id')

        .eq('company_id', companyId)

        .eq('is_active', true)

        .ilike('name', `%${svcName}%`)

        .limit(1);



      if (fuzzyMatches?.length) serviceId = fuzzyMatches[0].id;

    }

  }



  // â”€â”€ Room assignment (conflict-free) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const effectiveStatus = statusMap[dpBooking.status] || 'confirmed';

  const effectiveEndTime = endTime || startTime;

  const roomResult = effectiveStatus !== 'cancelled'

    ? await assignRoomForBooking(serviceClient, companyId, mapping.professional_id, startTime, effectiveEndTime)

    : { id: null, hadConflict: false };

  const resourceId = roomResult.id;



  // â”€â”€ Session type detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Primary: address_service.type field (Docplanner may expose 'video' for teleconsults)

  // Secondary: service name keywords

  // Tertiary: mapping-level is_online_address flag

  const addressServiceType = ((service as any).type || '').toLowerCase();

  const isOnlineByServiceType = ['video', 'online', 'virtual', 'phone', 'teleconsult', 'telemedicine'].includes(addressServiceType);

  const isOnlineByName = /video|online|virtual|teleconsult|telemedicin/i.test(service.name || '');

  const isOnlineByMapping = (mapping as any).is_online_address === true;

  const sessionType: string = (isOnlineByServiceType || isOnlineByName || isOnlineByMapping) ? 'online' : 'presencial';



  // â”€â”€ Upsert booking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const bookingData = {

    company_id: companyId,

    docplanner_booking_id: String(dpBooking.id),

    client_id: clientId,

    customer_name: [patient.name, patient.surname].filter(Boolean).join(' ') || 'DocPlanner Patient',

    customer_email: patient.email ? patient.email.toLowerCase().trim() : null,

    customer_phone: patient.phone || null,

    professional_id: mapping.professional_id,

    service_id: serviceId,

    start_time: startTime,

    end_time: effectiveEndTime,

    status: effectiveStatus,

    source: 'docplanner',

    notes: dpBooking.comment || null,

    resource_id: resourceId,

    session_type: sessionType,

  };



  // Check if booking already exists

  const { data: existing } = await serviceClient

    .from('bookings')

    .select('id, source, google_event_id, resource_google_event_id')

    .eq('company_id', companyId)

    .eq('docplanner_booking_id', String(dpBooking.id))

    .maybeSingle();



  let bookingId: string | null = null;

  let existingGoogleEventId: string | null = null;

  let existingResourceEventId: string | null = null;



  if (existing) {

    existingGoogleEventId = existing.google_event_id || null;

    existingResourceEventId = existing.resource_google_event_id || null;

    bookingId = existing.id;

    // Only update bookings that are still source='docplanner'

    // (don't overwrite bookings manually edited by staff)

    if (existing.source === 'docplanner' || existing.source === null) {

      const { error: updateError } = await serviceClient

        .from('bookings')

        .update(bookingData)

        .eq('id', existing.id);

      if (updateError) throw new Error(`Update failed: ${updateError.message}`);

    }

  } else {

    const { data: inserted, error: insertError } = await serviceClient

      .from('bookings')

      .insert(bookingData)

      .select('id')

      .single();

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

    if (inserted) bookingId = inserted.id;

  }



  // â”€â”€ Google Calendar sync (non-fatal) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (bookingId) {

    try {

      await syncBookingToGoogleCalendar(

        serviceClient,

        mapping.professional_id,

        bookingId,

        {

          customer_name: bookingData.customer_name,

          start_time: startTime,

          end_time: effectiveEndTime,

          notes: bookingData.notes,

          resource_id: resourceId,

        },

        existingGoogleEventId,

      );

      await syncBookingToResourceCalendar(

        serviceClient,

        companyId,

        bookingId,

        {

          customer_name: bookingData.customer_name,

          start_time: startTime,

          end_time: effectiveEndTime,

          notes: bookingData.notes,

          resource_id: resourceId,

        },

        existingResourceEventId,

      );

    } catch (e) {

      console.warn('[upsertBookingFromDP] Calendar sync failed (non-fatal):', e);

    }

  }



  return { roomConflict: roomResult.hadConflict };

}



/* â”€â”€ Import patients from DocPlanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**

 * Fetches bookings in monthly chunks across every configured doctor/address pair,

 * extracts unique patients, and upserts them into `clients`.

 * All matched/created clients are tagged with "Doctoralia".

 * Uses pagination (dpFetchAllItems) and returns diagnostics on failures.

 */

async function handleImportPatients(

  serviceClient: any,

  companyId: string

): Promise<Response> {

  const { data: integration, error: intError } = await serviceClient

    .from('docplanner_integrations')

    .select('facility_id, doctor_mappings')

    .eq('company_id', companyId)

    .single();



  if (intError || !integration) {

    return jsonResponse(400, { error: 'Integration not configured' });

  }

  if (!integration.facility_id) {

    return jsonResponse(400, { error: 'No facility selected â€” configure the integration first' });

  }



  const mappings = integration.doctor_mappings || [];

  if (!mappings.length) {

    return jsonResponse(400, { error: 'No doctor mappings configured â€” import doctors first' });

  }



  const token = await getValidToken(serviceClient, companyId);

  const tagId = await ensureDocplannerTag(serviceClient, companyId);



  // Build monthly date chunks: past 2 years â†’ future 6 months

  const now = new Date();

  const rangeStart = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);

  const rangeEnd   = new Date(now.getTime() + 6 * 30  * 24 * 60 * 60 * 1000);



  const chunks: { start: string; end: string }[] = [];

  const cursor = new Date(rangeStart);

  while (cursor < rangeEnd) {

    const chunkStart = cursor.toISOString().slice(0, 19) + 'Z';

    cursor.setMonth(cursor.getMonth() + 1);

    const chunkEnd = (cursor < rangeEnd ? cursor : rangeEnd).toISOString().slice(0, 19) + 'Z';

    chunks.push({ start: chunkStart, end: chunkEnd });

  }

  console.log(`[import-patients] ${chunks.length} monthly chunks, ${mappings.length} mapping(s)`);



  // Collect unique patients keyed by their DP patient ID

  const seen = new Map<string, any>();

  const diagnostics: string[] = [];

  let totalBookingsFetched = 0;

  let skippedMappings = 0;



  for (const mapping of mappings) {

    if (!mapping.dp_doctor_id) {

      diagnostics.push(`Mapping sin dp_doctor_id (professional_id=${mapping.professional_id}) â€” omitido`);

      skippedMappings++;

      continue;

    }



    // Resolve address_id: use stored value, or fetch from API

    let addressId = mapping.address_id;

    if (!addressId) {

      try {

        addressId = await refreshMappingAddress(

          serviceClient, companyId, token, integration.facility_id, mappings, mapping.dp_doctor_id);

      } catch (_) { /* ignore â€” will be flagged below */ }

    }



    if (!addressId) {

      diagnostics.push(`Doctor ${mapping.dp_doctor_id} sin address_id (no se pudo resolver) â€” omitido`);

      skippedMappings++;

      continue;

    }



    let mappingBookings = 0;

    let firstBookingLogged = false;

    let addressRetried = false;

    for (const chunk of chunks) {

      try {

        const chunkPath = `/facilities/${integration.facility_id}/doctors/${mapping.dp_doctor_id}/addresses/${addressId}/bookings?start=${chunk.start}&end=${chunk.end}&with=booking.patient`;

        const bookings = await dpFetchAllItems(token, chunkPath);

        mappingBookings += bookings.length;

        for (const b of bookings) {

          if (!firstBookingLogged && bookings.length > 0) {

            console.log('[import-patients] First booking keys:', Object.keys(b));

            console.log('[import-patients] First booking sample:', JSON.stringify(b).slice(0, 800));

            firstBookingLogged = true;

          }

          const p = b.patient ?? b._embedded?.patient ?? b.slot?.patient ?? null;

          if (p && (p.phone || p.email || p.name || p.surname)) {

            const pKey = (p.phone ? p.phone.replace(/\D/g, '') : null)

              ?? (p.email ? p.email.toLowerCase().trim() : null)

              ?? `${p.name ?? ''}|${p.surname ?? ''}`.toLowerCase().trim();

            if (pKey && !seen.has(pKey)) {

              seen.set(pKey, p);

            }

          }

        }

      } catch (e: any) {

        const msg = e?.message || String(e);

        // On 403 "address does not belong to this doctor", re-resolve once

        if (!addressRetried && msg.includes('403') && msg.includes('address')) {

          addressRetried = true;

          console.log(`[import-patients] 403 for doctor ${mapping.dp_doctor_id} with address ${addressId}, re-resolving...`);

          try {

            const newAddr = await refreshMappingAddress(

              serviceClient, companyId, token, integration.facility_id, mappings, mapping.dp_doctor_id);

            if (newAddr && newAddr !== addressId) {

              addressId = newAddr;

              // Retry current chunk with new address

              try {

                const retryPath = `/facilities/${integration.facility_id}/doctors/${mapping.dp_doctor_id}/addresses/${addressId}/bookings?start=${chunk.start}&end=${chunk.end}&with=booking.patient`;

                const bookings = await dpFetchAllItems(token, retryPath);

                mappingBookings += bookings.length;

                for (const b of bookings) {

                  const p = b.patient ?? b._embedded?.patient ?? b.slot?.patient ?? null;

                  if (p && (p.phone || p.email || p.name || p.surname)) {

                    const pKey = (p.phone ? p.phone.replace(/\D/g, '') : null)

                      ?? (p.email ? p.email.toLowerCase().trim() : null)

                      ?? `${p.name ?? ''}|${p.surname ?? ''}`.toLowerCase().trim();

                    if (pKey && !seen.has(pKey)) {

                      seen.set(pKey, p);

                    }

                  }

                }

                continue; // retry succeeded, skip to next chunk

              } catch (retryErr: any) {

                diagnostics.push(`Error doctor=${mapping.dp_doctor_id} chunk=${chunk.start} (retry): ${retryErr?.message || String(retryErr)}`);

              }

            }

          } catch (_) { /* re-resolve failed */ }

        }

        diagnostics.push(`Error doctor=${mapping.dp_doctor_id} chunk=${chunk.start}: ${msg}`);

      }

    }

    totalBookingsFetched += mappingBookings;

    console.log(`[import-patients] Doctor ${mapping.dp_doctor_id}: ${mappingBookings} booking(s), ${seen.size} unique patient(s) so far`);

  }



  console.log(`[import-patients] Total: ${totalBookingsFetched} bookings, ${seen.size} unique patients`);



  let imported = 0;  // new clients created

  let tagged   = 0;  // existing clients newly tagged



  for (const [dpPatientId, patient] of seen) {

    const normalizedEmail = patient.email ? patient.email.toLowerCase().trim() : null;

    let clientId: string | null = null;

    let alreadyTagged = false;



    // Step 1: by docplanner_patient_id

    const { data: byDpId } = await serviceClient

      .from('clients')

      .select('id')

      .eq('company_id', companyId)

      .eq('docplanner_patient_id', dpPatientId)

      .maybeSingle();

    if (byDpId) { clientId = byDpId.id; alreadyTagged = true; }



    // Step 2: by email

    if (!clientId && normalizedEmail) {

      const { data: byEmail } = await serviceClient

        .from('clients')

        .select('id')

        .eq('company_id', companyId)

        .ilike('email', normalizedEmail)

        .maybeSingle();

      if (byEmail) {

        clientId = byEmail.id;

        await serviceClient.from('clients').update({ docplanner_patient_id: dpPatientId }).eq('id', clientId);

      }

    }



    // Step 3: by phone (last 9 digits)

    if (!clientId && patient.phone) {

      const dpDigits = patient.phone.replace(/\D/g, '');

      const dpLast9 = dpDigits.length >= 9 ? dpDigits.slice(-9) : null;

      if (dpLast9) {

        const { data: phoneCandidates } = await serviceClient

          .from('clients')

          .select('id, phone')

          .eq('company_id', companyId)

          .not('phone', 'is', null)

          .limit(1000);

        if (phoneCandidates) {

          const match = phoneCandidates.find((c: any) => {

            const cDigits = (c.phone || '').replace(/\D/g, '');

            return cDigits.length >= 9 && cDigits.slice(-9) === dpLast9;

          });

          if (match) {

            clientId = match.id;

            await serviceClient.from('clients').update({ docplanner_patient_id: dpPatientId }).eq('id', clientId);

          }

        }

      }

    }



    // Step 4: create new client

    if (!clientId && (patient.name || patient.surname)) {

      const { data: newClient, error: insertError } = await serviceClient

        .from('clients')

        .insert({

          company_id: companyId,

          name: patient.name || '',

          surname: patient.surname || '',

          email: normalizedEmail,

          phone: patient.phone || null,

          docplanner_patient_id: dpPatientId,

        })

        .select('id')

        .single();



      if (insertError) {

        console.error('[import-patients] INSERT client failed:', {

          message: insertError.message,

          code: insertError.code,

          details: insertError.details,

          hint: insertError.hint,

          patient_key: dpPatientId,

          name: patient.name,

          email: normalizedEmail,

        });

        diagnostics.push(`INSERT failed for "${patient.name} ${patient.surname}": ${insertError.message}`);

      } else if (newClient) {

        clientId = newClient.id;

        imported++;

      }

    }



    if (clientId && tagId) {

      await tagRecord(serviceClient, tagId, clientId, 'client');

      if (!alreadyTagged) tagged++;

    }

  }



  return jsonResponse(200, {

    imported,

    tagged,

    total: seen.size,

    bookings_scanned: totalBookingsFetched,

    skipped_mappings: skippedMappings,

    errors: diagnostics,

    message: `${imported} paciente(s) importado(s), ${tagged} etiquetado(s) de ${seen.size} Ãºnicos encontrados (${totalBookingsFetched} reservas escaneadas)`,

  });

}



/* â”€â”€ Resolve correct addresses for all mapped doctors â”€â”€â”€â”€â”€â”€ */

/**

 * Re-queries DocPlanner to obtain the correct address_id for every

 * mapped doctor and persists the updated mappings.

 *

 * Use this after an initial import to fix cases where all doctors

 * were incorrectly assigned the same address (e.g. from the first

 * doctor in the list).

 */

async function handleResolveAddresses(

  serviceClient: any,

  companyId: string,

): Promise<Response> {

  const { data: integration, error: intErr } = await serviceClient

    .from('docplanner_integrations')

    .select('*')

    .eq('company_id', companyId)

    .single();



  if (intErr || !integration) return jsonResponse(400, { error: 'Integration not configured' });

  if (!integration.facility_id) return jsonResponse(400, { error: 'No facility selected' });



  const mappings: any[] = integration.doctor_mappings || [];

  if (!mappings.length) return jsonResponse(400, { error: 'No doctor mappings configured' });



  const token = await getValidToken(serviceClient, companyId);

  let resolved = 0;

  let unchanged = 0;

  let failed = 0;

  const details: string[] = [];



  for (const mapping of mappings) {

    if (!mapping.dp_doctor_id) continue;

    try {

      const newAddr = await resolveAddressForDoctor(token, integration.facility_id, mapping.dp_doctor_id);

      if (!newAddr) {

        details.push(`${mapping.dp_doctor_name || mapping.dp_doctor_id}: no addresses found`);

        failed++;

        continue;

      }

      if (newAddr === mapping.address_id) {

        unchanged++;

      } else {

        details.push(`${mapping.dp_doctor_name || mapping.dp_doctor_id}: ${mapping.address_id || '(empty)'} â†’ ${newAddr}`);

        mapping.address_id = newAddr;

        resolved++;

      }

    } catch (e) {

      details.push(`${mapping.dp_doctor_name || mapping.dp_doctor_id}: Error â€” ${String(e)}`);

      failed++;

    }

  }



  // Persist updated mappings

  await serviceClient

    .from('docplanner_integrations')

    .update({ doctor_mappings: mappings, updated_at: new Date().toISOString() })

    .eq('company_id', companyId);



  return jsonResponse(200, {

    resolved,

    unchanged,

    failed,

    total: mappings.length,

    details,

    message: `${resolved} address(es) updated, ${unchanged} unchanged, ${failed} failed`,

  });

}



/* â”€â”€ Import doctors from DocPlanner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function handleImportDoctors(

  serviceClient: any,

  companyId: string,

  body: any

): Promise<Response> {

  const { facility_id } = body;

  if (!facility_id) return jsonResponse(400, { error: 'facility_id is required' });



  const token = await getValidToken(serviceClient, companyId);

  const data = await dpFetch(token, `/facilities/${facility_id}/doctors`);

  const doctors = data?._items || [];

  if (!doctors.length) {

    return jsonResponse(200, { imported: 0, skipped: 0, total: 0, mappings: [], message: 'No doctors found in facility' });

  }



  const tagId = await ensureDocplannerTag(serviceClient, companyId);

  let imported = 0;

  let skipped = 0;

  const mappings: any[] = [];



  // Pre-load existing doctor_mappings from the integration config so we respect

  // any manual associations the user already saved in the UI.

  const { data: integrationRow } = await serviceClient

    .from('docplanner_integrations')

    .select('doctor_mappings')

    .eq('company_id', companyId)

    .maybeSingle();

  const existingMappings: Record<string, string> = {};

  for (const m of (integrationRow?.doctor_mappings ?? [])) {

    if (m.dp_doctor_id && m.professional_id) {

      existingMappings[String(m.dp_doctor_id)] = m.professional_id;

    }

  }



  for (const doctor of doctors) {

    const dpDoctorId = String(doctor.id);

    const displayName = [doctor.name, doctor.surname].filter(Boolean).join(' ') || doctor.name || 'Unknown';



    // Step 0: Respect any manual mapping already saved by the user in the UI

    const mappedProfId = existingMappings[dpDoctorId];

    if (mappedProfId) {

      // Ensure the professional has docplanner_doctor_id set and is active

      await serviceClient

        .from('professionals')

        .update({ docplanner_doctor_id: dpDoctorId, is_active: true })

        .eq('id', mappedProfId);

      skipped++;

      const addrData = await dpFetch(token, `/facilities/${facility_id}/doctors/${dpDoctorId}/addresses`).catch(() => null);

      const addresses = addrData?._items || [];

      const addressId = addresses[0] ? String(addresses[0].id) : '';

      mappings.push({ dp_doctor_id: dpDoctorId, dp_doctor_name: displayName, professional_id: mappedProfId, address_id: addressId });

      continue;

    }



    // Step 1: Check by docplanner_doctor_id

    const { data: existingByDpId } = await serviceClient

      .from('professionals')

      .select('id, display_name')

      .eq('company_id', companyId)

      .eq('docplanner_doctor_id', dpDoctorId)

      .maybeSingle();



    let professionalId: string;



    if (existingByDpId) {

      professionalId = existingByDpId.id;

      // Ensure professional is active (may have been manually deactivated)

      await serviceClient

        .from('professionals')

        .update({ is_active: true })

        .eq('id', professionalId);

      skipped++;

    } else {

      // Step 2: Try to match by name (case-insensitive)

      const { data: byName } = await serviceClient

        .from('professionals')

        .select('id, display_name')

        .eq('company_id', companyId)

        .ilike('display_name', displayName)

        .maybeSingle();



      if (byName) {

        professionalId = byName.id;

        await serviceClient

          .from('professionals')

          .update({ docplanner_doctor_id: dpDoctorId, is_active: true })

          .eq('id', byName.id);

        skipped++;

        if (tagId) await tagRecord(serviceClient, tagId, byName.id, 'professional');

      } else {

        // Step 3: Create new professional (user_id null â€” external import)

        const { data: newProf, error: profErr } = await serviceClient

          .from('professionals')

          .insert({

            company_id: companyId,

            user_id: null,

            display_name: displayName,

            title: doctor.specialization?.name || null,

            is_active: true,

            docplanner_doctor_id: dpDoctorId,

          })

          .select('id')

          .single();



        if (profErr || !newProf) {

          console.error(`[import-doctors] Failed to create professional for ${displayName}:`, profErr);

          continue;

        }



        professionalId = newProf.id;

        imported++;

        if (tagId) await tagRecord(serviceClient, tagId, newProf.id, 'professional');

      }

    }



    // Fetch addresses for auto-mapping

    let addressId = '';

    try {

      const addrData = await dpFetch(token, `/facilities/${facility_id}/doctors/${dpDoctorId}/addresses`);

      const addresses = addrData?._items || [];

      if (addresses[0]) addressId = String(addresses[0].id);

    } catch { /* address fetch is best-effort */ }



    mappings.push({

      dp_doctor_id: dpDoctorId,

      dp_doctor_name: displayName,

      professional_id: professionalId,

      address_id: addressId,

    });

  }



  // Auto-save generated mappings to integration config

  if (mappings.length) {

    await serviceClient

      .from('docplanner_integrations')

      .update({

        doctor_mappings: mappings,

        facility_id: facility_id,

        updated_at: new Date().toISOString(),

      })

      .eq('company_id', companyId);

  }



  return jsonResponse(200, {

    imported,

    skipped,

    total: doctors.length,

    mappings,

    message: `${imported} professionals imported, ${skipped} already existed`,

  });

}



/* â”€â”€ Response helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

let _corsHeaders: HeadersInit = {};



function jsonResponse(status: number, body: any): Response {

  return new Response(JSON.stringify(body), {

    status,

    headers: { ..._corsHeaders, 'Content-Type': 'application/json' },

  });

}



/* â”€â”€ Main handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function handleListAllServices(serviceClient: any, companyId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const { data: integration } = await serviceClient
    .from('docplanner_integrations').select('facility_id, doctor_mappings').eq('company_id', companyId).single();
  if (!integration?.facility_id) throw new Error('No facility configured');

  const facilityId = integration.facility_id;
  const mappings = integration.doctor_mappings || [];
  const now = new Date();
  const fmtDate = (d: Date) => d.toISOString().slice(0, 19) + 'Z';
  const startStr = fmtDate(new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000));
  const endStr = fmtDate(new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000));
  const seen = new Set<string>();
  const allServices: any[] = [];

  for (const mapping of mappings) {
    const addrId = mapping.address_id;
    if (!addrId) continue;
    try {
      const path = `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses/${addrId}/bookings?start=${startStr}&end=${endStr}&with=booking.address_service`;
      const data = await dpFetchAllItems(token, path);
      const bookings = data?.data || data || [];
      for (const bk of bookings) {
        const svc = bk.address_service;
        if (!svc?.name) continue;
        const key = `${mapping.dp_doctor_id}|${addrId}|${svc.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allServices.push({
          id: svc.id || svc.name,
          name: svc.name,
          address_id: addrId,
          dp_doctor_id: mapping.dp_doctor_id,
          type: svc.type || undefined,
        });
      }
    } catch (e: any) {
      // skip failed doctors
    }
  }

  return jsonResponse(200, { services: allServices });
}

async function handleBackfillServices(serviceClient: any, companyId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const { data: integration } = await serviceClient
    .from('docplanner_integrations').select('facility_id, doctor_mappings').eq('company_id', companyId).single();
  if (!integration?.facility_id) throw new Error('No facility configured');

  const facilityId = integration.facility_id;
  const mappings = integration.doctor_mappings || [];
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date) => d.toISOString().slice(0, 19) + 'Z';
  const startStr = fmtDate(oneYearAgo);
  const endStr = fmtDate(new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000));

  let updated = 0;
  let skipped = 0;
  let noService = 0;
  const errors: string[] = [];
  const unmappedServices = new Set<string>();

  for (const mapping of mappings) {
    const addrId = mapping.address_id;
    if (!addrId) continue;
    const svcMappings = mapping.service_mappings || [];

    try {
      const path = `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses/${addrId}/bookings?start=${startStr}&end=${endStr}&with=booking.address_service&limit=200`;
      const data = await dpFetchAllItems(token, path);
      const bookings = data?.data || data || [];

      for (const bk of bookings) {
        const dpSvcName = bk.address_service?.name;
        if (!dpSvcName) { noService++; continue; }

        const match = svcMappings.find((sm: any) =>
          sm.dp_service_name?.trim().toLowerCase().normalize('NFD') === dpSvcName.trim().toLowerCase().normalize('NFD')
        );
        if (match?.crm_service_id) {
          const { error } = await serviceClient.from('bookings')
            .update({ service_id: match.crm_service_id, dp_service_unmapped: false, updated_at: now.toISOString() })
            .eq('company_id', companyId)
            .eq('docplanner_booking_id', String(bk.id))
            .select('id');
          if (!error) updated++; else skipped++;
        } else {
          const svcNames = svcMappings.map((sm: any) => sm.dp_service_name).join(', ');
          unmappedServices.add(`${mapping.dp_doctor_name || mapping.dp_doctor_id}: "${dpSvcName}" (mapeados: [${svcNames || 'ninguno'}])`);
          skipped++;
        }
      }
    } catch (e: any) {
      errors.push(`Doctor ${mapping.dp_doctor_id}: ${e.message || e}`);
    }
  }

  return jsonResponse(200, { updated, skipped, noService, total: updated + skipped + noService, errors, unmappedServices: [...unmappedServices].sort() });
}

// v47 - backfill with unmappedServices
serve(async (req) => {

  const corsHeaders = getCorsHeaders(req);

  _corsHeaders = corsHeaders;

  const optionsResponse = handleCorsOptions(req);

  if (optionsResponse) return optionsResponse;



  if (req.method !== 'POST') {

    return jsonResponse(405, { error: 'Method not allowed' });

  }



  // Rate limit

  const ip = getClientIP(req);

  const rl = await checkRateLimit(`docplanner-api:${ip}`, 100, 60_000);

  if (!rl.allowed) {

    return new Response(JSON.stringify({ error: 'Too many requests' }), {

      status: 429,

      headers: { ...corsHeaders, ...getRateLimitHeaders(rl), 'Content-Type': 'application/json' },

    });

  }



  // Auth: validate JWT

  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {

    return jsonResponse(401, { error: 'Missing authorization' });

  }



  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {

    global: { headers: { Authorization: authHeader } },

  });



  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {

    return jsonResponse(401, { error: 'Invalid token' });

  }



  // Use service role to bypass RLS on company_members â€” JWT was already verified above

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);



  // Resolve internal user ID (public.users.id â‰  auth.uid() â€” auth UUID lives in auth_user_id)

  const { data: publicUser, error: publicUserError } = await serviceClient

    .from('users')

    .select('id')

    .eq('auth_user_id', user.id)

    .maybeSingle();



  if (publicUserError || !publicUser) {

    console.log('[docplanner-api] public user lookup failed', { authId: user.id, error: publicUserError?.message ?? null });

    return jsonResponse(403, { error: 'User not found' });

  }



  // Get user's company via company_members (join app_roles for role name)

  const { data: membership, error: membershipError } = await serviceClient

    .from('company_members')

    .select('company_id, app_roles(name)')

    .eq('user_id', publicUser.id)

    .eq('status', 'active')

    .limit(1)

    .maybeSingle();



  console.log('[docplanner-api] membership lookup', {

    authUserId: user.id,

    internalUserId: publicUser.id,

    membership: JSON.stringify(membership),

    error: membershipError?.message ?? null,

  });



  if (membershipError || !membership) {

    return jsonResponse(403, { error: 'Not a member of any company' });

  }



  const roleName = (membership.app_roles as any)?.name as string | undefined;



  // Only owner/admin can manage integrations

  if (!roleName || !['owner', 'admin'].includes(roleName)) {

    console.log('[docplanner-api] insufficient role', { roleName });

    return jsonResponse(403, { error: 'Insufficient permissions â€” requires owner or admin role' });

  }



  const companyId = membership.company_id;



  let body: any;

  try {

    body = await req.json();

  } catch {

    return jsonResponse(400, { error: 'Invalid JSON body' });

  }



  const { action } = body;


  try {

    switch (action) {



      case 'list-services': {
        const token = await getValidToken(serviceClient, companyId);
        const { facility_id, doctor_id, address_id } = body;
        const path = `/facilities/${facility_id}/doctors/${doctor_id}/addresses/${address_id}/services`;
        const servicesData = await dpFetchAllItems(token, path);
        const services = servicesData?.data || servicesData || [];
        return jsonResponse(200, { services });
      }

      case 'save-credentials':
        // Stricter rate limit for credential operations

        const credRl = await checkRateLimit(`docplanner-cred:${ip}`, 5, 60_000);

        if (!credRl.allowed) {

          return new Response(JSON.stringify({ error: 'Too many credential attempts' }), {

            status: 429,

            headers: { ...corsHeaders, ...getRateLimitHeaders(credRl), 'Content-Type': 'application/json' },

          });

        }

        return await handleSaveCredentials(serviceClient, companyId, body);



      case 'test-connection':

        return await handleTestConnection(serviceClient, companyId);



      case 'disconnect':

        return await handleDisconnect(serviceClient, companyId);



      case 'get-facilities':

        return await handleGetFacilities(serviceClient, companyId);



      case 'get-doctors':

        return await handleGetDoctors(serviceClient, companyId, body);



      case 'get-addresses':

        return await handleGetAddresses(serviceClient, companyId, body);



      case 'list-all-services':

        return await handleListAllServices(serviceClient, companyId);



      case 'get-bookings':

        return await handleGetBookings(serviceClient, companyId, body);



      case 'save-config':

        return await handleSaveConfig(serviceClient, companyId, body);



      case 'sync-bookings':

        return await handleSyncBookings(serviceClient, companyId);



      case 'backfill-services':

        return await handleBackfillServices(serviceClient, companyId);



      case 'import-doctors':
        return await handleImportDoctors(serviceClient, companyId, body);



      case 'import-patients':

        return await handleImportPatients(serviceClient, companyId);



      case 'resolve-addresses':

        return await handleResolveAddresses(serviceClient, companyId);



      default:

        return jsonResponse(400, { error: `Unknown action: ${action}` });

    }

  } catch (e) {

    console.error(`[docplanner-api] Action "${action}" error:`, e);

    return jsonResponse(500, { error: String(e) });

  }

});

