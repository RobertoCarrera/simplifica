// @ts-nocheck
// supabase/functions/_shared/redsys-crypto.ts
//
// Redsys TPV Virtual — firma HMAC-SHA256_V1.
// Usa `des-utils.ts` (port de des.js por Fedor Indutny, MIT) para el
// 3DES-EDE3-CBC, que es la pieza crítica. Todo lo demás (HMAC-SHA256,
// Base64, expand a Uint8Array) usa APIs nativas de Deno / WebCrypto.

import {
  desEncryptBlock,
  desDecryptBlock,
  tripleDesEde3CbcEncrypt,
} from './des-utils.ts';

// ─── Base64 helpers ───────────────────────────────────────────────────────
function base64Decode(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ─── 3DES-EDE3-CBC encrypt: cifra el DS_MERCHANT_ORDER con la clave Redsys ─
// Reproduce la lib oficial ssheduardo/sermepa (que Redsys usa server-side
// y que NO está documentada en el manual BBVA v1.4).
//
//   derived = 3DES-EDE3-CBC(order, secretBase64, IV=0)   (16 bytes)
//   sig     = base64(HMAC-SHA256(derived, params_b64))
//
export function redsys3DesEncrypt(order: string, secretBase64: string): Uint8Array {
  const keyBytes = base64Decode(secretBase64);
  // 3DES-EDE3 espera exactamente 24 bytes. La spec Redsys genera claves
  // de 16 bytes (EDE2) o 32 bytes. Expandimos 16→24 (K1K2K1) o truncamos
  // 32→24 (tomamos los primeros 24).
  let key24: Uint8Array;
  if (keyBytes.length === 16) {
    key24 = new Uint8Array(24);
    key24.set(keyBytes, 0);
    key24.set(keyBytes.subarray(0, 8), 16);
  } else if (keyBytes.length === 24) {
    key24 = keyBytes;
  } else if (keyBytes.length > 24) {
    key24 = keyBytes.subarray(0, 24);
  } else {
    throw new Error(`Redsys secret too short: ${keyBytes.length} bytes (need ≥ 16)`);
  }
  const orderBytes = new TextEncoder().encode(order);
  const iv = new Uint8Array(8); // IV = 0
  return tripleDesEde3CbcEncrypt(orderBytes, key24, iv);
}

// ─── HMAC-SHA256_V1 firma Redsys ──────────────────────────────────────────
export async function redsysSignHmacSha256(
  paramsB64: string,
  secretBase64: string,
  order: string,
): Promise<string> {
  const derived = redsys3DesEncrypt(order, secretBase64);
  const enc = new TextEncoder();
  const keyBytes = await crypto.subtle.importKey(
    'raw',
    derived,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyBytes, enc.encode(paramsB64));
  return base64Encode(new Uint8Array(sig));
}

// ─── Verifica firma del notify Redsys ─────────────────────────────────────
// El notify envía `Ds_Order` (no `Ds_Merchant_Order`) y firma en
// base64 URL-safe sin padding. Normalizamos antes de comparar.
export async function redsysVerifyNotify(
  paramsB64: string,
  signatureB64: string,
  secretBase64: string,
): Promise<{ valid: boolean; order?: string }> {
  const paramsJson = new TextDecoder().decode(base64Decode(paramsB64));
  const params = JSON.parse(paramsJson) as Record<string, string>;
  const order = params.Ds_Order || params.Ds_Merchant_Order;
  if (!order) return { valid: false };

  // Normalizar firma URL-safe → standard base64 con padding
  const normalizedSig = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalizedSig.length % 4 === 0 ? '' : '='.repeat(4 - (normalizedSig.length % 4));

  const expected = await redsysSignHmacSha256(paramsB64, secretBase64, order);
  const a = expected;
  const b = normalizedSig + pad;
  if (a.length !== b.length) return { valid: false };
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 ? { valid: true, order } : { valid: false };
}

// ─── Decode/Encode de parámetros merchant ─────────────────────────────────
export function decodeMerchantParameters(paramsB64: string): Record<string, string> {
  const norm = paramsB64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const json = new TextDecoder().decode(base64Decode(norm + pad));
  return JSON.parse(json) as Record<string, string>;
}

export function encodeMerchantParameters(params: Record<string, string>): string {
  const json = JSON.stringify(params);
  return base64Encode(new TextEncoder().encode(json))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── Hex helpers (sólo para tests) ────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) throw new Error(`hex string has odd length: ${clean.length}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

// ─── Exposed for tests ────────────────────────────────────────────────────
export const __test__ = {
  desEncryptBlock,
  desDecryptBlock,
  tripleDesEde3CbcEncrypt,
  redsys3DesEncrypt,
  encodeMerchantParameters,
  decodeMerchantParameters,
  hexToBytes,
  base64Decode,
  base64Encode,
};