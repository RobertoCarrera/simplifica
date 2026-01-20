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

        // 1. SECURITY VALIDATION (IDOR Check)
        // Verify that the invoice exists and is accessible for the user invoking the function.
        // Since supabaseClient uses the user's Authorization header, RLS will enforce access.
        const { data: invoiceCheck, error: checkError } = await supabaseClient
            .from('invoices')
            .select('id, company_id')
            .eq('id', invoiceid)
            .maybeSingle();

        if (checkError || !invoiceCheck) {
            return new Response(JSON.stringify({ 
                error: 'Acceso denegado o factura no encontrada',
                details: checkError?.message 
            }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403 
            });
        }

        // 2. RPC EXECUTION (Now safe)
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
