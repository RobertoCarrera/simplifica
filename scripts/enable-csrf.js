const fs = require('fs');

const files = [
  'supabase/functions/create-payment-link/index.ts',
  'supabase/functions/create-ticket/index.ts',
  // 'supabase/functions/google-auth/index.ts', // JWT-only — called via Supabase SDK (no HttpClient CSRF interceptor)
  'supabase/functions/hide-stage/index.ts',
  'supabase/functions/import-customers/index.ts',
  'supabase/functions/import-services/index.ts',
  'supabase/functions/issue-invoice/index.ts',
  'supabase/functions/remove-or-deactivate-client/index.ts',
  'supabase/functions/save-payment-integration/index.ts',
  'supabase/functions/send-company-invite/index.ts',
  'supabase/functions/upload-verifactu-cert/index.ts',
  'supabase/functions/upsert-client/index.ts',
];

const sharedImportAnchors = {
  'create-payment-link': "import { getClientIP, isValidUUID } from '../_shared/security.ts';",
  'create-ticket': "import { getClientIP } from '../_shared/security.ts';",
  // 'google-auth' removed — JWT-only, no CSRF needed
  'hide-stage': "import { getClientIP } from '../_shared/security.ts';",
  'import-customers': "import { getClientIP } from '../_shared/security.ts';",
  'import-services': "import { getClientIP } from '../_shared/security.ts';",
  'issue-invoice': "import { getClientIP } from '../_shared/security.ts';",
  'remove-or-deactivate-client': "import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';",
  'save-payment-integration': "import { getClientIP } from '../_shared/security.ts';",
  'send-company-invite': "import { getClientIP, SECURITY_HEADERS } from '../_shared/security.ts';",
  'upload-verifactu-cert': "import { getClientIP } from '../_shared/security.ts';",
  'upsert-client': "import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';",
};

const csrfImport = "import { withCsrf } from '../_shared/csrf-middleware.ts';";
const todo = '// TODO: Re-enable withCsrf once frontend implements X-CSRF-Token header';

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const name = file.split('/')[2];

  // 1. Remove TODO comment line
  content = content.replace(todo + '\n', '');

  // 2. Add withCsrf import after the anchor import (if not already there)
  const anchor = sharedImportAnchors[name];
  if (anchor && !content.includes(csrfImport)) {
    content = content.replace(anchor, anchor + '\n' + csrfImport);
  }

  // 3. Wrap serve call  
  if (name === 'upload-verifactu-cert') {
    content = content.replace(
      'Deno.serve(async (req: Request) => {',
      'Deno.serve(withCsrf(async (req: Request) => {'
    );
  } else {
    content = content.replace(
      /^serve\(async \(req/m,
      'serve(withCsrf(async (req'
    );
  }

  // 4. Fix the last }); to })); to close the withCsrf wrapper
  const lastClose = content.lastIndexOf('});');
  if (lastClose !== -1) {
    content = content.slice(0, lastClose) + '}));' + content.slice(lastClose + 3);
  }

  fs.writeFileSync(file, content);
  console.log('Updated:', file);
}
console.log('Done!');
