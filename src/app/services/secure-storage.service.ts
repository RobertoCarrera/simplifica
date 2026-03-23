import { Injectable } from '@angular/core';

const SESSION_KEY_NAME = 'simplifica_sk';
const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;

/**
 * F2-4: Encrypts sensitive data with AES-GCM (Web Crypto API) before writing
 * to localStorage.  The encryption key lives in sessionStorage so it is:
 *   - Persistent within a browser session (survives page reload)
 *   - Destroyed on tab/browser close — encrypted localStorage entries become
 *     permanently unreadable once the session ends, protecting data at rest
 *     on shared or stolen devices.
 */
@Injectable({ providedIn: 'root' })
export class SecureStorageService {
  private readonly ready: Promise<CryptoKey>;

  constructor() {
    this.ready = this.initKey();
  }

  async setItem(key: string, value: unknown): Promise<void> {
    if (typeof window === 'undefined') return;
    const cryptoKey = await this.ready;
    const plaintext = JSON.stringify(value);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, cryptoKey, encoded);
    const payload = {
      iv: b64encode(iv),
      ct: b64encode(new Uint8Array(ciphertext)),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  }

  async getItem<T>(key: string): Promise<T | null> {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const { iv, ct } = JSON.parse(raw) as { iv: string; ct: string };
      // Legacy unencrypted entry — return null so callers re-populate
      if (!iv || !ct) return null;
      const cryptoKey = await this.ready;
      const decrypted = await crypto.subtle.decrypt(
        { name: ALGO, iv: b64decode(iv) },
        cryptoKey,
        b64decode(ct),
      );
      return JSON.parse(new TextDecoder().decode(decrypted)) as T;
    } catch {
      // Key mismatch (new session) or corrupt entry — evict and start fresh
      localStorage.removeItem(key);
      return null;
    }
  }

  removeItem(key: string): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(key);
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async initKey(): Promise<CryptoKey> {
    const stored = typeof window !== 'undefined'
      ? sessionStorage.getItem(SESSION_KEY_NAME)
      : null;

    if (stored) {
      try {
        return await crypto.subtle.importKey(
          'raw',
          b64decode(stored),
          { name: ALGO, length: KEY_LENGTH },
          false,
          ['encrypt', 'decrypt'],
        );
      } catch {
        // Corrupted — fall through to generate a new key
      }
    }

    const key = await crypto.subtle.generateKey(
      { name: ALGO, length: KEY_LENGTH },
      true /* extractable so we can export to sessionStorage */,
      ['encrypt', 'decrypt'],
    );

    const exported = await crypto.subtle.exportKey('raw', key);
    sessionStorage.setItem(SESSION_KEY_NAME, b64encode(new Uint8Array(exported)));
    return key;
  }
}

function b64encode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf));
}

function b64decode(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
