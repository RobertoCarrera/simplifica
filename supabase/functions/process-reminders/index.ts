
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
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Get Bookings in next 25 hours (covering the 24h usage)
        const now = new Date();
        const next25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

        // Select upcoming confirmed bookings
        const { data: bookings, error: bookingError } = await supabaseClient
            .from('bookings')
            .select(`
        id,
        start_time,
        client:clients ( email, full_name, user_id ),
        service:services ( name, duration_minutes ),
        scheduled_notifications ( type )
      `)
            .in('status', ['confirmed'])
            .gte('start_time', now.toISOString())
            .lte('start_time', next25h.toISOString());

        if (bookingError) throw bookingError;

        const remindersToSend: any[] = [];
        const results: any[] = [];

        // 2. Logic to determine who needs a reminder
        for (const booking of (bookings || [])) {
            const startTime = new Date(booking.start_time);
            const timeDiffMs = startTime.getTime() - now.getTime();
            const hoursUntil = timeDiffMs / (1000 * 60 * 60);

            const sentTypes = (booking.scheduled_notifications || []).map((n: any) => n.type);

            // Check for 24h Reminder (sent between 23h and 25h before)
            if (hoursUntil >= 23 && hoursUntil <= 25 && !sentTypes.includes('reminder_24h')) {
                remindersToSend.push({ booking, type: 'reminder_24h', label: 'Mañana' });
            }

            // Check for 1h Reminder (sent between 45m and 1h15m before)
            if (hoursUntil >= 0.75 && hoursUntil <= 1.25 && !sentTypes.includes('reminder_1h')) {
                remindersToSend.push({ booking, type: 'reminder_1h', label: 'En 1 hora' });
            }
        }

        // 3. Send Emails
        for (const item of remindersToSend) {
            const { booking, type, label } = item;
            const clientEmail = booking.client?.email;
            const clientName = booking.client?.full_name || 'Cliente';
            const serviceName = booking.service?.name;

            if (!clientEmail) {
                console.error(`Skipping ${type} for booking ${booking.id}: No email.`);
                continue;
            }

            // Prepare Email Content
            // We really should use a template system, but for now, hardcoded simple HTML.
            const subject = `Recordatorio: Tienes una cita ${label} (${serviceName})`;
            const html = `
            <h1>Hola ${clientName},</h1>
            <p>Este es un recordatorio de tu cita en <strong>Simplifica Tu Negocio</strong>.</p>
            <ul>
                <li><strong>Servicio:</strong> ${serviceName}</li>
                <li><strong>Fecha:</strong> ${new Date(booking.start_time).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</li>
            </ul>
            <p>¡Te esperamos!</p>
        `;

            // Send (Mock or Real)
            let success = false;
            let errorMsg = null;

            try {
                // Using SES via our existing pattern? Or directly?
                // "sendEmail" import suggests we have a helper.
                // If not, we'll use the supabase function invocation or fetch logic.
                // For Safety: I'll try to invoke the 'send-mail' function if it exists, or just log for this implementation step if I don't have the shared code handy correctly.

                // BETTER: Use the existing 'send-email' logic via Supabase invoke?
                // No, 'serve' functions usually import shared code.
                // I will assume for now I can write a simple SES sender or call the other function.
                // Let's call the `booking-notifier`? created previously?
                // Actually, `booking-notifier` handles events. `send-email` handles raw sending.
                // Let's copy the SES logic here for robustness or import it.
                // I will put a PLACEHOLDER call to `send-email` edge function for simplicity and reliability.

                console.log(`Sending ${type} to ${clientEmail}`);

                // Call 'send-email' Edge Function
                const emailRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        to: clientEmail,
                        subject: subject,
                        html: html
                    })
                });

                if (emailRes.ok) {
                    success = true;
                } else {
                    const errText = await emailRes.text();
                    errorMsg = `Email failed: ${errText}`;
                    console.error(errorMsg);
                }

            } catch (e: any) {
                errorMsg = e.message;
            }

            // 4. Record in DB
            await supabaseClient
                .from('scheduled_notifications')
                .insert({
                    booking_id: booking.id,
                    type: type,
                    status: success ? 'sent' : 'failed',
                    scheduled_for: now.toISOString(), // Approximated
                    sent_at: success ? new Date().toISOString() : null,
                    error: errorMsg
                });

            results.push({ bookingId: booking.id, type, success });
        }

        return new Response(
            JSON.stringify({ success: true, processed: results.length, details: results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});
