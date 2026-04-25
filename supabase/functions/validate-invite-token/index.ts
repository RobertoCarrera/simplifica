// Supabase Edge Function: validate-invite-token
// PUBLIC endpoint - validates invitation tokens for the accept/reject page
// - No auth required since the token IS the auth mechanism
// - Rate limited to 10 req/min per IP to prevent brute forcing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { withSecurityHeaders, isValidUUID, getClientIP } from '../_shared/security.ts';

const FUNCTION_NAME = 'validate-invite-token';
const FUNCTION_VERSION = '2026-04-01';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

// Admin client for reading invitations (bypasses RLS for validation)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  const corsResponse = handleCorsOptions(req);
  if (corsResponse) return corsResponse;

  // Rate limiting: 10 req/min per IP
  const ip = getClientIP(req);
  const rateLimit = await checkRateLimit(`${FUNCTION_NAME}:${ip}`, 10, 60000);
  const rateLimitHeaders = getRateLimitHeaders(rateLimit);

  const headers = withSecurityHeaders({
    ...corsHeaders,
    ...rateLimitHeaders,
    'X-Function-Name': FUNCTION_NAME,
    'X-Function-Version': FUNCTION_VERSION,
  });

  if (!rateLimit.allowed) {
    console.warn(`[${FUNCTION_NAME}] Rate limit exceeded for IP: ${ip}`);
    return new Response(
      JSON.stringify({ valid: false, error: 'Rate limit exceeded. Please try again later.' }),
      { status: 429, headers },
    );
  }

  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ valid: false, error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  }

  try {
    // Extract token from query param or body
    let token: string | null = null;

    if (req.method === 'GET') {
      token = new URL(req.url).searchParams.get('token');
    } else {
      const body = await req.json().catch(() => ({}));
      token = body?.token || null;
    }

    // Validate token presence
    if (!token) {
      return new Response(JSON.stringify({ valid: false, error: 'Invitation token is required' }), {
        status: 400,
        headers,
      });
    }

    // Validate token format (must be UUID)
    if (!isValidUUID(token)) {
      return new Response(JSON.stringify({ valid: false, error: 'Invalid token format' }), {
        status: 400,
        headers,
      });
    }

    // Query the invitation
    const { data: invitation, error } = await supabaseAdmin
      .from('company_invitations')
      .select('id, email, role, company_id, status, expires_at, created_at, inviter_id')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[${FUNCTION_NAME}] Database error:`, error);
      return new Response(
        JSON.stringify({ valid: false, error: 'Failed to validate invitation' }),
        { status: 500, headers },
      );
    }

    // Check if invitation exists
    if (!invitation) {
      return new Response(JSON.stringify({ valid: false, error: 'Invitation not found' }), {
        status: 404,
        headers,
      });
    }

    // Check if already accepted or rejected
    if (invitation.status === 'accepted') {
      return new Response(
        JSON.stringify({ valid: false, error: 'This invitation has already been accepted' }),
        { status: 400, headers },
      );
    }

    if (invitation.status === 'rejected') {
      return new Response(
        JSON.stringify({ valid: false, error: 'This invitation has been rejected' }),
        { status: 400, headers },
      );
    }

    if (invitation.status === 'cancelled') {
      return new Response(
        JSON.stringify({ valid: false, error: 'This invitation has been cancelled' }),
        { status: 400, headers },
      );
    }

    // Check if expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return new Response(JSON.stringify({ valid: false, error: 'This invitation has expired' }), {
        status: 400,
        headers,
      });
    }

    // Fetch related data: company name and inviter name
    let companyName = null;
    let inviterName = null;

    // Get company name
    if (invitation.company_id) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('name')
        .eq('id', invitation.company_id)
        .limit(1)
        .maybeSingle();
      companyName = company?.name || null;
    }

    // Get inviter name
    if (invitation.inviter_id) {
      const { data: inviter } = await supabaseAdmin
        .from('users')
        .select('name, surname')
        .eq('id', invitation.inviter_id)
        .limit(1)
        .maybeSingle();
      if (inviter) {
        inviterName = [inviter.name, inviter.surname].filter(Boolean).join(' ').trim() || null;
      }
    }

    // Return valid invitation details
    return new Response(
      JSON.stringify({
        valid: true,
        invitation: {
          email: invitation.email,
          role: invitation.role,
          company_name: companyName,
          inviter_name: inviterName,
          expires_at: invitation.expires_at,
          status: invitation.status,
        },
      }),
      { status: 200, headers },
    );
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Unexpected error:`, e);
    return new Response(JSON.stringify({ valid: false, error: 'Internal server error' }), {
      status: 500,
      headers,
    });
  }
});
