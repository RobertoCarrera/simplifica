// @ts-nocheck
// ================================================================
// Edge Function: docplanner-sync-cron
// ================================================================
// Scheduled auto-sync: pulls bookings from DocPlanner for all
// companies with auto_sync enabled.
//
// Intended to run on a schedule via Supabase Edge Functions cron
// (every 15 minutes). Can also be triggered manually from the UI.
//
// Auth:
//   - Cron: Authorization header with service_role key
//   - Manual: JWT Bearer token (owner/admin validated)
// ================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { decrypt as decryptGoogleToken, encrypt as encryptGoogleToken, isEncrypted as isGoogleTokenEncrypted } from '../_shared/crypto-utils.ts';
/* ── env ─────────────────────────────────────────────── */ const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');
const OAUTH_ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[docplanner-sync-cron] ENCRYPTION_KEY must be at least 32 characters');
}
/* ── DocPlanner constants ────────────────────────────── */ const DP_DOMAIN = 'www.doctoralia.es';
const DP_BASE_URL = `https://${DP_DOMAIN}/api/v3/integration`;
const DP_TOKEN_URL = `https://${DP_DOMAIN}/oauth/v2/token`;
/* ── AES-256-GCM helpers ─────────────────────────────── */ async function getAesKey() {
  const keyData = new TextEncoder().encode(ENCRYPTION_KEY.slice(0, 32));
  return crypto.subtle.importKey('raw', keyData, {
    name: 'AES-GCM'
  }, false, [
    'encrypt',
    'decrypt'
  ]);
}
async function encrypt(plaintext) {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv
  }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}
