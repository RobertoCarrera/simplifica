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
  const userId = '6adfa925-7050-4fae-914a-4957c1f69a20'; // The ID we seeded
  const newPassword = 'password123';

  console.log(`Updating password for user ${userId}...`);

  const { data, error } = await supabase.auth.admin.updateUserById(
    userId,
    { password: newPassword, email_confirm: true }
  );

  if (error) {
    console.error('Error updating user:', error);
  } else {
    console.log('Success! User updated:', data.user.email);
    console.log('New password is:', newPassword);
  }
}

fixPassword();
