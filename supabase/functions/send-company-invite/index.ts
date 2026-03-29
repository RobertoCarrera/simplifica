// Edge Function: send-company-invite
// Purpose: Owner/Admin triggers company invitation email using Supabase Auth SMTP (SES configured)
// Flow:
// 1) Validate requester (JWT) and parse body { email, role?, message? }
// 2) Call RPC invite_user_to_company(p_company_id?, p_email, p_role, p_message) or your variant
// 3) Fetch token via get_company_invitation_token(invitation_id)
// 4) Call supabase.auth.admin.inviteUserByEmail(email, { redirectTo: `${APP_URL}/invite?token=${token}` })
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, CLIENT_PORTAL_URL, ALLOWED_ORIGINS
//
// Redirect strategy:
//   - role=client  → CLIENT_PORTAL_URL/accept-invite (portal.simplificacrm.es)
//   - role=staff   → APP_URL/invite (app.simplificacrm.es)
// This prevents client users from hitting StaffGuard on the staff app, which blocks them
// with "profile is null" because they have no staff profile.

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, SECURITY_HEADERS } from '../_shared/security.ts';


serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || undefined;
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    const optionsResponse = handleCorsOptions(req);
    if (optionsResponse) return optionsResponse;
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  // Rate limiting: 5 req/min per IP (sends Supabase Auth invite emails — sensitive)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`send-company-invite:${ip}`, 5, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...corsHeaders,
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', allowed: ['POST', 'OPTIONS'] }),
      {
        status: 405,
        headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const APP_URL = Deno.env.get('APP_URL') || '';
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('send-company-invite: missing env vars', {
        hasUrl: !!SUPABASE_URL,
        hasKey: !!SERVICE_ROLE_KEY,
        hasAppUrl: !!APP_URL,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'missing_env',
          message: 'Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }
    // SECURITY: Never use the request Origin as the redirect base.
    // An attacker with a valid JWT could set Origin: https://evil.com and the invite
    // email would contain a phishing link. Always use the server-configured APP_URL.
    if (!APP_URL) {
      console.error('send-company-invite: APP_URL env var is not set — cannot send safe redirect');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'missing_env',
          message: 'APP_URL not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }
    const redirectBase = APP_URL;

    // Client portal URL for client invitations.
    // Set CLIENT_PORTAL_URL in Supabase Edge Function secrets for production overrides.
    const CLIENT_PORTAL_URL =
      Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://portal.simplificacrm.es';

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      console.warn('send-company-invite: missing bearer token header');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'unauthorized',
          message: 'Authorization Bearer token required',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const body = await req.json().catch(() => ({}) as any);
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const role = String(body?.role || 'member').trim();

    const VALID_INVITE_ROLES = ['admin', 'member', 'client'];
    if (!['admin', 'member', 'client', 'owner', 'super_admin'].includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_request', message: 'Invalid role' }),
        {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    // Sanitize message: strip HTML, enforce max length to prevent email injection / DoS
    const rawMessage = body?.message != null ? String(body.message) : null;
    const message = rawMessage
      ? rawMessage
          .replace(/<[^>]*>/g, '')
          .replace(
            /[<>"'&]/g,
            (c) =>
              ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' })[c] ?? c,
          )
          .slice(0, 500)
          .trim()
      : null;
    const forceEmail = body?.force_email === true; // Flag to ALWAYS send email

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_request',
          message: 'Email address is invalid',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Determine company_id of requester and check role owner/admin
    const token = authHeader.replace('Bearer ', '');
    const { data: userFromToken, error: tokenErr } = await supabaseAdmin.auth.getUser(token);
    if (tokenErr || !userFromToken?.user?.id) {
      console.warn('send-company-invite: invalid token or user not found', tokenErr);
      return new Response(
        JSON.stringify({ success: false, error: 'unauthorized', message: 'Invalid auth token' }),
        {
          status: 401,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const authUserId = userFromToken.user.id;

    // SECURITY: Prevent self-invite — a user cannot invite their own email address
    if (userFromToken.user.email?.toLowerCase() === email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'forbidden',
          message: 'No puedes invitarte a ti mismo',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // FETCH USER AND ACTIVE MEMBERSHIP
    // Since users.company_id is deprecated, we must fetch from company_members.
    // We assume the user is "active" (status='active') in at least one company with role 'owner' or 'admin'.
    // If multiple, we might need to know WHICH company context they are in.
    // For now, we take the first "owner"/"admin" active membership.
    // Ideally, the client should pass the `company_id` context, but to stay secure we verify membership.

    // 1. Get User ID and Global Role
    const { data: userData, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, active, app_role:app_roles(name)')
      .eq('auth_user_id', authUserId)
      .single();

    if (userErr || !userData?.active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'forbidden',
          message: 'User not found or inactive',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const globalRole = Array.isArray(userData.app_role)
      ? userData.app_role[0]?.name
      : userData.app_role?.name;
    const isSuperAdmin = globalRole === 'super_admin';

    if (!isSuperAdmin && !VALID_INVITE_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'forbidden',
          message: 'No tienes permiso para asignar ese rol.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    // 2. Get Active Membership (Owner/Admin)
    // We prioritize the company_id passed in the body if available (to support multi-company switching context)
    // Otherwise fallback to any owner/admin membership.
    const requestedCompanyId = body?.company_id;

    let membershipQuery = supabaseAdmin
      .from('company_members')
      .select('company_id, role_data:app_roles(name)')
      .eq('user_id', userData.id)
      .eq('status', 'active');

    if (requestedCompanyId) {
      membershipQuery = membershipQuery.eq('company_id', requestedCompanyId);
    }

    const { data: allMemberships, error: memberErr } = await membershipQuery;

    if (memberErr || !allMemberships) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'forbidden',
          message: 'Error checking permissions',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    // Filter for owner/admin in memory since we can't easily filter by joined column in simple query
    // Super admins bypass this role requirement
    let validMemberships = allMemberships.filter((m: any) => {
      const roleName = m.role_data?.name;
      return roleName === 'owner' || roleName === 'admin';
    });

    // If super admin, allow them to proceed even if the company's membership doesn't explicitly have owner/admin role
    if (isSuperAdmin && validMemberships.length === 0 && allMemberships.length > 0) {
      validMemberships = allMemberships;
    }

    if (validMemberships.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'forbidden',
          message: 'User is not an admin/owner of any active company (or the requested one)',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    // Use the first valid membership found
    const activeMembership = validMemberships[0];
    const activeRole = activeMembership.role_data?.name;

    const currentUser = {
      id: userData.id,
      company_id: activeMembership.company_id,
      role: activeRole,
    };

    // Create invitation directly
    let invitationId: string | null = null;
    let inviteToken: string | null = null;

    // Generate token
    const generatedToken = crypto.randomUUID();
    // Set expiration (7 days)
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { data: created, error: createErr } = await supabaseAdmin
      .from('company_invitations')
      .insert({
        company_id: role === 'owner' && isSuperAdmin ? null : currentUser.company_id,
        email,
        role,
        status: 'pending',
        token: generatedToken,
        expires_at: expiresAt,
        invited_by_user_id: currentUser.id,
        message: message, // Include message!
      })
      .select('id, token')
      .single();

    if (createErr) {
      // Handle unique violation (resend)
      if ((createErr as any).code === '23505') {
        let existingQuery = supabaseAdmin
          .from('company_invitations')
          .select('id, token')
          .eq('email', email);

        if (role === 'owner' && isSuperAdmin) {
          existingQuery = existingQuery.is('company_id', null);
        } else {
          existingQuery = existingQuery.eq('company_id', currentUser.company_id);
        }

        const { data: existing } = await existingQuery.maybeSingle();

        if (existing) {
          // Update existing
          const { data: updated, error: updErr } = await supabaseAdmin
            .from('company_invitations')
            .update({
              status: 'pending',
              token: generatedToken,
              expires_at: expiresAt,
              invited_by_user_id: currentUser.id,
              message: message,
            })
            .eq('id', existing.id)
            .select('id, token')
            .single();

          if (!updErr && updated) {
            invitationId = updated.id;
            inviteToken = updated.token;
          } else {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'update_failed',
                message: 'No se pudo actualizar la invitación existente',
              }),
              {
                status: 500,
                headers: {
                  ...corsHeaders,
                  ...SECURITY_HEADERS,
                  'Content-Type': 'application/json',
                },
              },
            );
          }
        }
      } else {
        console.error('send-company-invite: create failed', createErr);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'create_failed',
            message: 'No se pudo crear la invitación',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      }
    } else {
      invitationId = created.id;
      inviteToken = created.token;
    }

    // Simplified logic: We already created/updated the invitation at the start.
    // If that failed, we returned early.
    // So invitationId and inviteToken SHOULD be set.

    if (!invitationId || !inviteToken) {
      // This should technically be unreachable if the initial insert/update succeeded,
      // but as a fallback, generate one last token.
      inviteToken = crypto.randomUUID();
      console.warn(
        'send-company-invite: invitationId/token missing after initial ops, using generated token without DB persistence (risky)',
      );
    }

    // We do NOT need to upsert again. The initial block handles uniqueness on (company_id, email)
    // Note: For Super Admins (company_id is null), uniqueness on (company_id, email) might fail in Postgres (multiple nulls allowed).
    // We should handle that by ensuring we cleaning up previous pending invites for this email/role if needed,
    // or just accept that multiple might exist but we use the latest token.
    // Ideally we should have a unique index on email where company_id is null?
    // For now, removing the redundant block avoids creating a *second* row in the same execution.

    // SECURITY (SEC-INV-01): Token is NO LONGER embedded in the redirectTo URL.
    // The invite email sends users to /invite (staff) or /accept-invite (client) with NO token in the URL.
    // The frontend must prompt the user to paste/enter their token, or the token
    // is delivered via a separate secure channel (e.g., POST body on acceptance).
    // This prevents token leakage via Referer headers, server logs, and browser history.
    //
    // REDIRECT STRATEGY: Client invitations go to the client portal to avoid StaffGuard.
    // Staff users invited as clients would hit StaffGuard on the staff app (app.simplificacrm.es)
    // which blocks them with "profile is null" because clients have no staff profile.
    const isClientInvite = role === 'client';
    const safeRedirectUrl = isClientInvite
      ? `${CLIENT_PORTAL_URL}/accept-invite`
      : `${redirectBase}/invite`;

    // Send invite email using Supabase Auth
    // Strategy: Try inviteUserByEmail first, if it fails for ANY reason, fallback to OTP magic link.
    // This is robust against supabase-js version changes in error shapes.
    let emailSent = false;
    let emailError = null;

    // Step 1: Try inviteUserByEmail (triggers "Invite User" email template)
    try {
      const { data: inviteData, error: inviteErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: safeRedirectUrl,
          data: { message: message },
        });

      if (inviteErr) {
        console.log('send-company-invite: inviteUserByEmail returned error', {
          status: inviteErr.status,
          code: (inviteErr as any).code,
          message: inviteErr.message,
        });
      } else {
        emailSent = true;
        console.log('send-company-invite: inviteUserByEmail succeeded');
      }
    } catch (inviteThrown: any) {
      console.log('send-company-invite: inviteUserByEmail threw', {
        status: inviteThrown?.status,
        code: inviteThrown?.code,
        message: inviteThrown?.message,
        name: inviteThrown?.name,
      });
    }

    // Step 2: If invite didn't work (user already exists, or any other reason), try Magic Link OTP
    if (!emailSent) {
      console.log('send-company-invite: Falling back to Magic Link OTP for', email);
      try {
        const { error: otpErr } = await supabaseAdmin.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: safeRedirectUrl,
            shouldCreateUser: false, // User already exists
            data: { message: message },
          },
        });

        if (otpErr) {
          console.error('send-company-invite: OTP returned error', {
            status: otpErr.status,
            code: (otpErr as any).code,
            message: otpErr.message,
          });
          emailError = otpErr;
        } else {
          emailSent = true;
          console.log('send-company-invite: OTP magic link sent successfully');
        }
      } catch (otpThrown: any) {
        console.error('send-company-invite: OTP threw', {
          status: otpThrown?.status,
          code: otpThrown?.code,
          message: otpThrown?.message,
          name: otpThrown?.name,
        });
        emailError = otpThrown;
      }
    }

    if (!emailSent) {
      console.error('send-company-invite: email NOT sent', { forceEmail, emailError });
      if (forceEmail) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'email_send_failed',
            message: 'No se pudo enviar el email de invitación',
          }),
          {
            headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: 'email_send_failed',
          message: 'No se pudo enviar el email, pero la invitación se creó correctamente',
        }),
        {
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    return new Response(JSON.stringify({ success: true, invitation_id: invitationId || null }), {
      headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('send-company-invite: unhandled error', {
      message: error?.message,
      stack: error?.stack,
    });
    return new Response(
      JSON.stringify({ success: false, error: 'Error interno al procesar la invitación' }),
      {
        headers: {
          ...getCorsHeaders(req),
          ...SECURITY_HEADERS,
          'Content-Type': 'application/json',
        },
        status: 500,
      },
    );
  }
});
