import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encrypt, decrypt, isEncrypted } from '../_shared/crypto-utils.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';
import { withCsrf } from '../_shared/csrf-middleware.ts';

// NOTE: CSRF_SECRET env var must be set in Supabase dashboard under
// Edge Function secrets before deploying. See design doc: security-phase2.

const ENCRYPTION_KEY = Deno.env.get('OAUTH_ENCRYPTION_KEY') || '';

function isLocalhostOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const effectiveOrigin = isLocalhostOrigin(origin) || allowed.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': effectiveOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(
  withCsrf(async (req) => {
    const corsHeaders = makeCorsHeaders(req);
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Rate limiting: 30 req/min per IP (OAuth token exchange)
    const ip = getClientIP(req);
    const rl = await checkRateLimit(`google-auth:${ip}`, 30, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
      });
    }

    try {
      // Initialize Supabase Client
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
      );

      // Get User from Auth Header (verify session)
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();

      if (!user) {
        throw new Error('Unauthorized');
      }

      const { action, code, redirect_uri, calendarId, eventId, timeMin, timeMax, event, service } =
        await req.json();
      console.log('Received Action:', action);

      const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
      const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('Missing Google Auth Credentials in Secrets');
      }

      const currentProvider = service === 'drive' ? 'google_drive' : 'google_calendar';

      if (action === 'get-auth-url') {
        let scopes = [];

        if (service === 'drive') {
          scopes = ['https://www.googleapis.com/auth/drive.file'];
        } else {
          scopes = [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/calendar.readonly',
          ];
        }

        // Require redirect_uri from client — no insecure fallback
        if (!redirect_uri) {
          throw new Error('redirect_uri is required for OAuth flow');
        }

        // SECURITY: Validate redirect_uri against allowlist to prevent auth code theft
        const REDIRECT_ALLOWLIST = (
          Deno.env.get('ALLOWED_ORIGINS') || 'https://app.simplifica.es,https://simplifica.es'
        )
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
        const parsedRedirect = (() => {
          try {
            return new URL(redirect_uri);
          } catch {
            return null;
          }
        })();
        // Allow localhost for local development; production must use ALLOWED_ORIGINS
        const isLocalhostRedirect =
          parsedRedirect &&
          (parsedRedirect.hostname === 'localhost' || parsedRedirect.hostname === '127.0.0.1');
        if (
          !parsedRedirect ||
          (!isLocalhostRedirect &&
            !REDIRECT_ALLOWLIST.some((o: string) => {
              try {
                return new URL(o).origin === parsedRedirect.origin;
              } catch {
                return false;
              }
            }))
        ) {
          throw new Error('redirect_uri not allowed');
        }

        const redirectUri = redirect_uri;

        console.log('Generating Auth URL for service:', service);

        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}&access_type=offline&prompt=consent`;

        return new Response(JSON.stringify({ url }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'exchange-code') {
        if (!code || !redirect_uri) {
          throw new Error('Code and redirect_uri are required');
        }

        // SECURITY: Validate redirect_uri against allowlist
        const REDIRECT_ALLOWLIST_EX = (
          Deno.env.get('ALLOWED_ORIGINS') || 'https://app.simplifica.es,https://simplifica.es'
        )
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
        const parsedRedirectEx = (() => {
          try {
            return new URL(redirect_uri);
          } catch {
            return null;
          }
        })();
        // Allow localhost for local development
        const isLocalhostRedirectEx =
          parsedRedirectEx &&
          (parsedRedirectEx.hostname === 'localhost' || parsedRedirectEx.hostname === '127.0.0.1');
        if (
          !parsedRedirectEx ||
          (!isLocalhostRedirectEx &&
            !REDIRECT_ALLOWLIST_EX.some((o: string) => {
              try {
                return new URL(o).origin === parsedRedirectEx.origin;
              } catch {
                return false;
              }
            }))
        ) {
          throw new Error('redirect_uri not allowed');
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

        if (tokens.error || !tokens.access_token || !tokens.expires_in) {
          console.error('Google Token Error:', JSON.stringify(tokens));
          throw new Error(`Failed to exchange token: ${tokens.error || 'missing fields'}`);
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
          console.error('User Fetch Error:', userError?.message || 'no user row returned');
          throw new Error('Failed to find user profile');
        }

        // Encrypt tokens before storing
        const encryptedAccess = ENCRYPTION_KEY
          ? await encrypt(tokens.access_token, ENCRYPTION_KEY)
          : tokens.access_token;
        const encryptedRefresh =
          tokens.refresh_token && ENCRYPTION_KEY
            ? await encrypt(tokens.refresh_token, ENCRYPTION_KEY)
            : tokens.refresh_token;

        // Save to Integrations table
        const { error: dbError } = await supabaseClient.from('integrations').upsert(
          {
            user_id: publicUser.id,
            provider: currentProvider,
            access_token: encryptedAccess,
            refresh_token: encryptedRefresh,
            expires_at: expiresAt.toISOString(),
            metadata: {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id, provider' },
        );

        // Note: DB constraints might need adjustment if user_id+provider is not UNIQUE.
        // For now, let's assume one calendar integration per user.
        // We should ensure a unique index on (user_id, provider).

        if (dbError) {
          console.error('DB Save Error:', dbError.message, dbError.code, dbError.details);
          throw new Error(`Failed to save integration: ${dbError.code || 'unknown'}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Helper to get fresh token (handles encrypted + legacy plaintext)
      const getValidAccessToken = async (
        userId,
        googleClientId,
        googleClientSecret,
        provider = 'google_calendar',
      ) => {
        // Use maybeSingle() to avoid PGRST116 (406) when no integration row exists
        const { data: integration, error } = await supabaseClient
          .from('integrations')
          .select('*')
          .eq('user_id', userId)
          .eq('provider', provider)
          .maybeSingle();

        if (error) throw new Error('DB error fetching integration: ' + error.message);
        if (!integration) {
          throw new Error(
            `No ${provider} integration found. Please connect your Google account first.`,
          );
        }

        // Decrypt stored token (backward-compatible: handles plaintext if not yet encrypted)
        const storedAccessToken =
          ENCRYPTION_KEY && isEncrypted(integration.access_token)
            ? await decrypt(integration.access_token, ENCRYPTION_KEY)
            : integration.access_token;

        const storedRefreshToken =
          integration.refresh_token && ENCRYPTION_KEY && isEncrypted(integration.refresh_token)
            ? await decrypt(integration.refresh_token, ENCRYPTION_KEY)
            : integration.refresh_token;

        const expiresAt = new Date(integration.expires_at);
        const now = new Date();
        // Refresh if expired or expires in less than 5 minutes
        if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
          console.log('Token expired or expiring soon, refreshing...');

          if (!storedRefreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
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
              updated_at: new Date().toISOString(),
            })
            .eq('id', integration.id);

          return tokens.access_token;
        }

        return storedAccessToken;
      };

      if (action === 'get-picker-token') {
        const { data: publicUser } = await supabaseClient
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!publicUser) throw new Error('User not found');

        const accessToken = await getValidAccessToken(
          publicUser.id,
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
          'google_drive',
        );

        return new Response(JSON.stringify({ access_token: accessToken }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'list-events') {
        if (!calendarId) throw new Error('Missing calendarId');

        const { data: publicUser } = await supabaseClient
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!publicUser) throw new Error('User not found');

        const accessToken = await getValidAccessToken(
          publicUser.id,
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
        );

        // Defaults
        const tMin = timeMin || new Date().toISOString();
        // Default to 3 months from now
        const tMax =
          timeMax || new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString();

        const params = new URLSearchParams({
          timeMin: tMin,
          timeMax: tMax,
          singleEvents: 'true',
          orderBy: 'startTime',
        });

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

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

      if (action === 'create-event') {
        if (!calendarId) throw new Error('Missing calendarId');
        if (!event) throw new Error('Missing event data');

        const { data: publicUser } = await supabaseClient
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!publicUser) throw new Error('User not found');

        const accessToken = await getValidAccessToken(
          publicUser.id,
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
        );

        // Add sendUpdates=all to notify attendees
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
          },
        );

        if (!response.ok) {
          const err = await response.json();
          console.error('Google Create Event Error:', err);
          return new Response(JSON.stringify(err), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const createdEvent = await response.json();

        return new Response(JSON.stringify({ success: true, event: createdEvent }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'update-event') {
        if (!calendarId) throw new Error('Missing calendarId');
        if (!event || !event.id) throw new Error('Missing event data or event ID');

        const { data: publicUser } = await supabaseClient
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!publicUser) throw new Error('User not found');

        const accessToken = await getValidAccessToken(
          publicUser.id,
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
        );

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}?sendUpdates=all`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
          },
        );

        if (!response.ok) {
          const err = await response.json();
          console.error('Google Update Event Error:', err);
          throw new Error('Failed to update event');
        }

        const updatedEvent = await response.json();

        return new Response(JSON.stringify({ success: true, event: updatedEvent }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'delete-event') {
        if (!calendarId || !eventId) throw new Error('Missing calendarId or eventId');

        // Fetch public user profile to get the correct user_id
        const { data: publicUser } = await supabaseClient
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!publicUser) throw new Error('User not found');

        const accessToken = await getValidAccessToken(
          publicUser.id,
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
        );

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!response.ok && response.status !== 204) {
          const err = await response.text();
          // 410 Gone means the event is already deleted, we can treat it as success
          if (response.status !== 410) {
            console.error('Google Delete Event Error:', err);
            throw new Error('Failed to delete event');
          }
        }

        return new Response(JSON.stringify({ success: true }), {
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

        const accessToken = await getValidAccessToken(
          publicUser.id,
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
        );

        const response = await fetch(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

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
      console.error('[google-auth] Error:', error?.message, error?.stack);
      const SAFE_PREFIXES = [
        'redirect_uri is required',
        'redirect_uri not allowed',
        'Code and redirect_uri are required',
        'Unauthorized',
        'Invalid action',
        'Integration not found',
        'Failed to exchange token',
        'Failed to find user profile',
        'Failed to save integration',
        'Failed to refresh token',
        'No refresh token available',
        'Missing Google Auth Credentials',
        'No google_',
      ];
      const msg = error?.message || '';
      const safeMessage = SAFE_PREFIXES.some((p) => msg.startsWith(p))
        ? msg
        : 'Error processing Google integration request';
      return new Response(JSON.stringify({ error: safeMessage }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }),
);
