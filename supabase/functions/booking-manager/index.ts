import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req) => {
    const corsRes = handleCorsOptions(req);
    if (corsRes) return corsRes;
    const corsHeaders = getCorsHeaders(req);

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const { action, ...payload } = await req.json();

        if (action === 'check') {
            return await checkAvailability(supabaseClient, payload);
        } else if (action === 'book') {
            return await createBooking(supabaseClient, payload);
        } else {
            throw new Error('Invalid action');
        }

    } catch (error: any) {
        console.error('booking-manager error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});

async function checkAvailability(supabase: any, { booking_type_id, date, timezone }: any) {
    // Stub
    return new Response(JSON.stringify({ slots: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

async function createBooking(supabase: any, payload: any) {
    // Stub
    return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
