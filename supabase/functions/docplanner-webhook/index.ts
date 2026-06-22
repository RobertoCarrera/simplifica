// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt as oauthDecrypt, isEncrypted as isOAuthEncrypted, encrypt as oauthEncrypt } from '../_shared/crypto-utils.ts';
import { withSecurityHeaders, escapeLike, getClientIP } from '../_shared/security.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');
const OAUTH_ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[docplanner-webhook] ENCRYPTION_KEY must be at least 32 characters');
}
const DP_DOMAIN = 'www.doctoralia.es';
const DP_BASE_URL = 'https://' + DP_DOMAIN + '/api/v3/integration';
const DP_TOKEN_URL = 'https://' + DP_DOMAIN + '/oauth/v2/token';
async function getAesKey() {
  const keyData = new TextEncoder().encode(ENCRYPTION_KEY!.slice(0, 32));
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function decrypt(encryptedBase64) {
  const key = await getAesKey();
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
async function getAccessToken(clientId, clientSecret) {
  const credentials = btoa(clientId + ':' + clientSecret);
  const res = await fetch(DP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + credentials, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=integration',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('DocPlanner auth failed (' + res.status + '): ' + body.slice(0, 200));
  }
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in || 86400 };
}
async function getValidToken(serviceClient, companyId) {
  const { data: integration, error } = await serviceClient
    .from('docplanner_integrations').select('*').eq('company_id', companyId).single();
  if (error || !integration) throw new Error('Integration not found');
  if (!integration.is_active) throw new Error('Integration not active');
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
    updated_at: now.toISOString(),
  }).eq('company_id', companyId);
  return tokenData.access_token;
}
async function encrypt(plaintext) {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}
async function dpFetch(token, path) {
  const url = DP_BASE_URL + path;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('DP API GET ' + path + ' failed (' + res.status + '): ' + text.slice(0, 300));
  }
  if (res.status === 204) return null;
  return await res.json();
}
async function verifyHmacSignature(body, signature, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) { mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i); }
  return mismatch === 0;
}
async function ensureDocplannerTag(serviceClient, companyId) {
  const { data: existing } = await serviceClient.from('global_tags').select('id').eq('company_id', companyId).ilike('name', 'doctoralia').maybeSingle();
  if (existing) return existing.id;
  const { data: newTag, error } = await serviceClient.from('global_tags').insert({
    company_id: companyId, name: 'Doctoralia', color: '#00b8a9', category: 'Integración', scope: ['clients', 'professionals'],
  }).select('id').single();
  if (error) { console.error('[ensureDocplannerTag] Failed to create tag:', error); return null; }
  return newTag.id;
}
async function tagRecord(serviceClient, tagId, recordId, recordType) {
  if (recordType === 'client') {
    await serviceClient.from('clients_tags').upsert({ tag_id: tagId, client_id: recordId }, { onConflict: 'client_id,tag_id', ignoreDuplicates: true });
  } else {
    await serviceClient.from('item_tags').upsert({ tag_id: tagId, record_id: recordId, record_type: recordType }, { ignoreDuplicates: true });
  }
}
async function assignRoomForBooking(serviceClient, companyId, professionalId, startTime, endTime) {
  const { data: professional } = await serviceClient.from('professionals').select('default_resource_id').eq('id', professionalId).maybeSingle();
  const hasConflict = async (resourceId) => {
    const { data: conflicts } = await serviceClient.from('bookings').select('id')
      .eq('resource_id', resourceId).neq('status', 'cancelled').lt('start_time', endTime).gt('end_time', startTime).limit(1);
    return (conflicts?.length ?? 0) > 0;
  };
  if (professional?.default_resource_id) {
    if (!(await hasConflict(professional.default_resource_id))) return professional.default_resource_id;
  }
  let roomsQuery = serviceClient.from('resources').select('id').eq('company_id', companyId).eq('type', 'room').eq('is_active', true);
  if (professional?.default_resource_id) roomsQuery = roomsQuery.neq('id', professional.default_resource_id);
  const { data: rooms } = await roomsQuery;
  if (rooms) { for (const room of rooms) { if (!(await hasConflict(room.id))) return room.id; } }
  return null;
}
async function syncBookingToGoogleCalendar(serviceClient, professionalId, bookingId, data, existingEventId, sendInvites = true) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_ENCRYPTION_KEY) return;
  const { data: professional } = await serviceClient.from('professionals').select('user_id, google_calendar_id').eq('id', professionalId).maybeSingle();
  if (!professional?.google_calendar_id || !professional?.user_id) return;
  const { data: integration } = await serviceClient.from('integrations').select('id, access_token, refresh_token, expires_at')
    .eq('user_id', professional.user_id).eq('provider', 'google_calendar').maybeSingle();
  if (!integration) return;
  const storedAccessToken = OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.access_token)
    ? await oauthDecrypt(integration.access_token, OAUTH_ENCRYPTION_KEY) : integration.access_token;
  const storedRefreshToken = integration.refresh_token && OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.refresh_token)
    ? await oauthDecrypt(integration.refresh_token, OAUTH_ENCRYPTION_KEY) : integration.refresh_token;
  let accessToken = storedAccessToken;
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!storedRefreshToken) return;
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: storedRefreshToken, grant_type: 'refresh_token' }),
    });
    const refreshed = await refreshRes.json();
    if (refreshed.error || !refreshed.access_token) { console.warn('[webhook][syncBookingToGoogleCalendar] Token refresh failed:', refreshed.error); return; }
    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
    const encryptedNew = await oauthEncrypt(accessToken, OAUTH_ENCRYPTION_KEY);
    await serviceClient.from('integrations').update({ access_token: encryptedNew, expires_at: newExpiry.toISOString(), updated_at: new Date().toISOString() }).eq('id', integration.id);
  }
  const calendarEvent = {
    summary: data.customer_name,
    start: { dateTime: data.start_time, timeZone: 'UTC' },
    end: { dateTime: data.end_time, timeZone: 'UTC' },
    extendedProperties: { shared: { simplificaBookingId: bookingId, source: 'docplanner' } },
  };
  if (data.notes) calendarEvent.description = data.notes;
  const calendarId = encodeURIComponent(professional.google_calendar_id);
  const url = existingEventId
    ? 'https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events/' + encodeURIComponent(existingEventId) + '?sendUpdates=' + (sendInvites ? 'all' : 'none')
    : 'https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events?sendUpdates=' + (sendInvites ? 'all' : 'none');
  const gcalRes = await fetch(url, {
    method: existingEventId ? 'PUT' : 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(calendarEvent),
  });
  if (!gcalRes.ok) { const err = await gcalRes.text(); console.warn('[webhook][syncBookingToGoogleCalendar] API error for booking ' + bookingId + ':', err); return; }
  const result = await gcalRes.json();
  if (result.id) await serviceClient.from('bookings').update({ google_event_id: result.id }).eq('id', bookingId);
}
async function getOwnerGoogleAccessToken(serviceClient, companyId) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_ENCRYPTION_KEY) return null;
  const { data: ownerMember } = await serviceClient.from('company_members').select('user_id').eq('company_id', companyId).eq('role', 'owner').maybeSingle();
  if (!ownerMember) return null;
  const { data: integration } = await serviceClient.from('integrations').select('id, access_token, refresh_token, expires_at')
    .eq('user_id', ownerMember.user_id).eq('provider', 'google_calendar').maybeSingle();
  if (!integration) return null;
  const storedAccessToken = OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.access_token)
    ? await oauthDecrypt(integration.access_token, OAUTH_ENCRYPTION_KEY) : integration.access_token;
  const storedRefreshToken = integration.refresh_token && OAUTH_ENCRYPTION_KEY && isOAuthEncrypted(integration.refresh_token)
    ? await oauthDecrypt(integration.refresh_token, OAUTH_ENCRYPTION_KEY) : integration.refresh_token;
  let accessToken = storedAccessToken;
  const expiresAt = new Date(integration.expires_at);
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!storedRefreshToken) return null;
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: storedRefreshToken, grant_type: 'refresh_token' }),
    });
    const refreshed = await refreshRes.json();
    if (refreshed.error || !refreshed.access_token) return null;
    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
    const encryptedNew = await oauthEncrypt(accessToken, OAUTH_ENCRYPTION_KEY);
    await serviceClient.from('integrations').update({ access_token: encryptedNew, expires_at: newExpiry.toISOString(), updated_at: new Date().toISOString() }).eq('id', integration.id);
  }
  return accessToken;
}
async function syncBookingToResourceCalendar(serviceClient, companyId, bookingId, data, existingResourceEventId) {
  if (!data.resource_id) return;
  const { data: resource } = await serviceClient.from('resources').select('google_calendar_id').eq('id', data.resource_id).maybeSingle();
  if (!resource?.google_calendar_id) return;
  const accessToken = await getOwnerGoogleAccessToken(serviceClient, companyId);
  if (!accessToken) return;
  const calendarId = resource.google_calendar_id;
  const eventBody = {
    summary: data.customer_name,
    start: { dateTime: data.start_time, timeZone: 'UTC' },
    end: { dateTime: data.end_time, timeZone: 'UTC' },
    extendedProperties: { shared: { simplificaBookingId: bookingId, source: 'resource_sync' } },
  };
  if (data.notes) eventBody.description = data.notes;
  try {
    let resourceEventId = null;
    if (existingResourceEventId) {
      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(existingResourceEventId) + '?sendUpdates=none',
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
      );
      if (res.ok) { const updated = await res.json(); resourceEventId = updated.id; }
      else if (res.status !== 404) return;
    }
    if (!resourceEventId) {
      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events?sendUpdates=none',
        { method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
      );
      if (!res.ok) return;
      const created = await res.json(); resourceEventId = created.id;
    }
    if (resourceEventId) await serviceClient.from('bookings').update({ resource_google_event_id: resourceEventId }).eq('id', bookingId);
  } catch (err) { console.error('[webhook][syncBookingToResourceCalendar] error:', err); }
}
async function upsertBookingFromDP(serviceClient, companyId, dpBooking, mapping) {
  const patient = dpBooking.patient || {};
  const service = dpBooking.address_service || {};
  // v26: log whether address_service was included in the payload
  console.log('[webhook][upsert] booking ' + dpBooking.id + ' | doctor ' + mapping.dp_doctor_name + ' | address_service present: ' + !!(dpBooking.address_service) + ' | name: ' + (service.name || '(none)') + ' | keys: ' + (dpBooking.address_service ? Object.keys(dpBooking.address_service).join(',') : 'null'));
  const statusMap = { booked: 'confirmed', canceled: 'cancelled', not_appeared: 'cancelled' };
  const startTime = dpBooking.start_at || dpBooking.booked_at;
  const endTime = dpBooking.end_at;
  let clientId = null;
  const tagId = await ensureDocplannerTag(serviceClient, companyId);
  if (patient.id) {
    const normalizedEmail = patient.email ? patient.email.toLowerCase().trim() : null;
    const { data: existingByDp } = await serviceClient.from('clients').select('id')
      .eq('company_id', companyId).eq('docplanner_patient_id', String(patient.id)).maybeSingle();
    if (existingByDp) clientId = existingByDp.id;
    if (!clientId && normalizedEmail) {
      const { data: existingByEmail } = await serviceClient.from('clients').select('id')
        .eq('company_id', companyId).ilike('email', escapeLike(normalizedEmail)).maybeSingle();
      if (existingByEmail) {
        clientId = existingByEmail.id;
        await serviceClient.from('clients').update({ docplanner_patient_id: String(patient.id) }).eq('id', clientId);
        if (tagId) await tagRecord(serviceClient, tagId, clientId, 'client');
      }
    }
    if (!clientId && patient.phone) {
      const dpDigits = patient.phone.replace(/\D/g, '');
      const dpLast9 = dpDigits.length >= 9 ? dpDigits.slice(-9) : null;
      if (dpLast9) {
        const { data: phoneCandidates } = await serviceClient.from('clients').select('id, phone')
          .eq('company_id', companyId).not('phone', 'is', null).limit(1000);
        if (phoneCandidates) {
          const match = phoneCandidates.find((c) => {
            const cDigits = (c.phone || '').replace(/\D/g, '');
            return cDigits.length >= 9 && cDigits.slice(-9) === dpLast9;
          });
          if (match) {
            clientId = match.id;
            await serviceClient.from('clients').update({ docplanner_patient_id: String(patient.id) }).eq('id', clientId);
            if (tagId) await tagRecord(serviceClient, tagId, clientId, 'client');
          }
        }
      }
    }
    if (!clientId && (patient.name || patient.surname)) {
      const hasContactInfo = !!(normalizedEmail || patient.phone);
      if (!hasContactInfo) {
        const { data: existingPending } = await serviceClient.from('clients').select('id')
          .eq('company_id', companyId).eq('is_active', false).ilike('name', escapeLike(patient.name || '')).ilike('surname', escapeLike(patient.surname || '')).limit(1);
        if (existingPending) {
          await serviceClient.from('clients').update({ docplanner_patient_id: String(patient.id) }).eq('id', existingPending[0].id);
          clientId = existingPending[0].id;
        }
      }
      if (!clientId) {
        const { data: newClient } = await serviceClient.from('clients').insert({
          company_id: companyId, name: patient.name || '', surname: patient.surname || '',
          email: normalizedEmail, phone: patient.phone || null, docplanner_patient_id: String(patient.id),
          is_active: hasContactInfo, metadata: hasContactInfo ? {} : { pending_docplanner_import: true },
        }).select('id').single();
        if (newClient) {
          clientId = newClient.id;
          if (tagId && hasContactInfo) await tagRecord(serviceClient, tagId, newClient.id, 'client');
        }
      }
    }
  }
  let serviceId = null;
  let dpServiceUnmapped = false;
  if (service.name || (service as any).service_id) {
    const svcName = service.name?.trim() || '';
    const svcServiceId = (service as any).service_id || '';
    const addrIdForLookup = (service as any).address_id || mapping.address_id;
    // v26: detailed service lookup logging
    console.log('[webhook][service-lookup] booking ' + dpBooking.id + ' | svcName: "' + svcName + '" | svcServiceId: ' + svcServiceId + ' | addrIdForLookup: ' + addrIdForLookup + ' | mapping.address_id: ' + mapping.address_id + ' | service_mappings count: ' + (mapping.service_mappings?.length || 0));
    // 1. Try service_id match first (stable catalog ID — most reliable)
    if (svcServiceId && mapping.service_mappings?.length) {
      const mappingEntry = mapping.service_mappings.find(
        (m) => m.dp_service_id === svcServiceId,
      );
      console.log('[webhook][service-lookup] service_id match result: ' + (mappingEntry ? ('MATCHED crm_service_id=' + mappingEntry.crm_service_id) : 'no entry found for service_id=' + svcServiceId));
      if (mappingEntry?.crm_service_id) {
        serviceId = mappingEntry.crm_service_id;
      }
    }
    // 2. Try name + address match (existing logic)
    if (!serviceId && svcName && mapping.service_mappings?.length) {
      const mappingEntry = mapping.service_mappings.find(
        (m) => m.dp_service_name === svcName && m.dp_address_id === addrIdForLookup,
      );
      console.log('[webhook][service-lookup] name+addr match result: ' + (mappingEntry ? ('MATCHED crm_service_id=' + mappingEntry.crm_service_id) : 'no entry found for name="' + svcName + '" addr=' + addrIdForLookup));
      if (mappingEntry?.crm_service_id) {
        serviceId = mappingEntry.crm_service_id;
      }
    }
    // 3. Fall back to name-only matching (search CRM services)
    if (!serviceId && svcName) {
      const { data: exactMatch } = await serviceClient.from('services').select('id')
        .eq('company_id', companyId).ilike('name', escapeLike(svcName)).maybeSingle();
      if (exactMatch) {
        serviceId = exactMatch.id;
        console.log('[webhook][service-lookup] name fallback match: service id=' + exactMatch.id);
      } else {
        const { data: fuzzyMatches } = await serviceClient.from('services').select('id')
          .eq('company_id', companyId).eq('is_active', true).ilike('name', '%' + escapeLike(svcName) + '%').limit(1);
        if (fuzzyMatches?.length) {
          serviceId = fuzzyMatches[0].id;
          console.log('[webhook][service-lookup] fuzzy match: service id=' + fuzzyMatches[0].id);
        } else {
          console.log('[webhook][service-lookup] NO SERVICE MATCH for "' + svcName + '" — will flag as unmapped');
        }
      }
      // 4. If no match found, flag it
      if (!serviceId) dpServiceUnmapped = true;
    } else if (!svcName && !svcServiceId) {
      console.log('[webhook][service-lookup] booking ' + dpBooking.id + ' — NO service info in address_service');
    }
  } else {
    console.log('[webhook][service-lookup] booking ' + dpBooking.id + ' — NO service.name or service_id in address_service (service is empty/null)');
  }
  const effectiveStatus = statusMap[dpBooking.status] || 'confirmed';
  const resourceId = effectiveStatus !== 'cancelled'
    ? await assignRoomForBooking(serviceClient, companyId, mapping.professional_id, startTime, endTime || startTime) : null;
  if (resourceId === null && effectiveStatus !== 'cancelled') {
    console.warn('[webhook] No room assigned for booking ' + dpBooking.id + ' — all rooms may be occupied');
  }
  const addressServiceType = ((service as any).type || '').toLowerCase();
  const isOnlineByServiceType = ['video', 'online', 'virtual', 'phone', 'teleconsult', 'telemedicine'].includes(addressServiceType);
  const isOnlineByName = /video|online|virtual|teleconsult|telemedicin/i.test(service.name || '');
  const isOnlineByMapping = (mapping as any).is_online_address === true;
  const sessionType = (isOnlineByServiceType || isOnlineByName || isOnlineByMapping) ? 'online' : 'presencial';
  const bookingData: any = {
    company_id: companyId, docplanner_booking_id: String(dpBooking.id), client_id: clientId,
    customer_name: [patient.name, patient.surname].filter(Boolean).join(' ') || 'DocPlanner Patient',
    customer_email: patient.email ? patient.email.toLowerCase().trim() : null,
    customer_phone: patient.phone || null, professional_id: mapping.professional_id, service_id: serviceId,
    start_time: startTime, end_time: endTime || startTime, status: statusMap[dpBooking.status] || 'confirmed',
    source: 'docplanner', notes: dpBooking.comment || null, resource_id: resourceId, session_type: sessionType,
  };
  // Only set dp_service_unmapped flag on first upsert (when IS NULL), don't overwrite on subsequent syncs
  if (dpServiceUnmapped) {
    bookingData.dp_service_unmapped = true;
  }
  const { data: existing } = await serviceClient.from('bookings').select('id, source, google_event_id, resource_google_event_id, dp_service_unmapped')
    .eq('company_id', companyId).eq('docplanner_booking_id', String(dpBooking.id)).maybeSingle();
  let bookingId = null;
  let existingGoogleEventId = null;
  let existingResourceEventId = null;
  if (existing) {
    existingGoogleEventId = existing.google_event_id || null;
    existingResourceEventId = existing.resource_google_event_id || null;
    if (existing.source === 'docplanner' || existing.source === null) {
      // Only set dp_service_unmapped if not already flagged (preserve on subsequent syncs)
      if (dpServiceUnmapped && !existing.dp_service_unmapped) {
        await serviceClient.from('bookings').update({ ...bookingData, dp_service_unmapped: true }).eq('id', existing.id);
      } else {
        await serviceClient.from('bookings').update(bookingData).eq('id', existing.id);
      }
      bookingId = existing.id;
    }
  } else {
    const { data: inserted } = await serviceClient.from('bookings').insert(bookingData).select('id').single();
    if (inserted) bookingId = inserted.id;
  }
  if (bookingId && effectiveStatus !== 'cancelled') {
    try {
      await syncBookingToGoogleCalendar(serviceClient, mapping.professional_id, bookingId, {
        customer_name: bookingData.customer_name, start_time: startTime, end_time: endTime || startTime,
        notes: bookingData.notes, resource_id: resourceId,
      }, existingGoogleEventId);
      await syncBookingToResourceCalendar(serviceClient, companyId, bookingId, {
        customer_name: bookingData.customer_name, start_time: startTime, end_time: endTime || startTime,
        notes: bookingData.notes, resource_id: resourceId,
      }, existingResourceEventId);
    } catch (e) { console.warn('[webhook][upsertBookingFromDP] Calendar sync failed (non-fatal):', e); }
  }

  // Auto-generate quote from booking
  if (bookingId) {
    try {
      await serviceClient.rpc('generate_quote_from_booking', {
        p_booking_id: bookingId,
        p_trigger_source: 'docplanner_webhook',
      }).maybeSingle();
    } catch (e) {
      console.warn('[webhook] Quote generation failed (non-fatal):', String(e));
    }
  }
}
async function updateBookingInPlaceForMoved(serviceClient, companyId, existingBooking, fullBooking, mapping, newBookingId) {
  const patient = fullBooking.patient || {};
  const service = fullBooking.address_service || {};
  const statusMap = { booked: 'confirmed', canceled: 'cancelled', not_appeared: 'cancelled' };
  const startTime = fullBooking.start_at || fullBooking.booked_at;
  const endTime = fullBooking.end_at;
  let serviceId = null;
  let dpServiceUnmapped = false;
  if (service.name || (service as any).service_id) {
    const svcName = service.name?.trim() || '';
    const svcServiceId = (service as any).service_id || '';
    const addrIdForLookup = (service as any).address_id || mapping.address_id;
    // 1. Try service_id match first
    if (svcServiceId && mapping.service_mappings?.length) {
      const mappingEntry = mapping.service_mappings.find((m) => m.dp_service_id === svcServiceId);
      if (mappingEntry?.crm_service_id) serviceId = mappingEntry.crm_service_id;
    }
    // 2. Try name + address match
    if (!serviceId && svcName && mapping.service_mappings?.length) {
      const mappingEntry = mapping.service_mappings.find(
        (m) => m.dp_service_name === svcName && m.dp_address_id === addrIdForLookup,
      );
      if (mappingEntry?.crm_service_id) serviceId = mappingEntry.crm_service_id;
    }
    // 3. Fall back to name matching
    if (!serviceId) {
      const { data: exactMatch } = await serviceClient.from('services').select('id')
        .eq('company_id', companyId).ilike('name', escapeLike(svcName)).maybeSingle();
      if (exactMatch) serviceId = exactMatch.id;
      else {
        const { data: fuzzyMatches } = await serviceClient.from('services').select('id')
          .eq('company_id', companyId).eq('is_active', true).ilike('name', '%' + escapeLike(svcName) + '%').limit(1);
        if (fuzzyMatches?.length) serviceId = fuzzyMatches[0].id;
      }
      if (!serviceId) dpServiceUnmapped = true;
    }
  }
  const addressServiceType = ((service as any).type || '').toLowerCase();
  const isOnlineByServiceType = ['video', 'online', 'virtual', 'phone', 'teleconsult', 'telemedicine'].includes(addressServiceType);
  const isOnlineByName = /video|online|virtual|teleconsult|telemedicin/i.test(service.name || '');
  const isOnlineByMapping = (mapping as any).is_online_address === true;
  const sessionType = (isOnlineByServiceType || isOnlineByName || isOnlineByMapping) ? 'online' : 'presencial';
  const effectiveStatus = statusMap[fullBooking.status] || 'confirmed';
  const updateData: any = {
    docplanner_booking_id: String(newBookingId),
    service_id: serviceId,
    start_time: startTime,
    end_time: endTime || startTime,
    status: effectiveStatus,
    notes: fullBooking.comment || null,
    session_type: sessionType,
    updated_at: new Date().toISOString(),
  };
  if (dpServiceUnmapped && !existingBooking.dp_service_unmapped) {
    updateData.dp_service_unmapped = true;
  }
  await serviceClient.from('bookings').update(updateData).eq('id', existingBooking.id);
  if (effectiveStatus !== 'cancelled') {
    try {
      await syncBookingToGoogleCalendar(serviceClient, mapping.professional_id, existingBooking.id, {
        customer_name: existingBooking.customer_name || [patient.name, patient.surname].filter(Boolean).join(' ') || 'DocPlanner Patient',
        start_time: startTime, end_time: endTime || startTime,
        notes: fullBooking.comment || null, resource_id: existingBooking.resource_id,
      }, existingBooking.google_event_id);
      await syncBookingToResourceCalendar(serviceClient, companyId, existingBooking.id, {
        customer_name: existingBooking.customer_name || [patient.name, patient.surname].filter(Boolean).join(' ') || 'DocPlanner Patient',
        start_time: startTime, end_time: endTime || startTime,
        notes: fullBooking.comment || null, resource_id: existingBooking.resource_id,
      }, existingBooking.resource_google_event_id);
    } catch (e) { console.warn('[webhook][updateBookingInPlaceForMoved] Calendar sync failed (non-fatal):', e); }
  }
}
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: withSecurityHeaders({
        'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS')?.split(',')[0]?.trim() || '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Signature',
      }),
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
  }
  const url = new URL(req.url);
  const companyId = url.searchParams.get('company_id');
  const token = url.searchParams.get('token');
  if (!companyId) {
    return new Response(JSON.stringify({ error: 'Missing company_id' }), { status: 400, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
  }
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: integration, error: intErr } = await serviceClient
    .from('docplanner_integrations').select('webhook_secret, is_active, facility_id, doctor_mappings')
    .eq('company_id', companyId).single();
  if (intErr || !integration || !integration.is_active) {
    return new Response(JSON.stringify({ error: 'Integration not found or inactive' }), { status: 404, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
  }
  // Rafter v0.22 F-04 fix: cap body size BEFORE buffering to prevent memory
  // exhaustion + CPU-DoS on HMAC verification under slow-loris attacks.
  const cl = req.headers.get('content-length');
  if (cl && parseInt(cl, 10) > 1_000_000) {
    return new Response('Too large', { status: 413, headers: withSecurityHeaders({ 'Content-Type': 'text/plain' }) });
  }
  const rawBody = await req.text();
  // Rafter v0.23 regression fix: restore `signatureHeader` declaration that was
  // accidentally removed in commit 0d07872e (F-04 refactor). Without this line
  // HMAC verification throws ReferenceError at runtime when an X-Webhook-Signature
  // header is present.
  const signatureHeader = req.headers.get('X-Webhook-Signature') || req.headers.get('x-webhook-signature');

  // Rafter v0.23 F-09 fix: per-IP rate limit on signature verification attempts
  // so an attacker spamming forged webhooks cannot burn CPU on HMAC + DB lookup.
  // Tight 5/min/IP cap on verification attempts.
  const sigFailIp = getClientIP(req);
  const sigFailRl = await checkRateLimit(`webhook:fail:${sigFailIp}`, 5, 60000);
  if (!sigFailRl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many failed webhook attempts' }), {
      status: 429,
      headers: withSecurityHeaders({
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(sigFailRl),
      }),
    });
  }
  if (signatureHeader && integration.webhook_secret) {
    const valid = await verifyHmacSignature(rawBody, signatureHeader, integration.webhook_secret);
    if (!valid) {
      console.error('[docplanner-webhook] HMAC signature verification failed');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
    }
  } else if (token && integration.webhook_secret) {
    if (token !== integration.webhook_secret) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
    }
  } else if (!integration.webhook_secret) {
    // Rafter v0.21 LOW-2 fix: fail-closed when webhook_secret is unconfigured.
    // Previously the function accepted ANY POST with a known company_id,
    // enabling unauthenticated booking injection + service auto-creation.
    // Now: reject with 503 so operators MUST configure the secret before
    // the webhook becomes reachable.
    console.error('[docplanner-webhook] webhook_secret not configured — all webhooks rejected. Configure docplanner_integrations.webhook_secret.');
    return new Response(
      JSON.stringify({ error: 'webhook_secret not configured' }),
      { status: 503, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) }
    );
  } else {
    return new Response(JSON.stringify({ error: 'Missing authentication' }), { status: 401, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
  }
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
  }
  const eventName = payload.name || payload.event || '';
  const eventData = payload.data || payload;
  console.log('[webhook] Received event:', eventName, '| booking_id:', eventData.booking?.id || eventData.booking_id, '| payload keys:', Object.keys(eventData).join(', '));
  const { data: logEntry } = await serviceClient.from('docplanner_sync_log').insert({
    company_id: companyId, sync_type: 'webhook', direction: 'pull', status: 'started',
  }).select().single();
  let synced = 0;
  let failed = 0;
  const errors = [];
  try {
    const mappings = integration.doctor_mappings || [];
    const facilityId = integration.facility_id;
    const doctorId = String(eventData.doctor?.id || eventData.doctor_id || '');
    const addressId = String(eventData.address?.id || eventData.address_id || '');
    const mapping = mappings.find((m) => String(m.dp_doctor_id) === doctorId);
    if (!mapping) {
      errors.push('No mapping for doctor ' + doctorId);
      failed++;
    } else {
      switch (eventName) {
        case 'slot-booking':
        case 'booking-confirmed': {
          const bookingId = eventData.booking?.id || eventData.booking_id;
          if (bookingId && facilityId) {
            try {
              const dpToken = await getValidToken(serviceClient, companyId);
              const useAddrId = addressId || mapping.address_id;
              const bookingPath = '/facilities/' + facilityId + '/doctors/' + mapping.dp_doctor_id + '/addresses/' + useAddrId + '/bookings/' + bookingId + '?with=booking.patient,booking.address_service';
              const fullBooking = await dpFetch(dpToken, bookingPath);
              if (fullBooking) {
                await upsertBookingFromDP(serviceClient, companyId, fullBooking, mapping);
                synced++;
                if (useAddrId && useAddrId !== mapping.address_id) {
                  mapping.address_id = useAddrId;
                  const updated = mappings.map((m) => String(m.dp_doctor_id) === String(mapping.dp_doctor_id) ? { ...m, address_id: useAddrId } : m);
                  await serviceClient.from('docplanner_integrations').update({ doctor_mappings: updated, updated_at: new Date().toISOString() }).eq('company_id', companyId);
                  console.log('[webhook] Updated address_id for doctor ' + mapping.dp_doctor_id + ' to ' + useAddrId);
                }
              }
            } catch (e) { errors.push('Fetch booking ' + bookingId + ': ' + String(e)); failed++; }
          } else { errors.push('Missing booking_id or facility_id for ' + eventName); failed++; }
          break;
        }
        case 'booking-moved': {
          const newBookingId = eventData.booking?.id || eventData.booking_id;
          if (newBookingId && facilityId) {
            const previousBookingId = eventData.previous_booking?.id || eventData.previous_booking_id || eventData.old_booking_id || eventData.moved_from_booking_id || eventData.slot_booking_id;
            if (previousBookingId) {
              const { data: oldBooking } = await serviceClient.from('bookings').select('id, google_event_id, resource_google_event_id, customer_name, resource_id')
                .eq('company_id', companyId).eq('docplanner_booking_id', String(previousBookingId)).maybeSingle();
              if (oldBooking) {
                try {
                  const dpToken = await getValidToken(serviceClient, companyId);
                  const useAddrId = addressId || mapping.address_id;
                  const bookingPath = '/facilities/' + facilityId + '/doctors/' + mapping.dp_doctor_id + '/addresses/' + useAddrId + '/bookings/' + newBookingId + '?with=booking.patient,booking.address_service';
                  const fullBooking = await dpFetch(dpToken, bookingPath);
                  if (fullBooking) {
                    await updateBookingInPlaceForMoved(serviceClient, companyId, oldBooking, fullBooking, mapping, newBookingId);
                    synced++;
                    console.log('[webhook] booking-moved: updated existing booking ' + oldBooking.id + ' fromDP ' + previousBookingId + ' -> ' + newBookingId);
                    break;
                  }
                } catch (e) { errors.push('booking-moved fetch/update ' + newBookingId + ': ' + String(e)); failed++; break; }
              } else {
                console.log('[webhook] booking-moved: previous booking ' + previousBookingId + ' not found locally, falling through to normal upsert');
              }
            }
            try {
              const dpToken = await getValidToken(serviceClient, companyId);
              const useAddrId = addressId || mapping.address_id;
              const bookingPath = '/facilities/' + facilityId + '/doctors/' + mapping.dp_doctor_id + '/addresses/' + useAddrId + '/bookings/' + newBookingId + '?with=booking.patient,booking.address_service';
              const fullBooking = await dpFetch(dpToken, bookingPath);
              if (fullBooking) { await upsertBookingFromDP(serviceClient, companyId, fullBooking, mapping); synced++; }
            } catch (e) { errors.push('booking-moved upsert ' + newBookingId + ': ' + String(e)); failed++; }
          } else { errors.push('Missing booking_id or facility_id for booking-moved'); failed++; }
          break;
        }
        case 'booking-canceled': {
          const movedToBookingId = eventData.moved_to_booking_id || eventData.new_booking_id || eventData.replacement_booking?.id;
          if (movedToBookingId) {
            console.log('[webhook] booking-canceled is a move-cancellation (moved to ' + movedToBookingId + '), skipping cancellation');
            synced++;
            break;
          }
          const bookingId = eventData.booking?.id || eventData.booking_id;
          if (bookingId) {
            const { data: existing } = await serviceClient.from('bookings').select('id')
              .eq('company_id', companyId).eq('docplanner_booking_id', String(bookingId)).maybeSingle();
            if (existing) {
              await serviceClient.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', existing.id);
              synced++;
            } else { errors.push('No local booking found for DP booking ' + bookingId); failed++; }
          }
          break;
        }
        case 'presence-marked': {
          const bookingId = eventData.booking?.id || eventData.booking_id;
          if (bookingId) {
            const { data: existing } = await serviceClient.from('bookings').select('id')
              .eq('company_id', companyId).eq('docplanner_booking_id', String(bookingId)).maybeSingle();
            if (existing) {
              await serviceClient.from('bookings').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', existing.id);
              synced++;
            }
          }
          break;
        }
        default:
          console.log('[docplanner-webhook] Unknown event: ' + eventName);
          break;
      }
    }
  } catch (e) { errors.push('Processing error: ' + String(e)); failed++; }
  const status = failed === 0 && synced > 0 ? 'success' : (synced > 0 ? 'partial' : (failed > 0 ? 'error' : 'success'));
  if (logEntry) {
    await serviceClient.from('docplanner_sync_log').update({
      status, records_synced: synced, records_failed: failed,
      error_details: errors.length ? errors : null, completed_at: new Date().toISOString(),
    }).eq('id', logEntry.id);
  }
  return new Response(JSON.stringify({ ok: true, synced, failed }), { status: 200, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) });
});