// @ts-nocheck
// supabase/functions/_shared/des-utils.ts
//
// Ported from des.js (https://github.com/indutny/des.js), MIT © Fedor Indutny.
// This file mirrors the original layout exactly:
//   • subkeys stored as 2×24-bit ints (state.keys[i] + state.keys[i+1])
//   • expand() outputs 2×24-bit halves (not a 48-bit int)
//   • substitute(inL, inR) takes the two halves and returns 32 bits
//   • permute() is the P-permutation on a single 32-bit value
//
// Why a verbatim port: DES is full of subtle bugs in the permutations
// (width arg, 1-indexed vs 0-indexed, key schedule rotations). The
// original des.js is production-tested against OpenSSL for years; we
// don't want to re-derive that.

const SHIFT_TABLE = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

// S-box table: 8 boxes × 64 entries each = 512 ints.
const SBOX = [
  // S1
  14, 0, 4, 15, 13, 7, 1, 4, 2, 14, 15, 2, 11, 13, 8, 1,
  3, 10, 10, 6, 6, 12, 12, 11, 5, 9, 9, 5, 0, 3, 7, 8,
  4, 15, 1, 12, 14, 8, 8, 2, 13, 4, 6, 9, 2, 1, 11, 7,
  15, 5, 12, 11, 9, 3, 7, 14, 3, 10, 10, 0, 5, 6, 0, 13,
  // S2
  15, 3, 1, 13, 8, 4, 14, 7, 6, 15, 11, 2, 3, 8, 4, 14,
  9, 12, 7, 0, 2, 1, 13, 10, 12, 6, 0, 9, 5, 11, 10, 5,
  0, 13, 14, 8, 7, 10, 11, 1, 10, 3, 4, 15, 13, 4, 1, 2,
  5, 11, 8, 6, 12, 7, 6, 12, 9, 0, 3, 5, 2, 14, 15, 9,
  // S3
  10, 13, 0, 7, 9, 0, 14, 9, 6, 3, 3, 4, 15, 6, 5, 10,
  1, 2, 13, 8, 12, 5, 7, 14, 11, 12, 4, 11, 2, 15, 8, 1,
  13, 1, 6, 10, 4, 13, 9, 0, 8, 6, 15, 9, 3, 8, 0, 7,
  11, 4, 1, 15, 2, 14, 12, 3, 5, 11, 10, 5, 14, 2, 7, 12,
  // S4
  7, 13, 13, 8, 14, 11, 3, 5, 0, 6, 6, 15, 9, 0, 10, 3,
  1, 4, 2, 7, 8, 2, 5, 12, 11, 1, 12, 10, 4, 14, 15, 9,
  10, 3, 6, 15, 9, 0, 0, 6, 12, 10, 11, 1, 7, 13, 13, 8,
  15, 9, 1, 4, 3, 5, 14, 11, 5, 12, 2, 7, 8, 2, 4, 14,
  // S5
  2, 14, 12, 11, 4, 2, 1, 12, 7, 4, 10, 7, 11, 13, 6, 1,
  8, 5, 5, 0, 3, 15, 15, 10, 13, 3, 0, 9, 14, 8, 9, 6,
  4, 11, 2, 8, 1, 12, 11, 7, 10, 1, 13, 14, 7, 2, 8, 13,
  15, 6, 9, 15, 12, 0, 5, 9, 6, 10, 3, 4, 0, 5, 14, 3,
  // S6
  12, 10, 1, 15, 10, 4, 15, 2, 9, 7, 2, 12, 6, 9, 8, 5,
  0, 6, 13, 1, 3, 13, 4, 14, 14, 0, 7, 11, 5, 3, 11, 8,
  9, 4, 14, 3, 15, 2, 5, 12, 2, 9, 8, 5, 12, 15, 3, 10,
  7, 11, 0, 14, 4, 1, 10, 7, 1, 6, 13, 0, 11, 8, 6, 13,
  // S7
  4, 13, 11, 0, 2, 11, 14, 7, 15, 4, 0, 9, 8, 1, 13, 10,
  3, 14, 12, 3, 9, 5, 7, 12, 5, 2, 10, 15, 6, 8, 1, 6,
  1, 6, 4, 11, 11, 13, 13, 8, 12, 1, 3, 4, 7, 10, 14, 7,
  10, 9, 15, 5, 6, 0, 8, 15, 0, 14, 5, 2, 9, 3, 2, 12,
  // S8
  13, 1, 2, 15, 8, 13, 4, 8, 6, 10, 15, 3, 11, 7, 1, 4,
  10, 12, 9, 5, 3, 6, 14, 11, 5, 0, 0, 14, 12, 9, 7, 2,
  7, 2, 11, 1, 4, 14, 1, 7, 9, 4, 12, 10, 14, 8, 2, 13,
  0, 15, 6, 12, 10, 9, 13, 0, 15, 3, 3, 5, 5, 6, 8, 11,
];

