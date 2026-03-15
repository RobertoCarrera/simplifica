/**
 * AES-256-GCM encryption utilities for OAuth tokens at rest.
 *
 * Format: base64(iv + ciphertext + tag)
 * - IV: 12 bytes (random per encryption)
 * - Tag: 16 bytes (appended by GCM)
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;
const KEY_LENGTH = 32; // 256 bits

/**
 * Import a hex-encoded key string into a CryptoKey.
 */
async function importKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(hexKey);
  if (keyBytes.length !== KEY_LENGTH) {
    throw new Error(`OAUTH_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars), got ${keyBytes.length}`);
  }
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a plaintext string. Returns a base64-encoded blob (iv + ciphertext + tag).
 */
export async function encrypt(plaintext: string, hexKey: string): Promise<string> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  // GCM appends the 16-byte auth tag to the ciphertext automatically
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return bytesToBase64(combined);
}

/**
 * Decrypt a base64-encoded blob back to plaintext.
 */
export async function decrypt(encryptedBase64: string, hexKey: string): Promise<string> {
  const key = await importKey(hexKey);
  const combined = base64ToBytes(encryptedBase64);

  if (combined.length < IV_LENGTH + 1) {
    throw new Error('Invalid encrypted data: too short');
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Check if a string looks like an encrypted blob (base64) vs plaintext token.
 * Google tokens start with "ya29." or similar prefixes and are URL-safe base64.
 * Our encrypted blobs are standard base64 with potential + and / chars.
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  // Google access tokens always start with "ya29." or similar
  if (value.startsWith('ya29.') || value.startsWith('1//')) return false;
  // Our encrypted blobs are base64 of at least IV_LENGTH + 1 byte
  try {
    const decoded = base64ToBytes(value);
    return decoded.length >= IV_LENGTH + 16 + 1; // iv + tag + at least 1 byte ciphertext
  } catch {
    return false;
  }
}

// --- Helpers ---

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
