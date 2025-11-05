// @ts-nocheck
// Recurring quotes dispatcher: finds due recurring quotes and advances next_run_at.
// Intended to run on a schedule via Supabase Edge Functions cron.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function addInterval(date: Date, type: string, interval: number, day?: number): Date {
  const d = new Date(date);
  switch (type) {
    case 'weekly':
      d.setDate(d.getDate() + 7 * interval);
      if (typeof day === 'number') {
        // align to weekday (0=Sun..6=Sat)
        const diff = (day - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + diff);
      }
      return d;
    case 'monthly':
      d.setMonth(d.getMonth() + interval);
      if (day) d.setDate(Math.min(day, 28));
      return d;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3 * interval);
      if (day) d.setDate(Math.min(day, 28));
      return d;
    case 'yearly':
      d.setFullYear(d.getFullYear() + interval);
      if (day) d.setDate(Math.min(day, 28));
      return d;
    default:
      return d;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Use service role for cron processing
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const nowIso = new Date().toISOString();

    // Find due recurring quotes
    const { data: dueQuotes, error } = await supabase
      .from('quotes')
      .select('id, company_id, recurrence_type, recurrence_interval, recurrence_day, next_run_at, recurrence_end_date')
      .neq('recurrence_type', 'none')
      .lte('next_run_at', nowIso);

    if (error) throw error;

    let processed = 0;

    for (const q of dueQuotes || []) {
      // Stop if beyond end_date
      if (q.recurrence_end_date && new Date(q.recurrence_end_date) < new Date()) {
        // Disable recurrence by setting type to none
        await supabase.from('quotes').update({ recurrence_type: 'none' }).eq('id', q.id);
        continue;
      }

      // TODO: integrate with invoice creation here (copy quote to invoice)
      // For now, just advance next_run_at and mark last_run_at
      const next = addInterval(new Date(q.next_run_at || new Date()), q.recurrence_type, q.recurrence_interval, q.recurrence_day);
      await supabase
        .from('quotes')
        .update({ last_run_at: new Date().toISOString(), next_run_at: next.toISOString() })
        .eq('id', q.id);

      processed++;
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
