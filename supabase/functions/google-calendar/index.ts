import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log("Function invoked")

        // Parse Body
        let body = {};
        try {
            const clone = req.clone();
            body = await clone.json();
        } catch { /* no body */ }

        const { action, timeMin, timeMax, companyId } = body as any;
        console.log("Action:", action);

        // --- AUTH SETUP ---
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Authorization Header')
        const token = authHeader.replace('Bearer ', '')

        // Supabase Client for verifying the Caller (User/Client)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        // Authenticate User
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
        if (authError || !user) {
            console.error("Auth failed:", authError)
            throw new Error('Unauthorized')
        }
        console.log("User authenticated:", user.id)

        // =================================================================================
        // SHARED: Resolve Integration & Refresh Token
        // =================================================================================

        let targetCompanyId = companyId;

        // If no companyId provided (e.g. create_event might come from user context), try to infer or require it.
        // For 'create_event', we expect 'companyId' in body.

        if (!targetCompanyId && user) {
            // Optional: lookup company for user if not provided?
            // For now, enforce companyId in body for simplicity.
        }

        if (!targetCompanyId) throw new Error('Company ID is required');

        // Use Admin Client to fetch integration SECURELY
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Get Integration
        const { data: integration, error: dbError } = await supabaseAdmin
            .from('integrations')
            .select('*')
            .eq('company_id', targetCompanyId)
            .eq('provider', 'google_calendar')
            .maybeSingle()

        if (dbError || !integration) {
            console.error("Integration not found:", dbError || 'No Row');
            // Check if we should fail or return mock for freebusy?
            if (action === 'freebusy') {
                return new Response(JSON.stringify({ calendars: {}, busy: {} }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
            throw new Error('Google Calendar Integration not found for this company');
        }

        // Helper: Refresh Token
        let accessToken = integration.access_token
        const expiresAt = new Date(integration.expires_at).getTime()
        const now = Date.now()

        if (integration.refresh_token && expiresAt < (now + 5 * 60 * 1000)) {
            console.log('Token expired, refreshing...')
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: Deno.env.get('GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID') || Deno.env.get('GOOGLE_CLIENT_ID') || '',
                    client_secret: Deno.env.get('GOTRUE_EXTERNAL_GOOGLE_SECRET') || Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
                    refresh_token: integration.refresh_token,
                    grant_type: 'refresh_token',
                }),
            })

            const tokenData = await tokenResponse.json()
            if (!tokenResponse.ok) {
                console.error('Refresh failed:', tokenData);
                throw new Error('Failed to refresh Google Token');
            }

            accessToken = tokenData.access_token
            const newExpiresAt = new Date(now + tokenData.expires_in * 1000).toISOString()

            // Save new token
            await supabaseAdmin.from('integrations').update({
                access_token: accessToken,
                expires_at: newExpiresAt,
                updated_at: new Date().toISOString()
            }).eq('id', integration.id)
        }

        const config = integration.metadata || {};
        const targetCalendarId = config.calendar_id || 'primary'; // Default to primary if not set

        // =================================================================================
        // ACTION: CREATE_EVENT
        // =================================================================================
        if (action === 'create_event') {
            const { booking } = body;
            if (!booking) throw new Error('Booking data required');

            console.log('Creating Google Event for:', booking.customer_email);

            const event = {
                summary: `Cita: ${booking.service_name || 'Servicio'} - ${booking.customer_name}`,
                description: `Cliente: ${booking.customer_name}\nEmail: ${booking.customer_email}\nTel: ${booking.customer_phone || 'N/A'}\nNotas: ${booking.notes || ''}`,
                start: {
                    dateTime: booking.start_time,
                    timeZone: 'Europe/Madrid', // Should probably come from company settings
                },
                end: {
                    dateTime: booking.end_time,
                    timeZone: 'Europe/Madrid',
                },
                attendees: [
                    { email: booking.customer_email }
                ],
                reminders: {
                    useDefault: true
                }
            };

            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(`Google Create Error: ${JSON.stringify(data)}`);

            return new Response(JSON.stringify({ success: true, google_event_id: data.id, link: data.htmlLink }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // =================================================================================
        // ACTION: UPDATE_EVENT
        // =================================================================================
        if (action === 'update_event') {
            const { booking, google_event_id } = body;
            if (!booking) throw new Error('Booking data required');
            if (!google_event_id) throw new Error('google_event_id required');

            console.log('Updating Google Event:', google_event_id);

            const event = {
                summary: `Cita: ${booking.service_name || 'Servicio'} - ${booking.customer_name}`,
                description: `Cliente: ${booking.customer_name}\nEmail: ${booking.customer_email}\nTel: ${booking.customer_phone || 'N/A'}\nNotas: ${booking.notes || ''}`,
                start: {
                    dateTime: booking.start_time,
                    timeZone: 'Europe/Madrid',
                },
                end: {
                    dateTime: booking.end_time,
                    timeZone: 'Europe/Madrid',
                },
                // We typically don't update attendees to avoid re-sending invites spam, unless needed.
                // Keeping it simple.
            };

            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events/${google_event_id}?sendUpdates=all`, {
                method: 'PATCH', // PATCH to update only fields provided
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(`Google Update Error: ${JSON.stringify(data)}`);

            return new Response(JSON.stringify({ success: true, google_event_id: data.id, link: data.htmlLink }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // =================================================================================
        // ACTION: DELETE_EVENT
        // =================================================================================
        if (action === 'delete_event') {
            const { google_event_id } = body;
            if (!google_event_id) throw new Error('google_event_id required');

            console.log('Deleting Google Event:', google_event_id);

            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events/${google_event_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            if (!response.ok && response.status !== 404 && response.status !== 410) {
                // Ignore 404/410 (already deleted)
                const data = await response.json();
                throw new Error(`Google Delete Error: ${JSON.stringify(data)}`);
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // =================================================================================
        // ACTION: FREEBUSY
        // =================================================================================
        if (action === 'freebusy') {
            if (!timeMin || !timeMax) throw new Error('Missing parameters for freebusy')

            // Call Google FreeBusy API
            const freeBusyResponse = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timeMin: timeMin,
                    timeMax: timeMax,
                    items: [{ id: targetCalendarId }]
                })
            });

            const freeBusyData = await freeBusyResponse.json();
            if (!freeBusyResponse.ok) throw new Error(`Google FreeBusy Error: ${JSON.stringify(freeBusyData)}`);

            return new Response(JSON.stringify(freeBusyData), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // =================================================================================
        // ACTION: LIST_CALENDARS
        // =================================================================================
        if (action === 'list_calendars') {
            const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(`Google List Calendars Error: ${JSON.stringify(data)}`);

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // =================================================================================
        // ACTION: LIST_EVENTS
        // =================================================================================
        if (action === 'list_events') {
            if (!timeMin || !timeMax) throw new Error('Missing parameters for list_events');

            const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events`);
            url.searchParams.append('timeMin', timeMin);
            url.searchParams.append('timeMax', timeMax);
            url.searchParams.append('singleEvents', 'true');
            url.searchParams.append('orderBy', 'startTime');

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(`Google List Events Error: ${JSON.stringify(data)}`);

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        throw new Error(`Unknown action: ${action}`);

    } catch (error: any) {
        console.error('Function Error (Catch):', error)
        return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
