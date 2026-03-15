import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load .env.local manually since we are running with node
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixPassword() {
  const userId = process.argv[2];
  const newPassword = process.argv[3];

  if (!userId || !newPassword) {
    console.error('Usage: node fix-local-password.mjs <userId> <newPassword>');
    process.exit(1);
  }

  console.log(`Updating password for user ${userId}...`);

  const { data, error } = await supabase.auth.admin.updateUserById(
    userId,
    { password: newPassword, email_confirm: true }
  );

  if (error) {
    console.error('Error updating user:', error);
  } else {
    console.log('Success! User updated:', data.user.email);
  }
}

fixPassword();
