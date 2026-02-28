import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://ufutyjbqfjrlzkprvyvs.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_dNnMhmfC0luhkc4GazBtSw_l7gWvcqq');

async function test() {
  const payload = {
    id: 'bcde80e3-67c7-4380-bc5f-7311e41cb7c3',
    professional_id: '87a90885-611d-4e20-871a-979e3e592682',
    day_of_week: 1,
    start_time: '09:00',
    end_time: '19:00',
    break_start: null,
    break_end: null,
    is_active: false
  };

  const { data, error } = await supabase
      .from('professional_schedules')
      .upsert(payload, { onConflict: 'professional_id,day_of_week' })
      .select()
      .single();

  console.log("UPSERT RESULT:", { data, error });
}

test().catch(console.error);
