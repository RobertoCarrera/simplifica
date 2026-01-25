import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function signState(payload: any, secret: string): Promise<string> {
    const data = JSON.stringify(payload);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
    const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return btoa(data + "|" + sigBase64);
}

async function verifyState(stateStr: string, secret: string): Promise<any> {
    try {
        const decoded = atob(stateStr);
        const [data, sigBase64] = decoded.split("|");
        if (!data || !sigBase64) return null;

        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            enc.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
        const expectedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));

        if (sigBase64 !== expectedSig) return null;
        return JSON.parse(data);
    } catch {
        return null;
    }
}

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

        const { action, code, redirect_uri, state } = await req.json();

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
            const redirectUri = redirect_uri || 'http://localhost:4200/settings/profile';

            // Generate signed state to prevent CSRF
            const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const state = await signState({ userId: user.id, timestamp: Date.now() }, secret);

            const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

            return new Response(JSON.stringify({ url }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'exchange-code') {
            if (!code || !redirect_uri) {
                throw new Error('Code and redirect_uri are required');
            }

            if (!state) {
                throw new Error('State parameter is required to prevent CSRF');
            }

            const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const verifiedState = await verifyState(state, secret);

            if (!verifiedState) {
                throw new Error('Invalid or manipulated state');
            }

            if (verifiedState.userId !== user.id) {
                throw new Error('State belongs to a different user');
            }

            // 15 minutes expiration
            if (Date.now() - verifiedState.timestamp > 15 * 60 * 1000) {
                throw new Error('State expired');
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

            // Save to Integrations table
            const { error: dbError } = await supabaseClient
                .from('integrations')
                .upsert({
                    user_id: user.id,
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

        throw new Error('Invalid action');

    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
