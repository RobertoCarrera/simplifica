import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outUrl = new URL('../src/assets/runtime-config.json', import.meta.url);
const outPath = fileURLToPath(outUrl);

// Lightweight .env loader (avoids adding a dependency)
function loadDotEnv() {
  const candidates = [
    '.env.local',
    '.env.development.local',
    '.env.development',
    '.env'
  ];
  for (const file of candidates) {
    try {
      const path = new URL(`../${file}`, import.meta.url);
      const filePath = fileURLToPath(path);
      if (!existsSync(filePath)) continue;
      const text = readFileSync(filePath, 'utf8');
      for (const lineRaw of text.split(/\r?\n/)) {
        const line = lineRaw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = val;
        }
      }
      console.log(`[runtime-config] Loaded environment variables from ${file}`);
      // Stop at first found to honor typical precedence
      break;
    } catch (e) {
      // ignore parsing errors, try next
    }
  }
}

// Attempt to load env from local .env files for convenience in dev
loadDotEnv();

const cfg = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || ''
  },
  edgeFunctionsBaseUrl: process.env.EDGE_FUNCTIONS_BASE_URL || ''
};

try {
  const dir = dirname(outPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(cfg, null, 2));
  console.log('[runtime-config] Wrote src/assets/runtime-config.json');
  // Print a concise summary and validate anonKey matches URL project ref
  const url = cfg.supabase.url || '';
  const anon = cfg.supabase.anonKey || '';
  const redacted = anon ? `${anon.slice(0, 6)}…${anon.slice(-4)}` : '(empty)';
  console.log('[runtime-config] Supabase URL:', url || '(empty)');
  console.log('[runtime-config] Supabase anon key (redacted):', redacted);
  try {
    if (url && anon) {
      const host = new URL(url).host; // e.g., abcdef.supabase.co
      const urlRef = host.split('.')[0];
      const parts = anon.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        const keyRef = payload?.ref || payload?.project_id || (payload?.iss ? String(payload.iss).split('/').pop() : undefined);
        if (keyRef && keyRef !== urlRef) {
          console.error('[runtime-config] ⚠️ Mismatch between SUPABASE_URL project ref and anon key:', { urlRef, keyRef });
          console.error('[runtime-config] This will cause "Invalid API key" (401). Ensure both values belong to the same Supabase project.');
        }
      }
    } else {
      console.warn('[runtime-config] SUPABASE_URL or SUPABASE_ANON_KEY is empty. The app will fall back to environment.ts values.');
    }
  } catch (_) {
    // ignore
  }
} catch (e) {
  console.error('[runtime-config] Failed to write runtime config:', e);
  process.exit(1);
}