async function decrypt(encryptedBase64) {
  const key = await getAesKey();
  const combined = Uint8Array.from(atob(encryptedBase64), (c)=>c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv
  }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
/* ── OAuth token management ──────────────────────────── */ async function getAccessToken(clientId, clientSecret) {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(DP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=integration'
  });
  if (!res.ok) {
    const body = await res.text().catch(()=>'');
    throw new Error(`DocPlanner auth failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 86400
  };
}
async function getValidToken(serviceClient, integration) {
  const now = new Date();
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  if (integration.access_token_encrypted && expiresAt && expiresAt > fiveMinFromNow) {
    return await decrypt(integration.access_token_encrypted);
  }
  const clientId = await decrypt(integration.client_id_encrypted);
  const clientSecret = await decrypt(integration.client_secret_encrypted);
  const tokenData = await getAccessToken(clientId, clientSecret);
  const encToken = await encrypt(tokenData.access_token);
  const newExpiry = new Date(now.getTime() + tokenData.expires_in * 1000);
  await serviceClient.from('docplanner_integrations').update({
    access_token_encrypted: encToken,
    token_expires_at: newExpiry.toISOString(),
    updated_at: now.toISOString()
  }).eq('id', integration.id);
  return tokenData.access_token;
}
/* ── DocPlanner fetch helper ─────────────────────────── */ async function dpFetch(token, path) {
  const url = `${DP_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error(`DP API GET ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return await res.json();
}
/* ── Tag helpers ──────────────────────────────────────── */ async function ensureDocplannerTag(serviceClient, companyId) {
  const { data: existing } = await serviceClient.from('global_tags').select('id').eq('company_id', companyId).ilike('name', 'doctoralia').maybeSingle();
  if (existing) return existing.id;
  const { data: newTag, error } = await serviceClient.from('global_tags').insert({
    company_id: companyId,
    name: 'Doctoralia',
    color: '#00b8a9',
    category: 'Integración',
    scope: [
      'clients',
      'professionals'
    ]
  }).select('id').single();
  if (error) {
    console.error('[ensureDocplannerTag] Failed to create tag:', error);
    return null;
  }
  return newTag.id;
}
async function tagRecord(serviceClient, tagId, recordId, recordType) {
  if (recordType === 'client') {
    // Use clients_tags (the table the Angular frontend reads from)
    await serviceClient.from('clients_tags').upsert({
      tag_id: tagId,
      client_id: recordId
    }, {
      onConflict: 'client_id,tag_id',
      ignoreDuplicates: true
    });
  } else {
    await serviceClient.from('item_tags').upsert({
      tag_id: tagId,
      record_id: recordId,
      record_type: recordType
    }, {
      ignoreDuplicates: true
    });
  }
}
/* ── Google Calendar sync ────────────────────────────── */ async function getGoogleAccessToken(serviceClient, userId) {
  if (!OAUTH_ENCRYPTION_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  const { data: integration } = await serviceClient.from('integrations').select('id, access_token, refresh_token, expires_at').eq('user_id', userId).eq('provider', 'google_calendar').maybeSingle();
  if (!integration) return null;
  const storedAccess = OAUTH_ENCRYPTION_KEY && isGoogleTokenEncrypted(integration.access_token) ? await decryptGoogleToken(integration.access_token, OAUTH_ENCRYPTION_KEY) : integration.access_token;
  const storedRefresh = integration.refresh_token && OAUTH_ENCRYPTION_KEY && isGoogleTokenEncrypted(integration.refresh_token) ? await decryptGoogleToken(integration.refresh_token, OAUTH_ENCRYPTION_KEY) : integration.refresh_token;
  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    if (!storedRefresh) return null;
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: storedRefresh,
        grant_type: 'refresh_token'
      })
    });
    const tokens = await refreshRes.json();
    if (tokens.error) {
      console.error('[gcal] Token refresh error:', tokens.error);
      return null;
    }
    const newExpiry = new Date(now.getTime() + tokens.expires_in * 1000);
    const encryptedNew = OAUTH_ENCRYPTION_KEY ? await encryptGoogleToken(tokens.access_token, OAUTH_ENCRYPTION_KEY) : tokens.access_token;
    await serviceClient.from('integrations').update({
      access_token: encryptedNew,
      expires_at: newExpiry.toISOString(),
      updated_at: now.toISOString()
    }).eq('id', integration.id);
    return tokens.access_token;
  }
  return storedAccess;
}
async function syncBookingToGoogleCalendar(serviceClient, companyId, professionalId, bookingId, bookingData, existingGoogleEventId, ownerUserId, emailPrefs = {}) {
  if (!professionalId) {
    console.warn('[gcal] syncBookingToGoogleCalendar: no professionalId, skipping', {
      bookingId
    });
    return;
  }
  // Get professional's calendar ID
  const { data: prof } = await serviceClient.from('professionals').select('google_calendar_id, display_name').eq('id', professionalId).maybeSingle();
  if (!prof?.google_calendar_id) {
    console.warn('[gcal] syncBookingToGoogleCalendar: professional has no google_calendar_id, skipping', {
      bookingId,
      professionalId
    });
    return;
  }
  if (!ownerUserId) {
    console.warn('[gcal] syncBookingToGoogleCalendar: no owner found for company, skipping', {
      bookingId,
      companyId
    });
    return;
  }
  console.log('[gcal] syncBookingToGoogleCalendar: fetching token for owner', {
    bookingId,
    ownerUserId
  });
  const accessToken = await getGoogleAccessToken(serviceClient, ownerUserId);
  if (!accessToken) {
    console.warn('[gcal] syncBookingToGoogleCalendar: no valid access token for owner, skipping', {
      bookingId,
      ownerUserId
    });
    return;
  }
  const calendarId = prof.google_calendar_id;
  const attendees = [];
  if (bookingData.customer_email) attendees.push({
    email: bookingData.customer_email
  });
  const eventBody = {
    summary: `${bookingData.customer_name} — ${prof.display_name}`,
    description: bookingData.notes || undefined,
    start: {
      dateTime: bookingData.start_time,
      timeZone: 'Europe/Madrid'
    },
    end: {
      dateTime: bookingData.end_time || bookingData.start_time,
      timeZone: 'Europe/Madrid'
    },
    attendees: attendees.length ? attendees : undefined
  };
  const sendUpdateMode = (emailPrefs.google_calendar_invite !== false) ? 'all' : 'none';
  try {
    let googleEventId = null;
    if (existingGoogleEventId) {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingGoogleEventId)}?sendUpdates=none`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventBody)
      });
      if (res.ok) {
        const updated = await res.json();
        googleEventId = updated.id;
      } else {
        const err = await res.json().catch(()=>({}));
        console.error('[gcal] PATCH event error:', err);
        // If event was deleted in GCal, fall through to create a new one
        if (res.status !== 404) return;
      }
    }
    if (!googleEventId) {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdateMode}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventBody)
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        console.error('[gcal] POST event error:', err);
        return;
      }
      const created = await res.json();
      googleEventId = created.id;
    }
    if (googleEventId) {
      await serviceClient.from('bookings').update({
        google_event_id: googleEventId
      }).eq('id', bookingId);
    }
  } catch (err) {
    console.error('[gcal] syncBookingToGoogleCalendar error:', err);
  }
}
/* ── Resource (room) Google Calendar sync ───────────── */ async function syncBookingToResourceCalendar(serviceClient, companyId, bookingId, bookingData, existingResourceEventId, ownerUserId) {
  if (!bookingData.resource_id) {
    console.warn('[gcal] syncBookingToResourceCalendar: no resource_id, skipping', {
      bookingId
    });
    return;
  }
  const { data: resource } = await serviceClient.from('resources').select('google_calendar_id').eq('id', bookingData.resource_id).maybeSingle();
  if (!resource?.google_calendar_id) {
    console.warn('[gcal] syncBookingToResourceCalendar: resource has no google_calendar_id, skipping', {
      bookingId,
      resourceId: bookingData.resource_id
    });
    return;
  }
  if (!ownerUserId) {
    console.warn('[gcal] syncBookingToResourceCalendar: no owner found for company, skipping', {
      bookingId,
      companyId
    });
    return;
  }
  console.log('[gcal] syncBookingToResourceCalendar: fetching token for owner', {
    bookingId,
    ownerUserId
  });
  const accessToken = await getGoogleAccessToken(serviceClient, ownerUserId);
  if (!accessToken) {
    console.warn('[gcal] syncBookingToResourceCalendar: no valid access token for owner, skipping', {
      bookingId,
      ownerUserId
    });
    return;
  }
  const calendarId = resource.google_calendar_id;
  const eventBody = {
    summary: bookingData.customer_name,
    description: bookingData.notes || undefined,
    start: {
      dateTime: bookingData.start_time,
      timeZone: 'Europe/Madrid'
    },
    end: {
      dateTime: bookingData.end_time || bookingData.start_time,
      timeZone: 'Europe/Madrid'
    },
    extendedProperties: {
      shared: {
        simplificaBookingId: bookingId,
        source: 'resource_sync'
      }
    }
  };
  try {
    let resourceEventId = null;
    if (existingResourceEventId) {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingResourceEventId)}?sendUpdates=none`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventBody)
      });
      if (res.ok) {
        const updated = await res.json();
        resourceEventId = updated.id;
      } else if (res.status !== 404) {
        console.error('[gcal] syncBookingToResourceCalendar PATCH error:', res.status);
        return;
      }
    // 404 → event deleted externally, fall through to create
    }
    if (!resourceEventId) {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventBody)
      });
      if (!res.ok) {
        console.error('[gcal] syncBookingToResourceCalendar POST error:', res.status);
        return;
      }
      const created = await res.json();
      resourceEventId = created.id;
    }
    if (resourceEventId) {
      await serviceClient.from('bookings').update({
        resource_google_event_id: resourceEventId
      }).eq('id', bookingId);
    }
  } catch (err) {
    console.error('[gcal] syncBookingToResourceCalendar error:', err);
  }
}
/* ── Room assignment (conflict-free) ────────────────── */ async function assignRoomForBooking(serviceClient, companyId, professionalId, startTime, endTime) {
  const { data: professional } = await serviceClient.from('professionals').select('default_resource_id').eq('id', professionalId).maybeSingle();
  const hasConflict = async (resourceId)=>{
    const { data: conflicts } = await serviceClient.from('bookings').select('id').eq('resource_id', resourceId).neq('status', 'cancelled').lt('start_time', endTime).gt('end_time', startTime).limit(1);
    return (conflicts?.length ?? 0) > 0;
  };
  // If professional has a fixed room, try it first
  if (professional?.default_resource_id) {
    if (!await hasConflict(professional.default_resource_id)) {
      return professional.default_resource_id;
    }
  }
  // Find any available active room (skip fixed room already checked above)
  let roomsQuery = serviceClient.from('resources').select('id').eq('company_id', companyId).eq('type', 'room').eq('is_active', true);
  if (professional?.default_resource_id) {
    roomsQuery = roomsQuery.neq('id', professional.default_resource_id);
  }
  const { data: rooms } = await roomsQuery;
  if (rooms) {
    for (const room of rooms){
      if (!await hasConflict(room.id)) return room.id;
    }
  }
  return null; // all rooms occupied
}
/* ── Booking upsert ──────────────────────────────────── */ async function upsertBookingFromDP(serviceClient, companyId, dpBooking, mapping, ownerUserId, emailPrefs = {}) {
  const patient = dpBooking.patient || {};
  const service = dpBooking.address_service || {};
  const statusMap = {
    booked: 'confirmed',
    confirmed: 'confirmed',
    pending: 'confirmed',
    canceled: 'cancelled',
    not_appeared: 'cancelled'
  };
  const startTime = dpBooking.start_at || dpBooking.booked_at;
  const endTime = dpBooking.end_at;
  // ── Client deduplication (4-step cascade) ──────────────
  let clientId = null;
  const tagId = await ensureDocplannerTag(serviceClient, companyId);
  if (patient.id) {
    const normalizedEmail = patient.email ? patient.email.toLowerCase().trim() : null;
    // Step 1: Find by docplanner_patient_id (exact)
    const { data: existingByDp } = await serviceClient.from('clients').select('id').eq('company_id', companyId).eq('docplanner_patient_id', String(patient.id)).maybeSingle();
    if (existingByDp) {
      clientId = existingByDp.id;
    }
    // Step 2: Find by email (case-insensitive)
    if (!clientId && normalizedEmail) {
      const { data: existingByEmail } = await serviceClient.from('clients').select('id').eq('company_id', companyId).ilike('email', normalizedEmail).maybeSingle();
      if (existingByEmail) {
        clientId = existingByEmail.id;
        await serviceClient.from('clients').update({
          docplanner_patient_id: String(patient.id)
        }).eq('id', clientId);
        if (tagId) await tagRecord(serviceClient, tagId, clientId, 'client');
      }
    }
    // Step 3: Find by phone (last 9 digits, handles format differences)
    if (!clientId && patient.phone) {
      const dpDigits = patient.phone.replace(/\D/g, '');
      const dpLast9 = dpDigits.length >= 9 ? dpDigits.slice(-9) : null;
      if (dpLast9) {
        const { data: phoneCandidates } = await serviceClient.from('clients').select('id, phone').eq('company_id', companyId).not('phone', 'is', null).limit(100);
        if (phoneCandidates) {
          const match = phoneCandidates.find((c)=>{
            const cDigits = (c.phone || '').replace(/\D/g, '');
            return cDigits.length >= 9 && cDigits.slice(-9) === dpLast9;
          });
          if (match) {
            clientId = match.id;
            await serviceClient.from('clients').update({
              docplanner_patient_id: String(patient.id)
            }).eq('id', clientId);
            if (tagId) await tagRecord(serviceClient, tagId, clientId, 'client');
          }
        }
      }
    }
    // Step 4: Create new client
    if (!clientId && (patient.name || patient.surname)) {
      const hasContactInfo = !!(normalizedEmail || patient.phone);
      if (!hasContactInfo) {
        // No phone AND no email: look for an existing INACTIVE pending client
        // with the same name+surname (synthetic ID deduplication).
        // This prevents creating multiple pending records for the same patient
        // when DocPlanner sends bookings with different "name|surname" synthetic IDs.
        const { data: existingPending } = await serviceClient.from('clients').select('id').eq('company_id', companyId).eq('is_active', false).ilike('name', patient.name || '').ilike('surname', patient.surname || '').limit(1);
        if (existingPending) {
          // Reuse the existing pending client — just update its docplanner_patient_id
          await serviceClient.from('clients').update({
            docplanner_patient_id: String(patient.id)
          }).eq('id', existingPending[0].id);
          clientId = existingPending[0].id;
        }
      }
      if (!clientId) {
        // No existing pending match — create a new one
        const { data: newClient } = await serviceClient.from('clients').insert({
          company_id: companyId,
          name: patient.name || '',
          surname: patient.surname || '',
          email: normalizedEmail,
          phone: patient.phone || null,
          docplanner_patient_id: String(patient.id),
          is_active: hasContactInfo,
          metadata: hasContactInfo ? {} : {
            pending_docplanner_import: true
          }
        }).select('id').single();
        if (newClient) {
          clientId = newClient.id;
          if (tagId && hasContactInfo) await tagRecord(serviceClient, tagId, newClient.id, 'client');
        }
      }
    }
  }
  // ── Service matching (exact → fuzzy) ───────────────────
  let serviceId = null;
  if (service.name) {
    const svcName = service.name.trim();
    const { data: exactMatch } = await serviceClient.from('services').select('id').eq('company_id', companyId).ilike('name', svcName).maybeSingle();
    if (exactMatch) {
      serviceId = exactMatch.id;
    } else {
      const { data: fuzzyMatches } = await serviceClient.from('services').select('id').eq('company_id', companyId).eq('is_active', true).ilike('name', `%${svcName}%`).limit(1);
      if (fuzzyMatches?.length) serviceId = fuzzyMatches[0].id;
    }
  }
  // ── Session type detection ─────────────────────────────
  // Primary: address_service.type field (Docplanner may expose 'video' for teleconsults)
  // Secondary: service name keywords
  // Tertiary: mapping-level is_online_address flag
  const addressServiceType = (service.type || '').toLowerCase();
  const isOnlineByServiceType = [
    'video',
    'online',
    'virtual',
    'phone',
    'teleconsult',
    'telemedicine'
  ].includes(addressServiceType);
  const isOnlineByName = /video|online|virtual|teleconsult|telemedicin/i.test(service.name || '');
  const isOnlineByMapping = mapping.is_online_address === true;
  const sessionType = isOnlineByServiceType || isOnlineByName || isOnlineByMapping ? 'online' : 'presencial';
  const effectiveStatus = statusMap[dpBooking.status] || 'confirmed';
  // ── Check for existing booking (preserve room + GCal IDs) ──
  const { data: existing } = await serviceClient.from('bookings').select('id, resource_id, google_event_id, resource_google_event_id').eq('company_id', companyId).eq('docplanner_booking_id', String(dpBooking.id)).maybeSingle();
  // ── Room assignment: only for NEW bookings ─────────────
  // Re-running assignRoomForBooking on existing bookings causes a
  // ping-pong: the booking finds ITSELF as a conflict in its current
  // room, gets moved to a new room, creates a new GCal event, and
  // orphans the old one. Repeat every sync → calendar duplicates.
  let resourceId = null;
  if (existing) {
    // Keep the room already assigned
    resourceId = existing.resource_id;
  } else if (effectiveStatus !== 'cancelled') {
    resourceId = await assignRoomForBooking(serviceClient, companyId, mapping.professional_id, startTime, endTime || startTime);
    if (resourceId === null) {
      console.warn(`[sync-cron] No room assigned for booking ${dpBooking.id} — all rooms may be occupied`);
    }
  }
  // ── Upsert booking ────────────────────────────────────
  const bookingData = {
    company_id: companyId,
    docplanner_booking_id: String(dpBooking.id),
    client_id: clientId,
    customer_name: [
      patient.name,
      patient.surname
    ].filter(Boolean).join(' ') || 'DocPlanner Patient',
    customer_email: patient.email ? patient.email.toLowerCase().trim() : null,
    customer_phone: patient.phone || null,
    professional_id: mapping.professional_id,
    service_id: serviceId,
    start_time: startTime,
    end_time: endTime || startTime,
    status: statusMap[dpBooking.status] || 'confirmed',
    source: 'docplanner',
    notes: dpBooking.comment || null,
    resource_id: resourceId,
    session_type: sessionType
  };
  let bookingId = null;
  let existingGoogleEventId = null;
  let existingResourceEventId = null;
  if (existing) {
    existingGoogleEventId = existing.google_event_id || null;
    existingResourceEventId = existing.resource_google_event_id || null;
    // Update existing booking
    await serviceClient.from('bookings').update(bookingData).eq('id', existing.id);
    bookingId = existing.id;
  } else {
    // Insert new booking — UNIQUE(company_id, docplanner_booking_id) prevents
    // race-condition duplicates if two cron runs overlap.
    const { data: inserted, error: insertErr } = await serviceClient.from('bookings').insert(bookingData).select('id').single();
    if (insertErr) {
      // Unique violation = another concurrent sync already inserted it → skip
      if (insertErr.code === '23505') {
        console.warn(`[sync-cron] Duplicate insert blocked for DP booking ${dpBooking.id}, skipping`);
        return;
      }
      throw insertErr;
    }
    bookingId = inserted?.id || null;
  }
  // Sync to Google Calendar if professional has a calendar associated
  if (bookingId && bookingData.status !== 'cancelled') {
    await syncBookingToGoogleCalendar(serviceClient, companyId, mapping.professional_id, bookingId, bookingData, existingGoogleEventId, ownerUserId, emailPrefs);
    await syncBookingToResourceCalendar(serviceClient, companyId, bookingId, bookingData, existingResourceEventId, ownerUserId);
  }
}
/* ── Pull notification queue ─────────────────────────── */ async function processNotificationQueue(serviceClient, integration, token) {
  let synced = 0;
  let failed = 0;
  const errors = [];
  const mappings = integration.doctor_mappings || [];
  const facilityId = integration.facility_id;
  const companyId = integration.company_id;
  // Hoist owner lookup: once per company, not per notification
  const { data: ownerRole } = await serviceClient.from('app_roles').select('id').eq('name', 'owner').maybeSingle();
  const { data: ownerMember } = ownerRole ? await serviceClient.from('company_members').select('user_id').eq('company_id', companyId).eq('role_id', ownerRole.id).maybeSingle() : {
    data: null
  };
  const ownerUserId = ownerMember?.user_id ?? null;
  try {
    // Pull up to 100 queued notifications
    const data = await dpFetch(token, '/notifications/multiple?limit=100');
    const notifications = data?._items || [];
    if (notifications.length === 0) return {
      synced,
      failed,
      errors
    };
    for (const notification of notifications){
      const eventName = notification.name || '';
      const resource = notification.resource || {};
      try {
        const doctorId = String(resource.doctor?.id || '');
        const mapping = mappings.find((m)=>String(m.dp_doctor_id) === doctorId);
        if (!mapping) {
          continue;
        }
        if ([
          'slot-booking',
          'booking-confirmed',
          'booking-moved'
        ].includes(eventName)) {
          const bookingId = resource.booking?.id;
          if (bookingId && facilityId) {
            // Use the address from the notification resource if available
            const notifAddressId = resource.address?.id ? String(resource.address.id) : null;
            let addrId = notifAddressId || mapping.address_id;
            if (!addrId) {
              try {
                const addrData = await dpFetch(token, `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses`);
                const addresses = addrData?._items || [];
                if (addresses.length > 0) {
                  addrId = String(addresses[0].id);
                  mapping.address_id = addrId;
                }
              } catch (_) {}
            }
            const fetchBooking = async (addressId)=>{
              const path = `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses/${addressId}/bookings/${bookingId}?with=booking.patient,booking.address_service`;
              return await dpFetch(token, path);
            };
            try {
              const fullBooking = await fetchBooking(addrId || mapping.address_id);
              if (fullBooking) {
                await upsertBookingFromDP(serviceClient, companyId, fullBooking, mapping, ownerUserId, {});
                synced++;
              }
            } catch (e) {
              if (String(e).includes('403')) {
                // Try ALL addresses for this doctor
                let resolved = false;
                try {
                  const addrData = await dpFetch(token, `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses`);
                  const allAddrs = (addrData?._items || []).map((a)=>String(a.id));
                  for (const candidateAddr of allAddrs){
                    if (candidateAddr === addrId) continue;
                    try {
                      const retryBooking = await fetchBooking(candidateAddr);
                      if (retryBooking) {
                        await upsertBookingFromDP(serviceClient, companyId, retryBooking, mapping, ownerUserId, {});
                        synced++;
                        resolved = true;
                        mapping.address_id = candidateAddr;
                        const updated = mappings.map((m)=>String(m.dp_doctor_id) === String(mapping.dp_doctor_id) ? {
                            ...m, address_id: candidateAddr } : m);
                        await serviceClient.from('docplanner_integrations').update({
                          doctor_mappings: updated, updated_at: new Date().toISOString()
                        }).eq('company_id', companyId);
                        break;
                      }
                    } catch (_) {}
                  }
                } catch (_) {}
                if (!resolved) {
                  failed++;
                  errors.push(`Booking ${bookingId}: unable to find at any address (403)`);
                }
              } else {
                failed++;
                errors.push(`Booking ${bookingId}: ${String(e)}`);
              }
            }
          }
        } else if (eventName === 'booking-canceled') {
          const bookingId = resource.booking?.id;
          if (bookingId) {
            const { data: existing } = await serviceClient.from('bookings').select('id').eq('company_id', companyId).eq('docplanner_booking_id', String(bookingId)).maybeSingle();
            if (existing) {
              await serviceClient.from('bookings').update({
                status: 'cancelled',
                updated_at: new Date().toISOString()
              }).eq('id', existing.id);
              synced++;
            }
          }
        }
      } catch (e) {
        failed++;
        errors.push(`Notification ${eventName}: ${String(e)}`);
      }
    }
    // Acknowledge processed notifications (delete from the queue)
    try {
      await fetch(`${DP_BASE_URL}/notifications/multiple`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
    } catch (e) {
      console.error('[docplanner-sync-cron] Failed to ACK notifications:', e);
    }
  } catch (e) {
    errors.push(`Notification queue error: ${String(e)}`);
    failed++;
  }
  return {
    synced,
    failed,
    errors
  };
}
/* ── Full booking sync for a company ─────────────────── */ async function syncCompanyBookings(serviceClient, integration, token) {
  let synced = 0;
  let failed = 0;
  const errors = [];
  const mappings = integration.doctor_mappings || [];
  const facilityId = integration.facility_id;
  const companyId = integration.company_id;
  // Hoist owner lookup: once per company, not per booking
  const { data: ownerRole } = await serviceClient.from('app_roles').select('id').eq('name', 'owner').maybeSingle();
  const { data: ownerMember } = ownerRole ? await serviceClient.from('company_members').select('user_id').eq('company_id', companyId).eq('role_id', ownerRole.id).maybeSingle() : {
    data: null
  };
  const ownerUserId = ownerMember?.user_id ?? null;
  // Fetch email notification preferences once per company
  const { data: settings } = await serviceClient.from('company_settings')
    .select('email_preferences').eq('company_id', companyId).maybeSingle();
  const emailPrefs = settings?.email_preferences || {};
  // NOTE: use start-of-day (not "now") so already-passed bookings today are included
  const now = new Date();
  const startOfToday = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  const thirtyDaysLater = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);
  const startStr = startOfToday.toISOString().slice(0, 19) + 'Z';
  const endStr = thirtyDaysLater.toISOString().slice(0, 19) + 'Z';
  for (const mapping of mappings){
    if (!mapping.dp_doctor_id || !mapping.professional_id) continue;

    // ── Fetch ALL addresses for this doctor ──
    let allAddressIds = [];
    try {
      const addrData = await dpFetch(token, `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses`);
      const addresses = addrData?._items || [];
      allAddressIds = addresses.map((a)=>String(a.id));
    } catch (_) {}

    // Keep the mapped address as fallback
    if (mapping.address_id && !allAddressIds.includes(mapping.address_id)) {
      allAddressIds.push(mapping.address_id);
    }

    if (allAddressIds.length === 0 && mapping.address_id) {
      allAddressIds = [mapping.address_id];
    }

    if (allAddressIds.length === 0) {
      failed++;
      errors.push(`Doctor ${mapping.dp_doctor_name || mapping.dp_doctor_id}: no addresses found`);
      continue;
    }

    // Fetch bookings from ALL addresses
    for (const addrId of allAddressIds){
      try {
        const path = `/facilities/${facilityId}/doctors/${mapping.dp_doctor_id}/addresses/${addrId}/bookings?start=${startStr}&end=${endStr}&with=booking.patient,booking.address_service`;
        const data = await dpFetch(token, path);
        const dpBookings = data?._items || [];
        for (const dpBooking of dpBookings){
          try {
            await upsertBookingFromDP(serviceClient, companyId, dpBooking, mapping, ownerUserId, emailPrefs);
            synced++;
          } catch (e) {
            failed++;
            errors.push(`Booking ${dpBooking.id}: ${String(e)}`);
          }
        }
      } catch (e) {
        if (String(e).includes('403')) continue;
        failed++;
        errors.push(`Doctor ${mapping.dp_doctor_name || mapping.dp_doctor_id} (addr ${addrId}): ${String(e)}`);
      }
    }
  }
  return {
    synced,
    failed,
    errors
  };
}
/* ── Main handler ────────────────────────────────────── */ serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  // Auth: accept service_role key (cron) or JWT (manual trigger)
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (token !== SERVICE_ROLE_KEY) {
    // Validate JWT for manual trigger
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  }
  // Fetch all active integrations with auto_sync enabled
  const { data: integrations, error: fetchErr } = await serviceClient.from('docplanner_integrations').select('*').eq('is_active', true).eq('auto_sync', true);
  if (fetchErr) {
    console.error('[docplanner-sync-cron] Failed to fetch integrations:', fetchErr);
    return new Response(JSON.stringify({
      error: 'DB error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  if (!integrations || integrations.length === 0) {
    return new Response(JSON.stringify({
      message: 'No active auto-sync integrations',
      processed: 0
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  const results = [];
  const now = new Date();
  for (const integration of integrations){
    // Check if enough time has passed since last sync
    if (integration.last_sync_at) {
      const lastSync = new Date(integration.last_sync_at);
      const minutesSinceLast = (now.getTime() - lastSync.getTime()) / (1000 * 60);
      if (minutesSinceLast < (integration.sync_interval_minutes || 30)) {
        continue; // Skip, not due yet
      }
    }
    if (!integration.facility_id || !integration.doctor_mappings?.length) {
      continue; // Not fully configured
    }
    // Create sync log
    const { data: logEntry } = await serviceClient.from('docplanner_sync_log').insert({
      company_id: integration.company_id,
      sync_type: 'full',
      direction: 'pull',
      status: 'started'
    }).select().single();
    try {
      const dpToken = await getValidToken(serviceClient, integration);
      // 1. Process notification queue first (real-time events)
      const notifResult = await processNotificationQueue(serviceClient, integration, dpToken);
      // 2. Full booking sync (catches anything missed by notifications)
      const syncResult = await syncCompanyBookings(serviceClient, integration, dpToken);
      const totalSynced = notifResult.synced + syncResult.synced;
      const totalFailed = notifResult.failed + syncResult.failed;
      const allErrors = [
        ...notifResult.errors,
        ...syncResult.errors
      ];
      const status = totalFailed === 0 ? 'success' : totalSynced > 0 ? 'partial' : 'error';
      // Update sync log
      if (logEntry) {
        await serviceClient.from('docplanner_sync_log').update({
          status,
          records_synced: totalSynced,
          records_failed: totalFailed,
          error_details: allErrors.length ? allErrors.slice(0, 20) : null,
          completed_at: new Date().toISOString()
        }).eq('id', logEntry.id);
      }
      // Update integration last sync
      await serviceClient.from('docplanner_integrations').update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: status,
        last_sync_message: `${totalSynced} synced${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
        updated_at: new Date().toISOString()
      }).eq('id', integration.id);
      results.push({
        company_id: integration.company_id,
        synced: totalSynced,
        failed: totalFailed,
        errors: allErrors.slice(0, 5)
      });
    } catch (e) {
      console.error(`[docplanner-sync-cron] Company ${integration.company_id} error:`, e);
      if (logEntry) {
        await serviceClient.from('docplanner_sync_log').update({
          status: 'error',
          error_details: [
            String(e)
          ],
          completed_at: new Date().toISOString()
        }).eq('id', logEntry.id);
      }
      await serviceClient.from('docplanner_integrations').update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'error',
        last_sync_message: String(e).slice(0, 200),
        updated_at: new Date().toISOString()
      }).eq('id', integration.id);
      results.push({
        company_id: integration.company_id,
        synced: 0,
        failed: 1,
        errors: [
          String(e).slice(0, 200)
        ]
      });
    }
  }
  return new Response(JSON.stringify({
    processed: results.length,
    results
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
});
