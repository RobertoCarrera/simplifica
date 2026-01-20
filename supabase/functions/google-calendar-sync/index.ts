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

        // Parse Webhook Payload
        const payload = await req.json();
        const { type, record, old_record } = payload;

        // Only process if we have a record (INSERT/UPDATE) or old_record (DELETE)
        const booking = record || old_record;
        if (!booking) {
            throw new Error('No booking record found in payload');
        }

        const professionalId = booking.professional_id;
        if (!professionalId) {
            console.log('No professional_id for booking, skipping sync');
            return new Response(JSON.stringify({ message: 'Skipped: No professional' }), { headers: corsHeaders });
        }

        // 1. Get Integration Tokens
        const { data: integration, error: intError } = await supabaseClient
            .from('integrations')
            .select('*')
            .eq('user_id', professionalId)
            .eq('provider', 'google_calendar')
            .maybeSingle();

        if (intError || !integration) {
            console.log('No Google Calendar integration found for professional', professionalId);
            return new Response(JSON.stringify({ message: 'Skipped: No integration' }), { headers: corsHeaders });
        }

        // 2. Check/Refresh Token
        let accessToken = integration.access_token;
        const expiresAt = new Date(integration.expires_at).getTime();
        const now = Date.now();

        if (expiresAt < now + 60000) { // Buffer 1 min
            console.log('Token expired, refreshing...');
            if (!integration.refresh_token) {
                throw new Error('Token expired and no refresh token available');
            }

            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
                    client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
                    refresh_token: integration.refresh_token,
                    grant_type: 'refresh_token',
                }),
            });

            const tokens = await tokenResponse.json();
            if (tokens.error) {
                throw new Error('Failed to refresh token: ' + tokens.error_description);
            }

            accessToken = tokens.access_token;

            // Update DB
            const newExpiresAt = new Date();
            newExpiresAt.setSeconds(newExpiresAt.getSeconds() + tokens.expires_in);

            await supabaseClient
                .from('integrations')
                .update({
                    access_token: accessToken,
                    expires_at: newExpiresAt.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', integration.id);
        }

        // 3. Prepare Google Event
        const eventId = booking.google_event_id;
        const googleCalendarId = 'primary'; // Or allow user to select calendar in metadata

        // Map Booking to Google Event
        // We need to fetch Service details for title/description probably? 
        // For now use generic title or assume booking has some info.
        // Let's fetch service name if possible or just use "Cita Simplifica" + booking.id

        // Fetch extra details if needed (Service Name, Client Name)
        // We run as Service Role so we can query anything.
        const { data: bookingDetails } = await supabaseClient
            .from('bookings')
            .select(`
                *,
                service:services(name),
                client:clients(name, email)
            `)
            .eq('id', booking.id)
            .single();

        const eventTitle = bookingDetails?.service?.name ? `${bookingDetails.service.name} - ${bookingDetails.client?.name || 'Cliente'}` : 'Reserva Simplifica';
        const description = `Cliente: ${bookingDetails?.client?.name} (${bookingDetails?.client?.email || 'No email'})`;

        const eventBody = {
            summary: eventTitle,
            description: description,
            start: {
                dateTime: booking.start_time, // Postgres ISO string should work
                timeZone: 'UTC' // Adjust if needed, bookings usually stored in UTC
            },
            end: {
                dateTime: booking.end_time,
                timeZone: 'UTC'
            }
        };

        // 4. Call Google API
        let response;
        if (type === 'INSERT') {
            response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${googleCalendarId}/events`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventBody)
            });
        } else if (type === 'UPDATE' && eventId) {
            response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${googleCalendarId}/events/${eventId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventBody)
            });
        } else if (type === 'DELETE' && eventId) {
            response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${googleCalendarId}/events/${eventId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
        }

        if (response) {
            const result = await response.json(); // DELETE returns 204 no content usually

            if (!response.ok) {
                console.error('Google API Error', result);
                // If 410 Gone, maybe clear the ID?
                // If 404, maybe treat as new insert?
                return new Response(JSON.stringify({ error: result }), { status: 400, headers: corsHeaders });
            }

            // If INSERT, save the google_event_id
            if (type === 'INSERT' && result.id) {
                await supabaseClient
                    .from('bookings')
                    .update({ google_event_id: result.id })
                    .eq('id', booking.id);
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

    } catch (e: any) {
        console.error(e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
});
