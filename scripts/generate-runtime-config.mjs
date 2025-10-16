import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outUrl = new URL('../src/assets/runtime-config.json', import.meta.url);
const outPath = fileURLToPath(outUrl);

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
} catch (e) {
  console.error('[runtime-config] Failed to write runtime config:', e);
  process.exit(1);
}
