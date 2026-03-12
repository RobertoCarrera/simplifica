import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
const supabaseKey = 'sb_publishable_tiJFPXZiq0xdTRWwNx-gKQ_b-f_CCM0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('users')
    .select(`id, email, app_role_id, app_role:app_roles(*)`)
    .eq('email', 'digitalizamostupyme@gmail.com')
    .limit(1)
    .maybeSingle();
    
  console.log("Res:", JSON.stringify(data, null, 2));
  console.log("Err:", error);
}

check();
