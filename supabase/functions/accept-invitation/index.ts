// Edge Function: accept-invitation
// Purpose: User accepts a company invitation and becomes a member
// Flow:
// 1) Validate auth (JWT) and extract token from body
// 2) Look up invitation by token
// 3) Validate invitation: exists, pending, not expired, email matches logged-in user
// 4) Insert into company_members
// 5) Update invitation status to 'accepted'
// 6) Return success with company name

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders, isValidUUID } from '../_shared/security.ts';

const FUNCTION_NAME = 'accept-invitation';
const FUNCTION_VERSION = '2026-04-01';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  const corsResponse = handleCorsOptions(req);
  if (corsResponse) return corsResponse;

  // Rate limiting: 10 req/min per IP (prevent brute force on invitation tokens)
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
      JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again later.' }),
      { status: 429, headers },
    );
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  }

  try {
    // 1. Authenticate user from JWT
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization Bearer token required' }),
        { status: 401, headers },
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authUser?.user?.id) {
      console.warn(`[${FUNCTION_NAME}] Invalid token:`, authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired auth token' }),
        { status: 401, headers },
      );
    }

    const authUserId = authUser.user.id;
    const userEmail = authUser.user.email?.toLowerCase();

    if (!userEmail) {
      return new Response(JSON.stringify({ success: false, error: 'User email not found' }), {
        status: 400,
        headers,
      });
    }

    // 2. Extract token from body
    const body = await req.json().catch(() => ({}));
    const invitationToken = body?.token || null;

    if (!invitationToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invitation token is required' }),
        { status: 400, headers },
      );
    }

    // Validate token format (must be UUID)
    if (!isValidUUID(invitationToken)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token format' }), {
        status: 400,
        headers,
      });
    }

    // 3. Look up invitation by token
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('company_invitations')
      .select('id, email, role, company_id, status, expires_at')
      .eq('token', invitationToken)
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error(`[${FUNCTION_NAME}] Database error looking up invitation:`, inviteError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to validate invitation' }),
        { status: 500, headers },
      );
    }

    // 4. Validate invitation exists
    if (!invitation) {
      return new Response(JSON.stringify({ success: false, error: 'Invitation not found' }), {
        status: 404,
        headers,
      });
    }

    // 5. Check if invitation is pending
    if (invitation.status !== 'pending') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invitation has already been ${invitation.status}`,
        }),
        { status: 400, headers },
      );
    }

    // 6. Check if invitation has expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'This invitation has expired' }),
        { status: 400, headers },
      );
    }

    // 7. Validate that the logged-in user's email matches the invitation email
    const invitationEmail = invitation.email?.toLowerCase();
    if (invitationEmail !== userEmail) {
      console.warn(
        `[${FUNCTION_NAME}] Email mismatch: user=${userEmail}, invitation=${invitationEmail}`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This invitation was sent to a different email address',
        }),
        { status: 403, headers },
      );
    }

    // 8. Check if user already is a member of this company
    // First, get the internal user ID from the users table
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    if (userError || !userData) {
      console.error(`[${FUNCTION_NAME}] User not found in users table:`, userError);
      return new Response(JSON.stringify({ success: false, error: 'User profile not found' }), {
        status: 500,
        headers,
      });
    }

    const internalUserId = userData.id;

    // Check if already a member
    const { data: existingMember } = await supabaseAdmin
      .from('company_members')
      .select('id, status')
      .eq('user_id', internalUserId)
      .eq('company_id', invitation.company_id)
      .maybeSingle();

    if (existingMember) {
      if (existingMember.status === 'active') {
        return new Response(
          JSON.stringify({ success: false, error: 'You are already a member of this company' }),
          { status: 400, headers },
        );
      }
      // If invited or pending, we can update to active
    }

    // 9. Get company name for response
    let companyName = 'the company';
    try {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('name')
        .eq('id', invitation.company_id)
        .single();
      if (company?.name) {
        companyName = company.name;
      }
    } catch (companyErr) {
      console.warn(`[${FUNCTION_NAME}] Could not fetch company name:`, companyErr);
    }

    // 10. Insert into company_members
    if (existingMember) {
      // Update existing membership to active
      const { error: updateError } = await supabaseAdmin
        .from('company_members')
        .update({
          role: invitation.role,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMember.id);

      if (updateError) {
        console.error(`[${FUNCTION_NAME}] Failed to update membership:`, updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to activate membership' }),
          { status: 500, headers },
        );
      }
    } else {
      // Insert new membership
      const { error: insertError } = await supabaseAdmin.from('company_members').insert({
        user_id: internalUserId,
        company_id: invitation.company_id,
        role: invitation.role,
        status: 'active',
      });

      if (insertError) {
        console.error(`[${FUNCTION_NAME}] Failed to insert membership:`, insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create membership' }),
          { status: 500, headers },
        );
      }
    }

    // 11. Update invitation status to 'accepted'
    const { error: updateInviteError } = await supabaseAdmin
      .from('company_invitations')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    if (updateInviteError) {
      console.error(`[${FUNCTION_NAME}] Failed to update invitation status:`, updateInviteError);
      // The membership was created, so we still return success but log the error
    }

    console.log(
      `[${FUNCTION_NAME}] Invitation accepted by ${userEmail} for company ${invitation.company_id}`,
    );

    // 12. Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: `You are now a ${invitation.role} of ${companyName}`,
        company_name: companyName,
        role: invitation.role,
      }),
      { status: 200, headers },
    );
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] Unexpected error:`, e);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers,
    });
  }
});