// P-permutation (32 → 32 bits).
const PERMUTE_TABLE = [
  16, 25, 12, 11, 3, 20, 4, 15, 31, 17, 9, 6, 27, 14, 1, 22,
  30, 24, 8, 18, 0, 5, 29, 23, 13, 19, 2, 26, 10, 21, 28, 7,
];

// PC2 table (48 bits → split into 24 + 24).
const PC2_TABLE = [
  // inL → outL (24 entries)
  14, 11, 17, 4, 27, 23, 25, 0,
  13, 22, 7, 18, 5, 9, 16, 24,
  2, 20, 12, 21, 1, 8, 15, 26,
  // inR → outR (24 entries)
  15, 4, 25, 19, 9, 1, 26, 16,
  5, 11, 23, 8, 12, 7, 17, 0,
  22, 3, 10, 14, 6, 20, 27, 24,
];

// ─── IP / RIP (FP = IP^-1) ────────────────────────────────────────────────
export function ip(inL: number, inR: number, out: number[], off: number): void {
  let outL = 0;
  let outR = 0;
  for (let i = 6; i >= 0; i -= 2) {
    for (let j = 0; j <= 24; j += 8) {
      outL <<= 1;
      outL |= (inR >>> (j + i)) & 1;
    }
    for (let j = 0; j <= 24; j += 8) {
      outL <<= 1;
      outL |= (inL >>> (j + i)) & 1;
    }
  }
  for (let i = 6; i >= 0; i -= 2) {
    for (let j = 1; j <= 25; j += 8) {
      outR <<= 1;
      outR |= (inR >>> (j + i)) & 1;
    }
    for (let j = 1; j <= 25; j += 8) {
      outR <<= 1;
      outR |= (inL >>> (j + i)) & 1;
    }
  }
  out[off] = outL >>> 0;
  out[off + 1] = outR >>> 0;
}

export function rip(inL: number, inR: number, out: number[], off: number): void {
  let outL = 0;
  let outR = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 24; j >= 0; j -= 8) {
      outL <<= 1;
      outL |= (inR >>> (j + i)) & 1;
      outL <<= 1;
      outL |= (inL >>> (j + i)) & 1;
    }
  }
  for (let i = 4; i < 8; i++) {
    for (let j = 24; j >= 0; j -= 8) {
      outR <<= 1;
      outR |= (inR >>> (j + i)) & 1;
      outR <<= 1;
      outR |= (inL >>> (j + i)) & 1;
    }
  }
  out[off] = outL >>> 0;
  out[off + 1] = outR >>> 0;
}

// ─── PC1 (64 → 56 bits split into C/D as two 32-bit ints) ──────────────────
export function pc1(inL: number, inR: number, out: number[], off: number): void {
  let outL = 0;
  let outR = 0;
  for (let i = 7; i >= 5; i--) {
    for (let j = 0; j <= 24; j += 8) {
      outL <<= 1;
      outL |= (inR >> (j + i)) & 1;
    }
    for (let j = 0; j <= 24; j += 8) {
      outL <<= 1;
      outL |= (inL >> (j + i)) & 1;
    }
  }
  for (let j = 0; j <= 24; j += 8) {
    outL <<= 1;
    outL |= (inR >> (j + 4)) & 1;
  }
  for (let i = 1; i <= 3; i++) {
    for (let j = 0; j <= 24; j += 8) {
      outR <<= 1;
      outR |= (inR >> (j + i)) & 1;
    }
    for (let j = 0; j <= 24; j += 8) {
      outR <<= 1;
      outR |= (inL >> (j + i)) & 1;
    }
  }
  for (let j = 0; j <= 24; j += 8) {
    outR <<= 1;
    outR |= (inL >> (j + 4)) & 1;
  }
  out[off] = outL >>> 0;
  out[off + 1] = outR >>> 0;
}

// ─── 28-bit left rotate ─────────────────────────────────────────────────────
export function r28shl(num: number, shift: number): number {
  return ((num << shift) & 0xfffffff) | (num >>> (28 - shift));
}

