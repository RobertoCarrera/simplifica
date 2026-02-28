import { createClient } from '@supabase/supabase-js';

const mockFetch = async (url, options) => {
  console.log("FETCH URL:", url);
  console.log("FETCH BODY:", options.body);
  return {
    ok: true,
    status: 200,
    json: async () => ([{ id: 1 }])
  };
};

const supabase = createClient('https://mock.supabase.co', 'dummy_key', {
  auth: { persistSession: false },
  global: { fetch: mockFetch }
});

async function test() {
  const payload = {
    professional_id: '87a90885-611d-4e20-871a-979e3e592682',
    day_of_week: 1,
    start_time: '09:00',
    end_time: '19:00',
    break_start: null,
    break_end: null,
    is_active: true
  };

  const { data, error } = await supabase
      .from('professional_schedules')
      .upsert(payload, { onConflict: 'professional_id,day_of_week' })
      .select()
      .single();

  console.log("Result:", data, error);
}

test().catch(console.error);
