// @ts-nocheck
// Edge Function: send-push-notification
// Purpose: Sends Web Push notifications to a user's subscribed browsers.
// Triggered by: pg_net from the notifications AFTER INSERT trigger, or directly
//               from other edge functions via internal HTTP call.
// Auth: service_role Bearer token (internal-only, verify_jwt = false).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@simplificacrm.es';

const FUNCTION_NAME = 'send-push-notification';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Convert a URL-safe base64 string to a Uint8Array */
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const raw = atob(base64 + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Convert Uint8Array to URL-safe base64 */
function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Import the VAPID private key as a CryptoKey for ECDSA signing */
async function importVapidPrivateKey(base64UrlKey: string): Promise<CryptoKey> {
  const rawKey = base64UrlToUint8Array(base64UrlKey);
  // The private key is a raw 32-byte P-256 scalar. Wrap it in JWK.
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: uint8ArrayToBase64Url(rawKey),
    // Public key x,y aren't needed for signing but the API may require them.
    // We derive them from the public key env var.
    x: '', y: '',
  };

  // Derive x,y from the uncompressed public key (65 bytes: 0x04 || x || y)
  const pubRaw = base64UrlToUint8Array(VAPID_PUBLIC_KEY);
  if (pubRaw.length === 65 && pubRaw[0] === 0x04) {
    jwk.x = uint8ArrayToBase64Url(pubRaw.slice(1, 33));
    jwk.y = uint8ArrayToBase64Url(pubRaw.slice(33, 65));
  }

  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Create a signed VAPID Authorization header (RFC 8292) */
async function createVapidAuth(audience: string): Promise<{ authorization: string; cryptoKey: string }> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: VAPID_SUBJECT,
  };

  const enc = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const key = await importVapidPrivateKey(VAPID_PRIVATE_KEY);
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(unsignedToken),
  );

  // ECDSA signature from WebCrypto is in IEEE P1363 format (r || s, 64 bytes) — JWT needs this exact format.
  const signatureB64 = uint8ArrayToBase64Url(new Uint8Array(signatureBuffer));
  const jwt = `${unsignedToken}.${signatureB64}`;

  return {
    authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    cryptoKey: `p256ecdsa=${VAPID_PUBLIC_KEY}`,
  };
}

/**
 * Send a Web Push message to a single subscription endpoint.
 * Returns true if delivered, false if gone (subscription expired).
 * Throws on network/unexpected errors.
 */
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payloadJson: string,
): Promise<boolean> {
  const endpointUrl = new URL(subscription.endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const vapidHeaders = await createVapidAuth(audience);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders,
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: new TextEncoder().encode(payloadJson),
  });

  if (res.status === 201 || res.status === 200) return true;
  if (res.status === 410 || res.status === 404) return false; // subscription expired
  // Log unexpected statuses but don't crash
  console.warn(`[${FUNCTION_NAME}] Push endpoint returned ${res.status}:`, await res.text().catch(() => ''));
  return true; // keep subscription — might be transient
}

// ── Main handler ─────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // Internal-only auth: caller must present the service role key
  const authHeader = req.headers.get('authorization') || '';
  const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse(500, { error: 'VAPID keys not configured' });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { user_id, title, body: notifBody, url, tag } = body;
  if (!user_id) {
    return jsonResponse(400, { error: 'user_id is required' });
  }

  // Fetch all push subscriptions for this user
  const { data: subscriptions, error: fetchErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user_id);

  if (fetchErr) {
    console.error(`[${FUNCTION_NAME}] DB error:`, fetchErr);
    return jsonResponse(500, { error: 'Database error' });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return jsonResponse(200, { sent: 0, message: 'No subscriptions for user' });
  }

  const payload = JSON.stringify({
    title: title || 'Simplifica',
    body: notifBody || '',
    url: url || '/',
    tag: tag || 'default',
  });

  let sent = 0;
  const expiredIds: string[] = [];

  for (const sub of subscriptions) {
    try {
      const delivered = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );
      if (delivered) {
        sent++;
      } else {
        expiredIds.push(sub.id);
      }
    } catch (err) {
      console.error(`[${FUNCTION_NAME}] Error sending to ${sub.endpoint}:`, err);
    }
  }

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('id', expiredIds);
    if (delErr) console.error(`[${FUNCTION_NAME}] Error deleting expired subs:`, delErr);
  }

  return jsonResponse(200, { sent, expired: expiredIds.length });
});
