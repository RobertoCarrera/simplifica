import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const payload = await req.json();
        console.log('Webhook payload received:', payload);

        // Extract fields with fallbacks
        // Expected structure: { first_name, last_name, email, phone, message, origin, ... }
        const {
            first_name,
            last_name,
            email,
            phone,
            message,
            origin, // e.g. 'wordpress', 'doctoralia'
            interest,
            metadata = {}
        } = payload;

        // Map origin to enum source
        let source = 'other';
        const originLower = (origin || '').toLowerCase();
        if (originLower.includes('web')) source = 'web_form';
        else if (originLower.includes('doctoralia')) source = 'doctoralia';
        else if (originLower.includes('top')) source = 'top_doctors';
        else if (originLower.includes('whatsapp')) source = 'whatsapp';
        else if (originLower.includes('telef')) source = 'phone';

        // Must determine company_id
        // For MVP, if we don't have it in payload, we might need a fallback or query it.
        // Assuming single-tenant or passed in payload or finding a default company.
        // Let's check if 'company_id' is in payload, otherwise try to find one.
        let company_id = payload.company_id;

        if (!company_id) {
            // Fallback: Get the first company (Dangerous in multi-tenant, ok for single tenant MVP)
            const { data: companies } = await supabaseClient.from('companies').select('id').limit(1);
            if (companies && companies.length > 0) {
                company_id = companies[0].id;
            } else {
                throw new Error('No company_id found or provided.');
            }
        }

        // Insert Lead
        const leadData = {
            company_id,
            first_name: first_name || 'Desconocido',
            last_name: last_name || '',
            email,
            phone,
            source,
            notes: message,
            interest,
            metadata: { ...metadata, original_payload: payload },
            status: 'new'
        };

        const { data, error } = await supabaseClient
            .from('leads')
            .insert(leadData)
            .select()
            .single();

        if (error) {
            console.error('Error inserting lead:', error);
            throw error;
        }

        // Optional: Send Notification (Email/Internal) - Phase 3
        // await notifyTeam(leadData);

        return new Response(JSON.stringify({ success: true, lead_id: data.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Webhook Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
