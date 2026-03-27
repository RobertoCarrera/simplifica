// @ts-nocheck
// ================================================================
// Edge Function: holded-booking-estimate
// ================================================================
// Called by trg_holded_booking_estimate when a booking status
// transitions to 'confirmed'.
//
// Flow:
//  1. Auth via service role Bearer token
//  2. Fetch booking + client + service details
//  3. Check company has Holded active + decrypt API key
//  4. Find or create Holded contact (by client email / name)
//  5. Create Holded estimate document (with tax)
//  6. Send estimate PDF to client via Holded /send endpoint
//  7. Update bookings.holded_estimate_id (idempotency lock)
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

/* ── env ─────────────────────────────────────────────────── */
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY   = Deno.env.get('ENCRYPTION_KEY');

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('[holded-booking-estimate] ENCRYPTION_KEY must be at least 32 characters');
}

/* ── AES-256-GCM decrypt ─────────────────────────────────── */
async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const keyData  = new TextEncoder().encode(ENCRYPTION_KEY!.slice(0, 32));
    const key      = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
    const iv       = combined.slice(0, 12);
    const data     = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

/* ── Holded API helpers ──────────────────────────────────── */
const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1';

async function holdedGet(path: string, apiKey: string): Promise<any> {
  const res = await fetch(`${HOLDED_BASE}${path}`, {
    headers: { 'key': apiKey, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Holded GET ${path} → ${res.status}`);
  return res.json();
}

async function holdedPost(path: string, body: unknown, apiKey: string): Promise<any> {
  const res = await fetch(`${HOLDED_BASE}${path}`, {
    method: 'POST',
    headers: {
      'key':          apiKey,
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Holded POST ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function findContact(email: string, apiKey: string): Promise<string | null> {
  if (!email) return null;
  try {
    const res = await fetch(
      `${HOLDED_BASE}/contacts?email=${encodeURIComponent(email)}`,
      { headers: { 'key': apiKey, 'Accept': 'application/json' } },
    );
    if (!res.ok) return null;
    const list = await res.json();
    if (Array.isArray(list) && list.length > 0) return list[0].id;
    return null;
  } catch {
    return null;
  }
}

async function createContact(
  name: string,
  email: string | null,
  phone: string | null,
  nif: string | null,
  apiKey: string,
): Promise<string> {
  const payload: Record<string, unknown> = {
    name,
    type:     'client',
    isperson: true,
  };
  if (email) payload.email  = email;
  if (phone) payload.mobile = phone;
  if (nif)   payload.code   = nif;

  const result = await holdedPost('/contacts', payload, apiKey);
  return result.id as string;
}

/* ── main handler ─────────────────────────────────────────── */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  /* ── 1. Auth: must be service role call (from DB trigger) ─ */
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  }
  const token = authHeader.replace('Bearer ', '');
  if (token !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Forbidden: service role required' }), { status: 403, headers });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    /* ── 2. Parse request ────────────────────────────────── */
    const { booking_id } = await req.json() as { booking_id: string };
    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id is required' }), { status: 400, headers });
    }

    /* ── 3. Idempotency: skip if already synced ──────────── */
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select(`
        id, company_id, status, payment_status, holded_estimate_id,
        total_price, notes,
        customer_name, customer_email, customer_phone,
        client_id,
        start_time,
        service:services(name, base_price, tax_rate),
        client:clients(name, email, phone, nif_cif)
      `)
      .eq('id', booking_id)
      .single();

    if (bErr || !booking) {
      console.error('[holded-booking-estimate] Booking not found:', booking_id, bErr);
      return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404, headers });
    }

    if (booking.holded_estimate_id) {
      console.log('[holded-booking-estimate] Already synced:', booking_id, '→', booking.holded_estimate_id);
      return new Response(JSON.stringify({ skipped: true, holded_estimate_id: booking.holded_estimate_id }), { status: 200, headers });
    }

    if (booking.status !== 'confirmed') {
      console.log('[holded-booking-estimate] Booking not confirmed, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'not confirmed' }), { status: 200, headers });
    }

    /* ── 4. Check Holded integration is active ───────────── */
    const { data: integration, error: intErr } = await supabase
      .from('holded_integrations')
      .select('api_key_encrypted, is_active')
      .eq('company_id', booking.company_id)
      .single();

    if (intErr || !integration?.is_active) {
      console.log('[holded-booking-estimate] Holded not active for company:', booking.company_id);
      return new Response(JSON.stringify({ skipped: true, reason: 'Holded not active' }), { status: 200, headers });
    }

    /* ── 5. Decrypt API key ──────────────────────────────── */
    const apiKey = await decrypt(integration.api_key_encrypted);
    if (!apiKey) {
      console.error('[holded-booking-estimate] Failed to decrypt API key for company:', booking.company_id);
      return new Response(JSON.stringify({ error: 'Could not decrypt Holded API key' }), { status: 500, headers });
    }

    /* ── 6. Resolve contact ──────────────────────────────── */
    const clientEmail = (booking.client as any)?.email || booking.customer_email || null;
    const clientName  = (booking.client as any)?.name  || booking.customer_name  || 'Cliente desconocido';
    const clientPhone = (booking.client as any)?.phone || booking.customer_phone || null;
    const clientNif   = (booking.client as any)?.nif_cif || null;

    let contactId = await findContact(clientEmail, apiKey);
    if (!contactId) {
      contactId = await createContact(clientName, clientEmail, clientPhone, clientNif, apiKey);
    }

    /* ── 7. Build document items (with tax) ──────────────── */
    const serviceName = (booking.service as any)?.name  || 'Servicio';
    const price       = booking.total_price ?? (booking.service as any)?.base_price ?? 0;
    const taxRate     = (booking.service as any)?.tax_rate ?? 21;
    const bookingDate = Math.floor(new Date(booking.start_time).getTime() / 1000);

    const docPayload = {
      contactId,
      date:  bookingDate,
      notes: `Reserva #${booking.id}${booking.notes ? ' — ' + booking.notes : ''}`,
      items: [
        {
          name:     serviceName,
          units:    1,
          subtotal: price,
          tax:      taxRate,
        },
      ],
    };

    /* ── 8. Create estimate in Holded ────────────────────── */
    const holdedDoc = await holdedPost('/documents/estimate', docPayload, apiKey);
    const holdedId  = holdedDoc.id as string;

    if (!holdedId) {
      throw new Error('Holded did not return a document id: ' + JSON.stringify(holdedDoc));
    }

    /* ── 9. Send estimate PDF to client via Holded ───────── */
    try {
      await holdedPost(`/documents/estimate/${holdedId}/send`, {}, apiKey);
      console.log(`[holded-booking-estimate] ✓ Sent estimate ${holdedId} to client`);
    } catch (sendErr: any) {
      // Non-fatal: the estimate was created, just couldn't email it
      console.warn(`[holded-booking-estimate] Could not send estimate email:`, sendErr?.message);
    }

    /* ── 10. Persist holded_estimate_id on the booking ───── */
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ holded_estimate_id: holdedId })
      .eq('id', booking_id);

    if (updateErr) {
      console.error('[holded-booking-estimate] Failed to update holded_estimate_id:', updateErr);
    }

    console.log(`[holded-booking-estimate] ✓ Created estimate ${holdedId} for booking ${booking_id}`);

    return new Response(JSON.stringify({
      success:            true,
      holded_estimate_id: holdedId,
      booking_id,
    }), { status: 200, headers });

  } catch (err: any) {
    console.error('[holded-booking-estimate] Error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(err?.message) }), { status: 500, headers });
  }
});
