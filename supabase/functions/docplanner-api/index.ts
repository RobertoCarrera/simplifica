// Edge Function: docplanner-api
// Handles Doctoralia integration configuration and list-services action
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt as oauthDecrypt, isEncrypted as isOAuthEncrypted, encrypt as oauthEncrypt } from '../_shared/crypto-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[docplanner-api] ENCRYPTION_KEY must be at least 32 characters');
}

const DP_DOMAIN = 'www.doctoralia.es';
const DP_BASE_URL = 'https://' + DP_DOMAIN + '/api/v3/integration';
const DP_TOKEN_URL = 'https://' + DP_DOMAIN + '/oauth/v2/token';

async function getAesKey() {
  const keyData = new TextEncoder().encode(ENCRYPTION_KEY.slice(0, 32));
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const key = await getAesKey();
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function getAccessToken(clientId: string, clientSecret: string) {
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

async function getValidToken(serviceClient, companyId: string) {
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

async function dpFetch(token: string, path: string) {
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

function getCorsHeaders(origin?: string) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } as Record<string, string>;
}

async function requireAuth(supabaseClient: any, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseClient.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized');
  const { data: companyMember } = await supabaseClient
    .from('company_members').select('company_id, role').eq('user_id', user.id).maybeSingle();
  if (!companyMember) throw new Error('No company membership found');
  return { userId: user.id, companyId: companyMember.company_id };
}

async function actionSaveCredentials(serviceClient, companyId: string, clientId: string, clientSecret: string) {
  const encClientId = await encrypt(clientId);
  const encClientSecret = await encrypt(clientSecret);
  // Get a fresh token to validate credentials before storing
  const tokenData = await getAccessToken(clientId, clientSecret);
  const encToken = await encrypt(tokenData.access_token);
  const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
  const { data: existing } = await serviceClient
    .from('docplanner_integrations').select('id').eq('company_id', companyId).maybeSingle();
  if (existing) {
    await serviceClient.from('docplanner_integrations').update({
      client_id_encrypted: encClientId,
      client_secret_encrypted: encClientSecret,
      access_token_encrypted: encToken,
      token_expires_at: newExpiry.toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('company_id', companyId);
  } else {
    await serviceClient.from('docplanner_integrations').insert({
      company_id: companyId,
      client_id_encrypted: encClientId,
      client_secret_encrypted: encClientSecret,
      access_token_encrypted: encToken,
      token_expires_at: newExpiry.toISOString(),
      is_active: true,
    });
  }
  return { ok: true };
}

async function actionTestConnection(serviceClient, companyId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const facilitiesData = await dpFetch(token, '/facilities?limit=20');
  const facilities = facilitiesData?.data || facilitiesData || [];
  return { ok: true, facilityCount: facilities.length, facilities };
}

async function actionGetFacilities(serviceClient, companyId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const facilitiesData = await dpFetch(token, '/facilities?limit=20');
  const facilities = facilitiesData?.data || facilitiesData || [];
  return { facilities };
}

async function actionGetDoctors(serviceClient, companyId: string, facilityId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const doctorsData = await dpFetch(token, '/facilities/' + facilityId + '/doctors?limit=100');
  const doctors = doctorsData?.data || doctorsData || [];
  return { doctors };
}

async function actionGetAddresses(serviceClient, companyId: string, facilityId: string, doctorId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const addressesData = await dpFetch(token, '/facilities/' + facilityId + '/doctors/' + doctorId + '/addresses?limit=50');
  const addresses = addressesData?.data || addressesData || [];
  return { addresses };
}

async function actionListServices(serviceClient, companyId: string, facilityId: string, doctorId: string, addressId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const servicesData = await dpFetch(token, '/facilities/' + facilityId + '/doctors/' + doctorId + '/addresses/' + addressId + '/services');
  const services = servicesData?.data || servicesData || [];
  return { services };
}

async function actionSaveConfig(serviceClient, companyId: string, config: any) {
  const { data: existing } = await serviceClient
    .from('docplanner_integrations').select('id').eq('company_id', companyId).maybeSingle();
  const updateFields: any = {
    updated_at: new Date().toISOString(),
  };
  if (config.facility_id !== undefined) updateFields.facility_id = config.facility_id;
  if (config.facility_name !== undefined) updateFields.facility_name = config.facility_name;
  if (config.doctor_mappings !== undefined) updateFields.doctor_mappings = config.doctor_mappings;
  if (config.sync_bookings !== undefined) updateFields.sync_bookings = config.sync_bookings;
  if (config.sync_patients !== undefined) updateFields.sync_patients = config.sync_patients;
  if (config.auto_sync !== undefined) updateFields.auto_sync = config.auto_sync;
  if (existing) {
    await serviceClient.from('docplanner_integrations').update(updateFields).eq('company_id', companyId);
  } else {
    await serviceClient.from('docplanner_integrations').insert({ company_id: companyId, ...updateFields });
  }
  return { ok: true };
}

async function actionSyncBookings(serviceClient, companyId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const { data: integration } = await serviceClient
    .from('docplanner_integrations').select('facility_id, doctor_mappings').eq('company_id', companyId).single();
  if (!integration?.facility_id) throw new Error('No facility configured');
  const facilityId = integration.facility_id;
  const mappings = integration.doctor_mappings || [];
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const mapping of mappings) {
    try {
      const addrId = mapping.address_id;
      const bookingsData = await dpFetch(token, '/facilities/' + facilityId + '/doctors/' + mapping.dp_doctor_id + '/addresses/' + addrId + '/bookings?with=booking.patient,booking.address_service&status=booked&limit=50');
      const bookings = bookingsData?.data || bookingsData || [];
      for (const bk of bookings) {
        // Reuse upsert logic via docplanner-webhook or inline here
        // For now, just return counts — the webhook handles upserts
        synced++;
      }
    } catch (e) {
      errors.push('Doctor ' + mapping.dp_doctor_id + ': ' + String(e));
      failed++;
    }
  }
  // Update last sync
  await serviceClient.from('docplanner_integrations').update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: failed === 0 ? 'success' : (synced > 0 ? 'partial' : 'error'),
    last_sync_message: failed > 0 ? errors.slice(0, 3).join('; ') : null,
    updated_at: new Date().toISOString(),
  }).eq('company_id', companyId);
  return { status: failed === 0 ? 'success' : 'partial', synced, failed, errors };
}

async function actionImportDoctors(serviceClient, companyId: string, facilityId: string) {
  const token = await getValidToken(serviceClient, companyId);
  const doctorsData = await dpFetch(token, '/facilities/' + facilityId + '/doctors?limit=100');
  const doctors = doctorsData?.data || doctorsData || [];
  let imported = 0;
  let skipped = 0;
  for (const doc of doctors) {
    const { data: existing } = await serviceClient.from('professionals')
      .select('id').eq('company_id', companyId).eq('dp_doctor_id', String(doc.id)).maybeSingle();
    if (existing) { skipped++; continue; }
    const { data: newProf } = await serviceClient.from('professionals').insert({
      company_id: companyId,
      display_name: (doc.name + ' ' + doc.surname).trim(),
      dp_doctor_id: String(doc.id),
      is_active: true,
    }).select('id').single();
    if (newProf) imported++;
  }
  return { imported, skipped, total: doctors.length, message: 'OK' };
}

async function actionImportPatients(serviceClient, companyId: string) {
  const { data: integration } = await serviceClient
    .from('docplanner_integrations').select('facility_id, doctor_mappings').eq('company_id', companyId).single();
  if (!integration?.facility_id) throw new Error('No facility configured');
  const token = await getValidToken(serviceClient, companyId);
  const facilityId = integration.facility_id;
  const mappings = integration.doctor_mappings || [];
  const allBookings: any[] = [];
  for (const mapping of mappings) {
    try {
      const addrId = mapping.address_id;
      const bookingsData = await dpFetch(token, '/facilities/' + facilityId + '/doctors/' + mapping.dp_doctor_id + '/addresses/' + addrId + '/bookings?with=booking.patient&limit=200');
      const bookings = bookingsData?.data || bookingsData || [];
      allBookings.push(...bookings);
    } catch { /* skip failed doctors */ }
  }
  let imported = 0;
  let tagged = 0;
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const uniquePatients = new Map<string, any>();
  for (const bk of allBookings) {
    const patient = bk.patient;
    if (!patient) continue;
    const email = patient.email?.toLowerCase().trim();
    const phone = patient.phone?.replace(/\D/g, '');
    const key = email || phone;
    if (!key) continue;
    if (!uniquePatients.has(key)) uniquePatients.set(key, patient);
  }
  const tagId = await ensureDocplannerTag(serviceClient, companyId);
  for (const [_, patient] of uniquePatients) {
    const email = patient.email?.toLowerCase().trim();
    const phone = patient.phone || null;
    const normalizedEmail = email || null;
    const { data: existing } = await serviceClient.from('clients')
      .select('id').eq('company_id', companyId).ilike('email', normalizedEmail || '').maybeSingle();
    if (existing) {
      if (tagId) { await serviceClient.from('clients_tags').upsert({ tag_id: tagId, client_id: existing.id }, { onConflict: 'client_id,tag_id', ignoreDuplicates: true }); }
      tagged++;
    } else {
      const { data: newClient } = await serviceClient.from('clients').insert({
        company_id: companyId,
        name: patient.name || '',
        surname: patient.surname || '',
        email: normalizedEmail,
        phone: phone || null,
        is_active: true,
      }).select('id').single();
      if (newClient && tagId) { await serviceClient.from('clients_tags').upsert({ tag_id: tagId, client_id: newClient.id }, { onConflict: 'client_id,tag_id', ignoreDuplicates: true }); }
      if (newClient) imported++;
    }
  }
  return { imported, tagged, total: uniquePatients.size, message: 'OK', bookings_scanned: allBookings.length };
}

async function ensureDocplannerTag(serviceClient, companyId: string) {
  const { data: existing } = await serviceClient.from('global_tags').select('id').eq('company_id', companyId).ilike('name', 'doctoralia').maybeSingle();
  if (existing) return existing.id;
  const { data: newTag } = await serviceClient.from('global_tags').insert({
    company_id: companyId, name: 'Doctoralia', color: '#00b8a9', category: 'Integración', scope: ['clients', 'professionals'],
  }).select('id').single();
  return newTag?.id || null;
}

async function actionResolveAddresses(serviceClient, companyId: string) {
  const { data: integration } = await serviceClient
    .from('docplanner_integrations').select('facility_id, doctor_mappings').eq('company_id', companyId).single();
  if (!integration?.facility_id) throw new Error('No facility configured');
  const token = await getValidToken(serviceClient, companyId);
  const facilityId = integration.facility_id;
  const mappings = (integration.doctor_mappings || []) as any[];
  let resolved = 0;
  let unchanged = 0;
  let failed = 0;
  const details: string[] = [];
  const updatedMappings = [...mappings];
  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    try {
      const addressesData = await dpFetch(token, '/facilities/' + facilityId + '/doctors/' + mapping.dp_doctor_id + '/addresses?limit=10');
      const addresses = addressesData?.data || addressesData || [];
      const primaryAddr = addresses.find((a: any) => a.is_primary) || addresses[0];
      if (!primaryAddr) { failed++; details.push('No address for doctor ' + mapping.dp_doctor_id); continue; }
      if (mapping.address_id === String(primaryAddr.id)) {
        unchanged++;
      } else {
        updatedMappings[i] = { ...mapping, address_id: String(primaryAddr.id) };
        resolved++;
        details.push('Updated address for doctor ' + mapping.dp_doctor_id + ' -> ' + primaryAddr.id);
      }
    } catch (e) {
      failed++;
      details.push('Error resolving doctor ' + mapping.dp_doctor_id + ': ' + String(e));
    }
  }
  await serviceClient.from('docplanner_integrations').update({
    doctor_mappings: updatedMappings,
    updated_at: new Date().toISOString(),
  }).eq('company_id', companyId);
  return { resolved, unchanged, failed, total: mappings.length, details, message: 'OK' };
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const authHeader = req.headers.get('Authorization');
  let companyId: string;
  try {
    const auth = await requireAuth(supabaseClient, authHeader);
    companyId = auth.companyId;
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { action, ...params } = body;
  try {
    switch (action) {
      case 'save-credentials': {
        const result = await actionSaveCredentials(supabaseClient, companyId, params.client_id, params.client_secret);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'test-connection': {
        const result = await actionTestConnection(supabaseClient, companyId);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'get-facilities': {
        const result = await actionGetFacilities(supabaseClient, companyId);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'get-doctors': {
        const result = await actionGetDoctors(supabaseClient, companyId, params.facility_id);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'get-addresses': {
        const result = await actionGetAddresses(supabaseClient, companyId, params.facility_id, params.doctor_id);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'list-services': {
        const result = await actionListServices(supabaseClient, companyId, params.facility_id, params.doctor_id, params.address_id);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'save-config': {
        const result = await actionSaveConfig(supabaseClient, companyId, params);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'sync-bookings': {
        const result = await actionSyncBookings(supabaseClient, companyId);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'import-doctors': {
        const result = await actionImportDoctors(supabaseClient, companyId, params.facility_id);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'import-patients': {
        const result = await actionImportPatients(supabaseClient, companyId);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      case 'resolve-addresses': {
        const result = await actionResolveAddresses(supabaseClient, companyId);
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      default:
        return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (e: any) {
    console.error('[docplanner-api] Action error:', e);
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