// ─── PC2 (56 bits C+D → 48-bit subkey split as 24+24) ─────────────────────
export function pc2(inL: number, inR: number, out: number[], off: number): void {
  let outL = 0;
  let outR = 0;
  const len = PC2_TABLE.length >>> 1;
  for (let i = 0; i < len; i++) {
    outL <<= 1;
    outL |= (inL >>> PC2_TABLE[i]) & 1;
  }
  for (let i = len; i < PC2_TABLE.length; i++) {
    outR <<= 1;
    outR |= (inR >>> PC2_TABLE[i]) & 1;
  }
  out[off] = outL >>> 0;
  out[off + 1] = outR >>> 0;
}

// ─── Expand 32-bit R → 48-bit (as 24+24) ──────────────────────────────────
export function expand(r: number, out: number[], off: number): void {
  let outL = 0;
  let outR = 0;
  outL = ((r & 1) << 5) | (r >>> 27);
  for (let i = 23; i >= 15; i -= 4) {
    outL <<= 6;
    outL |= (r >>> i) & 0x3f;
  }
  for (let i = 11; i >= 3; i -= 4) {
    outR |= (r >>> i) & 0x3f;
    outR <<= 6;
  }
  outR |= ((r & 0x1f) << 1) | (r >>> 31);
  out[off] = outL >>> 0;
  out[off + 1] = outR >>> 0;
}

// ─── S-box substitution (48 bits → 32 bits) ───────────────────────────────
export function substitute(inL: number, inR: number): number {
  let out = 0;
  for (let i = 0; i < 4; i++) {
    const b = (inL >>> (18 - i * 6)) & 0x3f;
    const sb = SBOX[i * 0x40 + b];
    out <<= 4;
    out |= sb;
  }
  for (let i = 0; i < 4; i++) {
    const b = (inR >>> (18 - i * 6)) & 0x3f;
    const sb = SBOX[4 * 0x40 + i * 0x40 + b];
    out <<= 4;
    out |= sb;
  }
  return out >>> 0;
}

// ─── P permutation (32 bits) ──────────────────────────────────────────────
export function permute(num: number): number {
  let out = 0;
  for (let i = 0; i < PERMUTE_TABLE.length; i++) {
    out <<= 1;
    out |= (num >>> PERMUTE_TABLE[i]) & 1;
  }
  return out >>> 0;
}

// ─── BE read/write (32-bit unsigned) ──────────────────────────────────────
export function readUInt32BE(bytes: Uint8Array, off: number): number {
  return (
    (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]
  ) >>> 0;
}

export function writeUInt32BE(bytes: Uint8Array, value: number, off: number): void {
  bytes[off] = (value >>> 24) & 0xff;
  bytes[off + 1] = (value >>> 16) & 0xff;
  bytes[off + 2] = (value >>> 8) & 0xff;
  bytes[off + 3] = value & 0xff;
}

// ─── Derive 16 subkeys as 2×24-bit halves (32 ints total) ──────────────────
export function deriveKeys(key: Uint8Array): Uint32Array {
  const out = new Uint32Array(32);
  let kL = readUInt32BE(key, 0);
  let kR = readUInt32BE(key, 4);
  const tmp = [0, 0];
  pc1(kL, kR, tmp, 0);
  kL = tmp[0];
  kR = tmp[1];
  for (let i = 0; i < 16; i++) {
    const shift = SHIFT_TABLE[i];
    kL = r28shl(kL, shift);
    kR = r28shl(kR, shift);
    pc2(kL, kR, out as unknown as number[], i * 2);
  }
  return out;
}

// ─── Feistel round helper (used internally) ───────────────────────────────
function feistel(
  l: number,
  r: number,
  keys: Uint32Array,
  decrypt: boolean,
  eOut: number[],
): { l: number; r: number } {
  let newL = l;
  let newR = r;
  for (let i = 0; i < 16; i++) {
    const keyIdx = decrypt ? 15 - i : i;
    const keyL = keys[keyIdx * 2];
    const keyR = keys[keyIdx * 2 + 1];

    expand(newR, eOut, 0);
    const eL = (keyL ^ eOut[0]) >>> 0;
    const eR = (keyR ^ eOut[1]) >>> 0;
    const s = substitute(eL, eR);
    const f = permute(s);

    const t = newR;
    newR = (newL ^ f) >>> 0;
    newL = t;
  }
  return { l: newL, r: newR };
}

