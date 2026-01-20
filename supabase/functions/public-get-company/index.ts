// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const companyId = url.searchParams.get('companyId');

        if (!companyId) {
            return new Response(JSON.stringify({ error: 'Falta companyId.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Fetch Company Details
        const { data: company, error: cErr } = await supabase
            .from('companies')
            .select('id, name, logo_url, slug') // Only public info
            .eq('id', companyId)
            .single();

        if (cErr || !company) {
            return new Response(JSON.stringify({ error: 'Empresa no encontrada.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 2. Fetch Public Services
        const { data: services, error: sErr } = await supabase
            .from('services')
            .select('*')
            .eq('company_id', companyId)
            .eq('is_public', true)
            .eq('is_active', true)
            .order('name');

        if (sErr) throw sErr;

        // 3. (Optional) Fetch Booking Types if needed? 
        // Usually services have pricing. We can enhance later.

        return new Response(JSON.stringify({ company, services: services || [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
