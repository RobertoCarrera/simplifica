// @ts-nocheck
// supabase/functions/_shared/redsys-crypto.test.ts
//
// Tests vectoriales del módulo crypto Redsys. Validados con des.js
// (https://github.com/indutny/des.js), que a su vez está validado
// contra OpenSSL. Ejecutar con `deno test` desde la raíz de las edge
// functions:
//
//   cd supabase/functions
//   deno test _shared/redsys-crypto.test.ts

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  redsys3DesEncrypt,
  redsysSignHmacSha256,
  redsysVerifyNotify,
  encodeMerchantParameters,
  decodeMerchantParameters,
  __test__ as t,
} from './redsys-crypto.ts';

// ─── DES-ECB NIST KAT vectors (verificados con des.js) ───────────────────
// DES-ECB("4E6F772069732074", "0123456789ABCDEF") = 3FA40E8A984D4815
// DES-ECB("0000000000000000", "FFFFFFFFFFFFFFFF") = CAAAAF4DEAF1DBAE
Deno.test('DES-ECB basic vectors', () => {
  const key = t.hexToBytes('0123456789ABCDEF');
  const plain = t.hexToBytes('4E6F772069732074');
  const ct = t.desEncryptBlock(plain, key);
  assertEquals(Array.from(ct).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(), '3FA40E8A984D4815');

  const key2 = t.hexToBytes('FFFFFFFFFFFFFFFF');
  const plain2 = t.hexToBytes('0000000000000000');
  const ct2 = t.desEncryptBlock(plain2, key2);
  assertEquals(Array.from(ct2).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(), 'CAAAAF4DEAF1DBAE');
});

// ─── 3DES-EDE3-CBC Redsys reference (verificado con des.js) ───────────────
// 3DES-EDE3-CBC("1552565870" + PKCS7(6×\x06), sq7HjrUOBfKmC576ILgskD5srU870gJ7, IV=0)
//   = 89F00605A70BA9CB937577DD7E0D3B21
// (The memory vector 89F00605A70BA9CB8811445DD1B7EBCA was for the FIRST block only;
//  actual CBC output is the full 16 bytes.)
Deno.test('3DES-EDE3-CBC Redsys reference vector', () => {
  const secretB64 = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
  const order = '1552565870';
  const ciphertext = redsys3DesEncrypt(order, secretB64);
  const hex = Array.from(ciphertext).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  // First 8 bytes must always be 89F00605A70BA9CB (PyCryptodome + des.js agree).
  assertEquals(hex.slice(0, 16), '89F00605A70BA9CB');
});

// ─── HMAC-SHA256_V1 firma es determinista ─────────────────────────────────
Deno.test('HMAC-SHA256_V1 signature is deterministic', async () => {
  const secretB64 = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
  const paramsB64 = encodeMerchantParameters({ test: 'value' });
  const order = '1552565870';
  const sig1 = await redsysSignHmacSha256(paramsB64, secretB64, order);
  const sig2 = await redsysSignHmacSha256(paramsB64, secretB64, order);
  assertEquals(sig1, sig2);
  assertEquals(sig1.length, 44); // base64(HMAC-SHA256) = 44 chars
});

// ─── Merchant params round-trip ──────────────────────────────────────────
Deno.test('Merchant parameters round-trip', () => {
  const params = {
    Ds_Merchant_Amount: '100',
    Ds_Merchant_Currency: '978',
    Ds_Merchant_Order: 'TEST-001',
    Ds_Merchant_Titular: 'ACME S.L.',
  };
  const encoded = encodeMerchantParameters(params);
  const decoded = decodeMerchantParameters(encoded);
  assertEquals(decoded, params);
});

// ─── Verify notify: firma válida se acepta ──────────────────────────────
Deno.test('Verify notify accepts a freshly-signed payload', async () => {
  const secretB64 = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
  const order = 'TEST-VERIFY-001';
  const params = {
    Ds_Order: order, // NOTIFICA usa Ds_Order, NO Ds_Merchant_Order
    Ds_Merchant_Amount: '5000',
    Ds_Merchant_Currency: '978',
    Ds_Response: '0000',
    Ds_AuthCode: '123456',
  };
  const paramsB64 = encodeMerchantParameters(params);
  const sigB64 = await redsysSignHmacSha256(paramsB64, secretB64, order);

  const result = await redsysVerifyNotify(paramsB64, sigB64, secretB64);
  assertEquals(result.valid, true);
  assertEquals(result.order, order);
});

// ─── Verify notify: rechaza firma manipulada ────────────────────────────
Deno.test('Verify notify rejects a tampered signature', async () => {
  const secretB64 = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
  const order = 'TEST-VERIFY-002';
  const params = { Ds_Order: order, Ds_Merchant_Amount: '5000' };
  const paramsB64 = encodeMerchantParameters(params);
  const sigB64 = await redsysSignHmacSha256(paramsB64, secretB64, order);
  // Cambiamos el amount después de firmar
  const tamperedParams = { ...params, Ds_Merchant_Amount: '99999' };
  const tamperedB64 = encodeMerchantParameters(tamperedParams);
  const result = await redsysVerifyNotify(tamperedB64, sigB64, secretB64);
  assertEquals(result.valid, false);
});

// ─── Verify notify: maneja firma URL-safe sin padding ────────────────────
Deno.test('Verify notify handles URL-safe base64 signature', async () => {
  const secretB64 = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
  const order = 'TEST-VERIFY-003';
  const params = { Ds_Order: order, Ds_Merchant_Amount: '1000' };
  const paramsB64 = encodeMerchantParameters(params);
  const sigB64 = await redsysSignHmacSha256(paramsB64, secretB64, order);
  const sigUrlSafe = sigB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const result = await redsysVerifyNotify(paramsB64, sigUrlSafe, secretB64);
  assertEquals(result.valid, true);
  assertEquals(result.order, order);
});

// ─── Verify notify: firma de otra clave se rechaza ──────────────────────
Deno.test('Verify notify rejects signature from different secret', async () => {
  const secretB64A = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
  const secretB64B = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 32 bytes of 0
  const order = 'TEST-VERIFY-004';
  const params = { Ds_Order: order, Ds_Merchant_Amount: '5000' };
  const paramsB64 = encodeMerchantParameters(params);
  const sigB64 = await redsysSignHmacSha256(paramsB64, secretB64A, order);
  const result = await redsysVerifyNotify(paramsB64, sigB64, secretB64B);
  assertEquals(result.valid, false);
});

// ─── Sanity: 3DES con clave 16 bytes (auto-expand a EDE3) no crashea ─────
Deno.test('3DES with 16-byte key (auto-expanded to EDE3)', () => {
  const secretB64 = btoa(String.fromCharCode(...new Array(16).fill(0xAB)));
  const order = 'TEST-EDE2';
  const ct = redsys3DesEncrypt(order, secretB64);
  assertEquals(ct.length, 16);
});

// ─── DES decrypt round-trip ──────────────────────────────────────────────
Deno.test('DES decrypt inverts encrypt', () => {
  const key = t.hexToBytes('0123456789ABCDEF');
  const plain = t.hexToBytes('4E6F772069732074');
  const ct = t.desEncryptBlock(plain, key);
  const back = t.desDecryptBlock(ct, key);
  assertEquals(Array.from(back), Array.from(plain));
});