// CSRF Protection Utility for Edge Functions
// Generates and validates CSRF tokens to prevent Cross-Site Request Forgery attacks

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CSRF token structure: base64(userId:timestamp:hmac)
// HMAC uses SECRET_KEY from env to prevent tampering

const CSRF_TOKEN_LIFETIME = 3600000; // 1 hour in milliseconds

async function generateHmac(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function generateCsrfToken(userId: string): Promise<string> {
  const secret = Deno.env.get('CSRF_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) {
    throw new Error('CSRF_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  
  const timestamp = Date.now().toString();
  const payload = `${userId}:${timestamp}`;
  const hmac = await generateHmac(payload, secret);
  
  return btoa(`${payload}:${hmac}`);
}

export async function validateCsrfToken(token: string, userId: string): Promise<boolean> {
  try {
    const secret = Deno.env.get('CSRF_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!secret) return false;
    
    const decoded = atob(token);
    const parts = decoded.split(':');
    
    if (parts.length !== 3) return false;
    
    const [tokenUserId, timestamp, receivedHmac] = parts;
    
    // Verify user ID matches
    if (tokenUserId !== userId) return false;
    
    // Verify token hasn't expired
    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime)) return false;
    if (Date.now() - tokenTime > CSRF_TOKEN_LIFETIME) return false;
    
    // Verify HMAC
    const payload = `${tokenUserId}:${timestamp}`;
    const expectedHmac = await generateHmac(payload, secret);
    
    return expectedHmac === receivedHmac;
  } catch (e) {
    console.error('CSRF token validation error:', e);
    return false;
  }
}

export function getCsrfHeaders(token?: string): Record<string, string> {
  if (token) {
    return {
      'X-CSRF-Token': token
    };
  }
  return {};
}

export function extractCsrfToken(req: Request): string | null {
  // Check header first
  let token = req.headers.get('X-CSRF-Token') || req.headers.get('x-csrf-token');
  
  // Check query parameter as fallback (less secure, but useful for GET requests)
  if (!token) {
    const url = new URL(req.url);
    token = url.searchParams.get('csrf_token');
  }
  
  return token;
}
