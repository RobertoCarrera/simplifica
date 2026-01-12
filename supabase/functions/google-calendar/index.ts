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

        // DEBUG: Log all headers
        console.log("Request Headers:", [...req.headers.keys()])

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            console.error("Missing Authorization Header")
            throw new Error('Missing Authorization Header')
        }

        const token = authHeader.replace('Bearer ', '')
        console.log("Token received (len):", token.length)

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        // 1. Authenticate Request
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
        if (authError || !user) {
            console.error("Auth failed:", authError)
            throw new Error('Unauthorized')
        }
        console.log("User found:", user.id)

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

        // 3. Get Integration Tokens
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

        // 3. Check Expiration & Refresh if needed (buffer 5 mins)
        if (integration.refresh_token && expiresAt < (now + 5 * 60 * 1000)) {
            console.log('Token expired, refreshing...')

            // Refresh with Google
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
                console.error('Refresh failed:', tokenData)
                throw new Error('Failed to refresh Google Token')
            }
            console.log('Refreshed token success')

            accessToken = tokenData.access_token
            const newExpiresAt = new Date(now + tokenData.expires_in * 1000).toISOString()

            // Update DB
            // IMPORTANT: We use the SERVICE ROLE key to bypass RLS for the update if needed, 
            // but here we are acting as the user so it sould be fine if RLS allows update.
            // Actually, better to use Service Role for background updates to be safe?
            // No, let's try with user first. If RLS blocks, we switch.
            // Assuming RLS allows user to update OWN integration.
            await supabaseClient
                .from('integrations')
                .update({
                    access_token: accessToken,
                    expires_at: newExpiresAt,
                    updated_at: new Date().toISOString()
                })
                .eq('id', integration.id)
        }

        // 4. Call Google Calendar API
        console.log('Calling Google API...')
        const googleResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })

        const googleData = await googleResponse.json()

        if (!googleResponse.ok) {
            console.error('Google API Error:', googleData)
            throw new Error(`Google API Error: ${googleData.error?.message || 'Unknown code'}`)
        }
        console.log('Google API success, returning calendars')

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
