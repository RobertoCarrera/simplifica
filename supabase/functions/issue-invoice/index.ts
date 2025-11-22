// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const { invoiceid, deviceid, softwareid } = await req.json();

        if (!invoiceid) {
            throw new Error('Missing invoiceid');
        }

        // Call the RPC that handles the logic
        // Note: Based on SQL search, 'verifactu_preflight_issue' seems to contain the logic 
        // for chaining and hashing, despite the name "preflight".
        // We will use it for now as the implementation.
        const { data, error } = await supabaseClient.rpc('verifactu_preflight_issue', {
            pinvoice_id: invoiceid,
            pdevice_id: deviceid,
            psoftware_id: softwareid
        });

        if (error) throw error;

        return new Response(JSON.stringify({ ok: true, ...data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
