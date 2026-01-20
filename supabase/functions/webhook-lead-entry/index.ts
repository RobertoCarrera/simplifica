import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { sendEmail } from '../_shared/email-sender.ts';

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
        const {
            first_name,
            last_name,
            email,
            phone,
            message,
            origin,
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
        let company_id = payload.company_id;

        if (!company_id) {
            // Fallback: Get the first company
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

        // Send Welcome Email
        if (email) {
            try {
                await sendEmail({
                    to: [email],
                    subject: 'Hemos recibido tu solicitud - CAIBS',
                    body: `Hola ${first_name || ''},

Hemos recibido tu solicitud y ya está en proceso.
Una de nuestras profesionales revisará tu caso y se pondrá en contacto contigo muy pronto.

Gracias por confiar en CAIBS.

Atentamente,
El equipo de CAIBS`,
                    fromName: 'CAIBS Equipo',
                });
                console.log('Welcome email sent to:', email);
            } catch (emailError) {
                console.error('Error sending welcome email:', emailError);
                // Don't fail the webhook response if email fails, just log it
            }
        }

        return new Response(JSON.stringify({ success: true, lead_id: data.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Webhook Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
