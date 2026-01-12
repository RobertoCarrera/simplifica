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
        // ACTION: FREEBUSY (For Clients/Admin to check availability)
        // =================================================================================
        if (action === 'freebusy') {
            if (!companyId || !timeMin || !timeMax) throw new Error('Missing parameters for freebusy')
            console.log(`Checking freebusy for company: ${companyId}`);

            // Use Admin Client to fetch integration SECURELY
            // This allows Clients to check availability without seeing tokens
            const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )

            // Get Integration for the Company
            const { data: integration, error: dbError } = await supabaseAdmin
                .from('integrations')
                .select('*')
                .eq('company_id', companyId)
                .eq('provider', 'google_calendar')
                .maybeSingle()

            if (dbError || !integration) {
                console.error("Integration not found for company (or DB Error):", dbError || 'No Row');
                // Return empty if no integration found (means no busy times from Google)
                return new Response(JSON.stringify({ calendars: {}, busy: {} }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            // Extract Config (which calendar to check?)
            const config = integration.metadata || {};
            const availabilityCalendar = config.calendar_id;

            if (!availabilityCalendar) {
                return new Response(JSON.stringify({ calendars: {}, busy: {} }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            // Refresh Google Token if Expired
            let accessToken = integration.access_token
            const expiresAt = new Date(integration.expires_at).getTime()
            const now = Date.now()

            // Buffer 5 mins
            if (integration.refresh_token && expiresAt < (now + 5 * 60 * 1000)) {
                console.log('Token expired, refreshing (Admin)...')
                const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: Deno.env.get('GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID') || '',
                        client_secret: Deno.env.get('GOTRUE_EXTERNAL_GOOGLE_SECRET') || '',
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

                // Save new token using Admin client
                await supabaseAdmin.from('integrations').update({
                    access_token: accessToken,
                    expires_at: newExpiresAt,
                    updated_at: new Date().toISOString()
                }).eq('id', integration.id)
            }

            // Call Google FreeBusy API
            const freeBusyResponse = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timeMin: timeMin,
                    timeMax: timeMax,
                    items: [{ id: availabilityCalendar }]
                })
            });

            const freeBusyData = await freeBusyResponse.json();
            if (!freeBusyResponse.ok) throw new Error(`Google FreeBusy Error: ${JSON.stringify(freeBusyData)}`);

            return new Response(JSON.stringify(freeBusyData), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // =================================================================================
        // ACTION: LIST (Default) - For Admin to select calendars
        // =================================================================================

        // 2. Resolve Public User ID
        console.log("Public User lookup for auth_id:", user.id)
        const { data: publicUser, error: userError } = await supabaseClient
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .single()

        if (userError || !publicUser) {
            console.error("Public user lookup failed:", userError)
            throw new Error('Public User not found')
        }
        console.log("Public User found:", publicUser.id)

        // 3. Get Integration Tokens (User's own integration or via Company)
        // Here we assume Admin is accessing their OWN integration or they are a company member
        // For simplicity, we query by user_id linked to integration (as setup in auth-callback)
        console.log("Integration lookup for user_id:", publicUser.id)
        const { data: integration, error: dbError } = await supabaseClient
            .from('integrations')
            .select('*')
            .eq('user_id', publicUser.id)
            .eq('provider', 'google_calendar')
            .single()

        if (dbError || !integration) {
            console.error("Integration lookup failed:", dbError)
            throw new Error('Integration not found')
        }
        console.log("Integration found:", integration.id)

        let accessToken = integration.access_token
        const expiresAt = new Date(integration.expires_at).getTime()
        const now = Date.now()

        // 3. Check Expiration & Refresh if needed
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
                console.error('Refresh failed:', tokenData)
                throw new Error('Failed to refresh Google Token')
            }
            console.log('Refreshed token success')

            accessToken = tokenData.access_token
            const newExpiresAt = new Date(now + tokenData.expires_in * 1000).toISOString()

            await supabaseClient
                .from('integrations')
                .update({
                    access_token: accessToken,
                    expires_at: newExpiresAt,
                    updated_at: new Date().toISOString()
                })
                .eq('id', integration.id)
        }

        // 4. Call Google Calendar List API
        console.log('Calling Google API...')
        const googleResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })

        const googleData = await googleResponse.json()
        if (!googleResponse.ok) throw new Error(`Google API Error: ${googleData.error?.message || 'Unknown code'}`)

        return new Response(JSON.stringify(googleData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('Function Error (Catch):', error)
        return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
