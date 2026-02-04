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
        const company_id = payload.company_id;

        // SECURITY FIX: Remove dangerous fallback to first company
        // VALIDATION: company_id is strictly required and must be a UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!company_id || !uuidRegex.test(company_id)) {
            throw new Error('Valid company_id is required.');
        }

        // VALIDATION: Input length limits to prevent DoS/Storage issues
        const MAX_TEXT_LENGTH = 500;
        const MAX_MSG_LENGTH = 5000;

        if ((first_name && first_name.length > MAX_TEXT_LENGTH) ||
            (last_name && last_name.length > MAX_TEXT_LENGTH) ||
            (email && email.length > MAX_TEXT_LENGTH) ||
            (phone && phone.length > MAX_TEXT_LENGTH) ||
            (interest && interest.length > MAX_TEXT_LENGTH)) {
             throw new Error('Input fields exceed maximum allowed length.');
        }

        if (message && message.length > MAX_MSG_LENGTH) {
            throw new Error('Message exceeds maximum allowed length.');
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
