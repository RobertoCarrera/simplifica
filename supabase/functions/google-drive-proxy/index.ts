import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt, decrypt, isEncrypted } from "../_shared/crypto-utils.ts";

const ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';

function makeCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
    const effectiveOrigin = allowAll ? origin : (allowed.includes(origin) ? origin : '');
    return {
        'Access-Control-Allow-Origin': effectiveOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

serve(async (req) => {
    const corsHeaders = makeCorsHeaders(req);
    
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

        if (userError || !user) {
            throw new Error('Unauthorized');
        }
        
        // Fetch public user profile
        const { data: publicUser, error: publicUserError } = await supabaseClient
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .single();

        if (publicUserError || !publicUser) {
            throw new Error('User profile not found');
        }

        const { fileId, mimeType, fileName } = await req.json();

        if (!fileId || !mimeType || !fileName) {
            throw new Error('Missing fileId, mimeType, or fileName');
        }

        // Validate fileId format (alphanumeric + hyphens/underscores only)
        if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) {
            throw new Error('Invalid fileId format');
        }

        // MIME type allowlist — only permit known document types
        const ALLOWED_MIME_TYPES = new Set([
            'application/pdf',
            'application/vnd.google-apps.document',
            'application/vnd.google-apps.spreadsheet',
            'application/vnd.google-apps.presentation',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/msword',
            'application/vnd.ms-excel',
            'application/vnd.ms-powerpoint',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'text/plain',
            'text/csv',
            'application/zip',
            'application/x-zip-compressed',
        ]);
        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
            return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Fetch integration token from DB via the getValidAccessToken logic
        // Since we can't directly reuse 'getValidAccessToken' easily unless we extract it or call 'google-auth' function, 
        // let's fetch it here and potentially refresh if expired, or simply call google-auth with action='get-picker-token'
        
        // Let's implement decrypting here directly, if token is expired, we might need to refresh it.
        // It's cleaner to invoke the 'google-auth' edge function to get the fresh token securely, 
        // but Edge functions calling Edge functions can have limits or auth complexities.
        // It's better to read it directly and refresh here if needed, or simply invoke google-auth via internal logic? 
        // Wait, 'get-picker-token' action from 'google-auth' RETURNS a plaintext access token to the frontend currently.
        // The proxy can just do the same: fetch the token via decrypt. Let's do that.
        const { data: integration, error } = await supabaseClient
            .from('integrations')
            .select('*')
            .eq('user_id', publicUser.id)
            .eq('provider', 'google_drive')
            .single();

        if (error || !integration) {
            throw new Error('Google Drive integration not found');
        }
        
        // Check if we need to decrypt
        let storedAccessToken = ENCRYPTION_KEY && isEncrypted(integration.access_token)
            ? await decrypt(integration.access_token, ENCRYPTION_KEY)
            : integration.access_token;
            
        let storedRefreshToken = integration.refresh_token && ENCRYPTION_KEY && isEncrypted(integration.refresh_token)
            ? await decrypt(integration.refresh_token, ENCRYPTION_KEY)
            : integration.refresh_token;

        const expiresAt = new Date(integration.expires_at);
        const now = new Date();
        
        // Refresh token if necessary
        if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
            console.log('Token expired or expiring soon, refreshing in proxy...');
            if (!storedRefreshToken) {
                throw new Error('No refresh token available');
            }

            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
                    client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
                    refresh_token: storedRefreshToken,
                    grant_type: 'refresh_token',
                }),
            });

            const tokens = await response.json();

            if (tokens.error) {
                console.error('RefreshToken Error:', tokens.error);
                throw new Error('Failed to refresh token');
            }

            const newExpiresAt = new Date();
            newExpiresAt.setSeconds(newExpiresAt.getSeconds() + tokens.expires_in);

            // Encrypt new access token before storing
            const encryptedNewAccess = ENCRYPTION_KEY
                ? await encrypt(tokens.access_token, ENCRYPTION_KEY)
                : tokens.access_token;

            // Update DB with encrypted token
            await supabaseClient
                .from('integrations')
                .update({
                    access_token: encryptedNewAccess,
                    expires_at: newExpiresAt.toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', integration.id);

            storedAccessToken = tokens.access_token;
        }

        // Now download file from Google Drive
        const isGoogleWorkspaceType = mimeType.startsWith('application/vnd.google-apps');
        let fetchUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        let computedMimeType = mimeType;
        let computedFileName = fileName;

        if (isGoogleWorkspaceType) {
            computedMimeType = 'application/pdf'; // fallback
            if (mimeType.includes('document')) computedMimeType = 'application/pdf'; // 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (mimeType.includes('spreadsheet')) computedMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; // XLSX
            else if (mimeType.includes('presentation')) computedMimeType = 'application/pdf'; 
            
            fetchUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(computedMimeType)}`;
            
            if(computedMimeType.includes('pdf') && !fileName.endsWith('.pdf')) computedFileName += '.pdf';
            if(computedMimeType.includes('spreadsheet') && !fileName.endsWith('.xlsx')) computedFileName += '.xlsx';
        }

        const driveResponse = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${storedAccessToken}`
            }
        });

        if (!driveResponse.ok) {
            throw new Error(`Google Drive API error: ${driveResponse.statusText}`);
        }

        // Enforce file size limit (500MB)
        const contentLength = parseInt(driveResponse.headers.get('Content-Length') || '0', 10);
        if (contentLength > 500 * 1024 * 1024) {
            throw new Error('File too large (max 500MB)');
        }

        // Return the response directly as streaming
        return new Response(driveResponse.body, {
            status: driveResponse.status,
            headers: {
                ...corsHeaders,
                'Content-Type': driveResponse.headers.get('Content-Type') || computedMimeType,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(computedFileName)}"`
            }
        });

    } catch (err: any) {
        console.error(err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});