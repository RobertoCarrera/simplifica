import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { sendEmail } from '../_shared/email-sender.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // 1. Handle CORS (just in case, though Webhooks usually don't need it if called by DB)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        console.log('Assignment Webhook payload:', JSON.stringify(payload));

        // 2. Parse Database Webhook Payload
        // Structure: { type: 'UPDATE', table: 'leads', record: { ... }, old_record: { ... }, schema: 'public' }
        const { type, record, old_record } = payload;

        if (type !== 'UPDATE') {
            return new Response('Not an UPDATE event', { status: 200 });
        }

        const newAssignedTo = record.assigned_to;
        const oldAssignedTo = old_record.assigned_to;

        // 3. Check if assigned_to changed and is new (not null)
        if (newAssignedTo && newAssignedTo !== oldAssignedTo) {
            console.log(`Lead ${record.id} assigned to ${newAssignedTo}. Sending notification...`);

            // 4. Initialize Supabase Admin
            const supabaseClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            // 5. Fetch Professional Details
            const { data: professional, error: profError } = await supabaseClient
                .from('users') // 'public.users'
                .select('name, surname, email')
                .eq('id', newAssignedTo)
                .single();

            if (profError || !professional) {
                console.error('Error fetching professional details:', profError);
                throw new Error('Professional not found');
            }

            const professionalName = `${professional.name} ${professional.surname}`;
            const leadEmail = record.email;
            const leadName = record.first_name;

            if (!leadEmail) {
                console.log('Lead has no email. Skipping.');
                return new Response('Lead has no email', { status: 200 });
            }

            // 6. Send Email
            await sendEmail({
                to: [leadEmail],
                subject: 'Tu solicitud ha sido asignada a una profesional - CAIBS',
                body: `Hola ${leadName},

Buenas noticias. Hemos asignado tu caso a una de nuestras profesionales:
👩‍⚕️ ${professionalName}

Ella se pondrá en contacto contigo muy pronto para agendar la primera sesión o resolver tus dudas.

Si necesitas contactar con nosotros antes, puedes responder a este correo.

Atentamente,
El equipo de CAIBS`,
                fromName: 'CAIBS Equipo',
                // fromEmail default
            });

            console.log(`Notification sent to ${leadEmail}`);

            // Optional: Log interaction in lead_interactions
            await supabaseClient.from('lead_interactions').insert({
                lead_id: record.id,
                user_id: newAssignedTo, // Assigned user is the "actor" effectively, or use system/null
                type: 'notification',
                summary: `Email enviado: Asignado a ${professionalName}`,
            });
        } else {
            console.log('No assignment change detected.');
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Error in notify-lead-assignment:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
