
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationRule {
    enabled: boolean;
    offset_hours: number;
    channel?: 'email';
}

interface CompanySettings {
    automation?: {
        reminder_24h?: AutomationRule;
        reminder_1h?: AutomationRule;
        review_request?: AutomationRule;
    };
    [key: string]: any;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const now = new Date();
        const MAX_LOOKAHEAD_HOURS = 72; // Max booking lookahead
        const MAX_LOOKBACK_HOURS = 24;  // Max history lookback for reviews

        const nextWindow = new Date(now.getTime() + MAX_LOOKAHEAD_HOURS * 60 * 60 * 1000);
        const prevWindow = new Date(now.getTime() - MAX_LOOKBACK_HOURS * 60 * 60 * 1000);

        // 1. Fetch Candidates (Upcoming & Recently Completed)
        // We fetch a wide window and filter in memory based on company rules
        // Note: Supabase OR syntax needs care. We'll fetch all relevant confirmed/completed in range.

        const { data: bookings, error: bookingError } = await supabaseClient
            .from('bookings')
            .select(`
                id,
                start_time,
                end_time,
                status,
                company_id,
                client:clients ( email, full_name, user_id ),
                service:services ( name ),
                company:companies ( company_settings ( automation ) ),
                scheduled_notifications ( type )
            `)
            .or(`and(status.eq.confirmed,start_time.gte.${now.toISOString()},start_time.lte.${nextWindow.toISOString()}),and(status.eq.completed,end_time.gte.${prevWindow.toISOString()},end_time.lte.${now.toISOString()})`);

        if (bookingError) throw bookingError;

        const notificationsToSend: any[] = [];

        // 2. Logic Per Booking
        for (const booking of (bookings || [])) {
            const companySettingsList = booking.company?.company_settings as any[];
            const settings = (companySettingsList && companySettingsList.length > 0) ? companySettingsList[0] : {};
            const automation = settings?.automation || {};
            const clientEmail = booking.client?.email;

            if (!clientEmail) continue;

            const existingTypes = (booking.scheduled_notifications || []).map((n: any) => n.type);

            // --- A. REMINDERS (Upcoming) ---
            if (booking.status === 'confirmed') {
                const startTime = new Date(booking.start_time).getTime();
                const hoursUntil = (startTime - now.getTime()) / (1000 * 60 * 60);

                // Rule: 24h Reminder (Default: enabled, 24h)
                const rule24 = automation.reminder_24h ?? { enabled: true, offset_hours: 24 };
                if (rule24.enabled && !existingTypes.includes('reminder_24h')) {
                    // Check time window (approx +/- 1 hour from offset)
                    if (hoursUntil >= (rule24.offset_hours - 1) && hoursUntil <= (rule24.offset_hours + 1)) {
                        notificationsToSend.push({
                            booking,
                            type: 'reminder_24h',
                            label: 'Mañana',
                            subject: `Recordatorio: ${booking.service?.name} es mañana`
                        });
                    }
                }

                // Rule: 1h Reminder (Default: enabled, 1h)
                const rule1 = automation.reminder_1h ?? { enabled: true, offset_hours: 1 };
                if (rule1.enabled && !existingTypes.includes('reminder_1h')) {
                    if (hoursUntil >= (rule1.offset_hours - 0.25) && hoursUntil <= (rule1.offset_hours + 0.25)) {
                        notificationsToSend.push({
                            booking,
                            type: 'reminder_1h',
                            label: 'Pronto',
                            subject: `Recordatorio: ${booking.service?.name} es en ${rule1.offset_hours} hora(s)`
                        });
                    }
                }
            }

            // --- B. REVIEW REQUESTS (Completed) ---
            if (booking.status === 'completed' || (booking.status === 'confirmed' && new Date(booking.end_time) < now)) {
                const endTime = new Date(booking.end_time).getTime();
                const hoursSince = (now.getTime() - endTime) / (1000 * 60 * 60);

                // Rule: Review Request (Default: enabled, 2h after)
                const ruleReview = automation.review_request ?? { enabled: true, offset_hours: 2 };

                // Only send if enabled AND strictly within window (e.g., 2h to 3h after) AND not sent
                if (ruleReview.enabled && !existingTypes.includes('review_request')) {
                    if (hoursSince >= ruleReview.offset_hours && hoursSince <= (ruleReview.offset_hours + 1)) {
                        notificationsToSend.push({
                            booking,
                            type: 'review_request',
                            label: 'Gracias',
                            subject: `Gracias por tu visita a ${booking.service?.name} - ¿Qué tal fue?`
                        });
                    }
                }
            }
        }

        // 3. Process Sending
        const results = [];
        for (const item of notificationsToSend) {
            const { booking, type, subject } = item;

            // Sending Logic (Fetch send-email)
            let success = false;
            let errorMsg = null;
            try {
                const emailRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        to: booking.client.email,
                        subject: subject,
                        html: `
                        <h1>Hola ${booking.client.full_name},</h1>
                        <p>${type === 'review_request' ? 'Esperamos que hayas disfrutado tu servicio.' : 'Este es un recordatorio de tu cita.'}</p>
                        <ul>
                            <li><strong>Servicio:</strong> ${booking.service?.name}</li>
                            <li><strong>Fecha:</strong> ${new Date(booking.start_time).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</li>
                        </ul>
                        ${type === 'review_request' ? '<p>¿Nos dejarías una reseña?</p>' : '<p>¡Te esperamos!</p>'}
                        `
                    })
                });

                if (emailRes.ok) {
                    success = true;
                } else {
                    errorMsg = await emailRes.text();
                    console.error('Email failed:', errorMsg);
                }
            } catch (e: any) { errorMsg = e.message; }

            // Record in DB
            await supabaseClient.from('scheduled_notifications').insert({
                booking_id: booking.id,
                type,
                status: success ? 'sent' : 'failed',
                scheduled_for: now.toISOString(),
                sent_at: success ? new Date().toISOString() : null,
                error: errorMsg
            });
            results.push({ id: booking.id, type, success });
        }

        return new Response(JSON.stringify({ processed: results.length, details: results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }
});
