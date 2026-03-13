const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('src/environments/environment.ts', 'utf8');
const urlMatch = env.match(/url:\s*'([^']+)'/);
const keyMatch = env.match(/anonKey:\s*'([^']+)'/);
if(urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1], keyMatch[1]);
  // no admin powers, just want to check schema
}