// ─── Encrypt one 8-byte block ─────────────────────────────────────────────
export function desEncryptBlock(input: Uint8Array, key: Uint8Array): Uint8Array {
  const keys = deriveKeys(key);
  let l = readUInt32BE(input, 0);
  let r = readUInt32BE(input, 4);
  const ipOut = [0, 0];
  ip(l, r, ipOut, 0);
  l = ipOut[0];
  r = ipOut[1];

  const eOut = [0, 0];
  const { l: nl, r: nr } = feistel(l, r, keys, false, eOut);

  const out = [0, 0];
  // Final permutation uses pre-output = (R16 || L16)
  rip(nr, nl, out, 0);

  const result = new Uint8Array(8);
  writeUInt32BE(result, out[0], 0);
  writeUInt32BE(result, out[1], 4);
  return result;
}

// ─── Decrypt one 8-byte block ─────────────────────────────────────────────
export function desDecryptBlock(input: Uint8Array, key: Uint8Array): Uint8Array {
  const keys = deriveKeys(key);
  let l = readUInt32BE(input, 0);
  let r = readUInt32BE(input, 4);
  const ipOut = [0, 0];
  ip(l, r, ipOut, 0);
  l = ipOut[0];
  r = ipOut[1];

  const eOut = [0, 0];
  const { l: nl, r: nr } = feistel(l, r, keys, true, eOut);

  const out = [0, 0];
  rip(nr, nl, out, 0);

  const result = new Uint8Array(8);
  writeUInt32BE(result, out[0], 0);
  writeUInt32BE(result, out[1], 4);
  return result;
}

// ─── 3DES-EDE3-CBC encrypt ────────────────────────────────────────────────
export function tripleDesEde3CbcEncrypt(
  plaintext: Uint8Array,
  key24: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  if (key24.length !== 24) throw new Error('3DES key must be 24 bytes');
  if (iv.length !== 8) throw new Error('IV must be 8 bytes');
  const K1 = key24.subarray(0, 8);
  const K2 = key24.subarray(8, 16);
  const K3 = key24.subarray(16, 24);
  const sub1 = deriveKeys(K1);
  const sub2 = deriveKeys(K2);
  const sub3 = deriveKeys(K3);

  // PKCS#7 padding
  const padLen = 8 - (plaintext.length % 8);
  const padded = new Uint8Array(plaintext.length + padLen);
  padded.set(plaintext);
  for (let i = plaintext.length; i < padded.length; i++) padded[i] = padLen;

  const out = new Uint8Array(padded.length);
  let prev = new Uint8Array(iv);
  for (let off = 0; off < padded.length; off += 8) {
    const block = new Uint8Array(8);
    for (let i = 0; i < 8; i++) block[i] = padded[off + i] ^ prev[i];
    const e1 = block.slice();
    // Apply F1 (encrypt with K1) — manual round walk
    {
      let l = readUInt32BE(e1, 0), r = readUInt32BE(e1, 4);
      const ipOut = [0, 0]; ip(l, r, ipOut, 0); l = ipOut[0]; r = ipOut[1];
      const eBuf = [0, 0];
      const { l: nl, r: nr } = feistel(l, r, sub1, false, eBuf);
      const fpOut = [0, 0]; rip(nr, nl, fpOut, 0);
      writeUInt32BE(e1, fpOut[0], 0); writeUInt32BE(e1, fpOut[1], 4);
    }
    // F2: decrypt with K2
    const e2 = new Uint8Array(8);
    {
      let l = readUInt32BE(e1, 0), r = readUInt32BE(e1, 4);
      const ipOut = [0, 0]; ip(l, r, ipOut, 0); l = ipOut[0]; r = ipOut[1];
      const eBuf = [0, 0];
      const { l: nl, r: nr } = feistel(l, r, sub2, true, eBuf);
      const fpOut = [0, 0]; rip(nr, nl, fpOut, 0);
      writeUInt32BE(e2, fpOut[0], 0); writeUInt32BE(e2, fpOut[1], 4);
    }
    // F3: encrypt with K3
    const e3 = new Uint8Array(8);
    {
      let l = readUInt32BE(e2, 0), r = readUInt32BE(e2, 4);
      const ipOut = [0, 0]; ip(l, r, ipOut, 0); l = ipOut[0]; r = ipOut[1];
      const eBuf = [0, 0];
      const { l: nl, r: nr } = feistel(l, r, sub3, false, eBuf);
      const fpOut = [0, 0]; rip(nr, nl, fpOut, 0);
      writeUInt32BE(e3, fpOut[0], 0); writeUInt32BE(e3, fpOut[1], 4);
    }
    out.set(e3, off);
    prev = e3;
  }
  return out;
}