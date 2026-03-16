import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req) => {
    const corsRes = handleCorsOptions(req);
    if (corsRes) return corsRes;
    const corsHeaders = getCorsHeaders(req);

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Missing authorization' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

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
    // Not yet implemented
    return new Response(JSON.stringify({ error: 'Booking not yet available' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 501,
    });
}
