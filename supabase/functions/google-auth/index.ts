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
        // Initialize Supabase Client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        // Get User from Auth Header (verify session)
        const {
            data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) {
            throw new Error('Unauthorized');
        }

        const { action, code, redirect_uri, calendarId, timeMin, timeMax } = await req.json();

        const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
        const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            throw new Error('Missing Google Auth Credentials in Secrets');
        }

        if (action === 'get-auth-url') {
            const scopes = [
                'https://www.googleapis.com/auth/calendar.events',
                'https://www.googleapis.com/auth/calendar.readonly'
            ];

            // Allow dynamic redirect URI from client or fallback
            const redirectUri = redirect_uri || 'http://localhost:4200/configuracion';

            console.log('Generating Auth URL with redirect_uri:', redirectUri);

            const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&access_type=offline&prompt=consent`;

            return new Response(JSON.stringify({ url }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'exchange-code') {
            if (!code || !redirect_uri) {
                throw new Error('Code and redirect_uri are required');
            }

            // Exchange code for tokens
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    redirect_uri: redirect_uri,
                    grant_type: 'authorization_code',
                }),
            });

            const tokens = await tokenResponse.json();

            if (tokens.error) {
                console.error('Google Token Error:', tokens);
                throw new Error(tokens.error_description || 'Failed to exchange token');
            }

            // Calculate expiry
            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

            // Fetch public user profile to get the correct user_id
            const { data: publicUser, error: userError } = await supabaseClient
                .from('users')
                .select('id')
                .eq('auth_user_id', user.id)
                .single();

            if (userError || !publicUser) {
                console.error('User Fetch Error:', userError);
                throw new Error('Failed to find user profile');
            }

            // Save to Integrations table
            const { error: dbError } = await supabaseClient
                .from('integrations')
                .upsert({
                    user_id: publicUser.id,
                    provider: 'google_calendar',
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token, // might be undefined if not returned (only on first consent)
                    expires_at: expiresAt.toISOString(),
                    metadata: {}, // Can store email later if we fetch profile
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, provider' }); // Need a unique constraint or just match logic logic 

            // Note: DB constraints might need adjustment if user_id+provider is not UNIQUE.
            // For now, let's assume one calendar integration per user.
            // We should ensure a unique index on (user_id, provider).

            if (dbError) {
                console.error('DB Save Error:', dbError);
                throw new Error('Failed to save integration');
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Helper to get fresh token
        const getValidAccessToken = async (userId, googleClientId, googleClientSecret) => {
            const { data: integration, error } = await supabaseClient
                .from('integrations')
                .select('*')
                .eq('user_id', userId)
                .eq('provider', 'google_calendar')
                .single();

            if (error || !integration) {
                throw new Error('Integration not found');
            }

            const expiresAt = new Date(integration.expires_at);
            const now = new Date();
            // Refresh if expired or expires in less than 5 minutes
            if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
                console.log('Token expired or expiring soon, refreshing...');

                if (!integration.refresh_token) {
                    throw new Error('No refresh token available');
                }

                const response = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: googleClientId,
                        client_secret: googleClientSecret,
                        refresh_token: integration.refresh_token,
                        grant_type: 'refresh_token',
                    }),
                });

                const tokens = await response.json();

                if (tokens.error) {
                    console.error('RefreshToken Error:', tokens);
                    throw new Error('Failed to refresh token');
                }

                const newExpiresAt = new Date();
                newExpiresAt.setSeconds(newExpiresAt.getSeconds() + tokens.expires_in);

                // Update DB
                await supabaseClient
                    .from('integrations')
                    .update({
                        access_token: tokens.access_token,
                        expires_at: newExpiresAt.toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', integration.id);

                return tokens.access_token;
            }

            return integration.access_token;
        };

        if (action === 'list-events') {
            if (!calendarId) throw new Error('Missing calendarId');

            const { data: publicUser } = await supabaseClient
                .from('users')
                .select('id')
                .eq('auth_user_id', user.id)
                .single();

            if (!publicUser) throw new Error('User not found');

            const accessToken = await getValidAccessToken(publicUser.id, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

            // Defaults
            const tMin = timeMin || new Date().toISOString();
            // Default to 3 months from now
            const tMax = timeMax || new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString();

            const params = new URLSearchParams({
                timeMin: tMin,
                timeMax: tMax,
                singleEvents: 'true',
                orderBy: 'startTime'
            });

            const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                const err = await response.json();
                console.error('Google Events Error:', err);
                throw new Error('Failed to fetch events');
            }

            const events = await response.json();

            return new Response(JSON.stringify({ events: events.items }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'list-calendars') {
            // Fetch public user profile to get the correct user_id
            const { data: publicUser } = await supabaseClient
                .from('users')
                .select('id')
                .eq('auth_user_id', user.id)
                .single();

            if (!publicUser) throw new Error('User not found');

            const accessToken = await getValidAccessToken(publicUser.id, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

            const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                const err = await response.json();
                console.error('Google Calendar List Error:', err);
                throw new Error('Failed to fetch calendars');
            }

            const calendars = await response.json();

            return new Response(JSON.stringify({ calendars: calendars.items }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        throw new Error('Invalid action');

    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 200, // Return 200 so client can read the error message
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
