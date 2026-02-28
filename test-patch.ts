import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error("NO SUPABASE_SERVICE_ROLE_KEY FOUND");
  process.exit(1);
}

const supabase = createClient(url, key);

async function test() {
  const payload = {
    break_start: null,
    break_end: null
  };

  const { data, error } = await supabase
      .from('professional_schedules')
      .update(payload)
      .eq('id', 'bcde80e3-67c7-4380-bc5f-7311e41cb7c3')
      .select()
      .single();

  console.log("Upsert result:", JSON.stringify({data, error}, null, 2));
}

test().catch(console.error);
