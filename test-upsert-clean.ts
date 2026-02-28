import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://ufutyjbqfjrlzkprvyvs.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_dNnMhmfC0luhkc4GazBtSw_l7gWvcqq');

async function test() {
  const payload = {
    professional_id: '87a90885-611d-4e20-871a-979e3e592682',
    day_of_week: 1, // Lunes
    start_time: '09:00',
    end_time: '19:00',
    break_start: null,
    break_end: null,
    is_active: false
  };

  console.log("Upserting payload:", payload);

  // Use the admin route to bypass RLS since we likely only have anonKey in this script!
  const fetchMock = globalThis.fetch;
  
  // Try normal upsert
  const { data, error } = await supabase
      .from('professional_schedules')
      .upsert(payload, { onConflict: 'professional_id,day_of_week' })
      .select()
      .single();

  console.log("Result:", { data, error });
}

test().catch(console.error);
