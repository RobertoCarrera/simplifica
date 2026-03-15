import { createClient } from "npm:@supabase/supabase-js@2";
import { encrypt, isEncrypted } from "../supabase/functions/_shared/crypto-utils.ts";

// Setup process.env from .env if needed or just require them directly:
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ENCRYPTION_KEY = Deno.env.get("OAUTH_ENCRYPTION_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
  console.error("Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OAUTH_ENCRYPTION_KEY");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("Starting to encrypt OAuth tokens in integrations table...");
  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("*");

  if (error) {
    console.error("Error fetching integrations:", error);
    return;
  }

  console.log(`Found ${integrations.length} integrations to check.`);
  let updatedCount = 0;

  for (const row of integrations) {
    let needsUpdate = false;
    let newAccess = row.access_token;
    let newRefresh = row.refresh_token;

    if (row.access_token && !isEncrypted(row.access_token)) {
      newAccess = await encrypt(row.access_token, ENCRYPTION_KEY);
      needsUpdate = true;
    }

    if (row.refresh_token && !isEncrypted(row.refresh_token)) {
      newRefresh = await encrypt(row.refresh_token, ENCRYPTION_KEY);
      needsUpdate = true;
    }

    if (needsUpdate) {
      console.log(`Encrypting tokens for integration ID: ${row.id} (${row.provider})`);
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          access_token: newAccess,
          refresh_token: newRefresh,
        })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Error updating integration ${row.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`Finished. Encrypted ${updatedCount} integrations.`);
}

await main();