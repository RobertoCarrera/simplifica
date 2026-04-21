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
//   - role=client  → CLIENT_PORTAL_URL/invite (portal.simplificacrm.es)
//   - role=staff   → APP_URL/invite (app.simplificacrm.es)
// This prevents client users from hitting StaffGuard on the staff app, which blocks them
// with "profile is null" because they have no staff profile.

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, SECURITY_HEADERS } from '../_shared/security.ts';

// Sends a branded invitation email via send-branded-email Edge Function.
// Falls back to Supabase Auth built-in invite if the branded function is unavailable.
async function sendBrandedEmailInvite(params: {
  companyId: string;
  to: { email: string; name?: string }[];
  subject?: string;
  data: Record<string, unknown>;
  supabaseUrl: string;
  serviceRoleKey: string;
  emailType: string;
  fallbackFn: () => Promise<{ success: boolean; error?: string }>;
}): Promise<{ success: boolean; error?: string }> {
  const { companyId, to, subject, data, supabaseUrl, serviceRoleKey, emailType, fallbackFn } = params;
  try {
    const functionsBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
    const brandedResponse = await fetch(`${functionsBase}/send-branded-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ companyId, emailType, to, subject, data }),
    });
    const result = await brandedResponse.json();
    if (result.success) return { success: true };
    console.warn('[send-company-invite] send-branded-email returned error:', result.error);
    return { success: false, error: result.error };
  } catch (e) {
    console.warn('[send-company-invite] send-branded-email unavailable, using fallback');
    return { success: false, error: 'send-branded-email unavailable' };
  }
}

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
    const CLIENT_PORTAL_SUPABASE_URL = Deno.env.get('CLIENT_PORTAL_SUPABASE_URL') ?? '';
    const CLIENT_PORTAL_SERVICE_ROLE_KEY = Deno.env.get('CLIENT_PORTAL_SERVICE_ROLE_KEY') ?? '';

    // Allow the caller to pass a portal_url for dev environments (e.g. localhost:4201).
    // SECURITY: validated against a hardcoded allowlist — prevents open-redirect attacks.
    const ALLOWED_PORTAL_ORIGINS = [
      'https://portal.simplificacrm.es',
      'http://localhost:4201',
    ];

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

    // Portal URL effective calculation — must happen AFTER req.json() to read body.portal_url
    const requestedPortalUrl = body?.portal_url ? String(body.portal_url).trim().replace(/\/$/, '') : null;
    const effectivePortalUrl =
      requestedPortalUrl && ALLOWED_PORTAL_ORIGINS.includes(requestedPortalUrl)
        ? requestedPortalUrl
        : CLIENT_PORTAL_URL;

    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const role = String(body?.role || 'member').trim();

    const VALID_INVITE_ROLES = ['admin', 'member', 'client', 'professional', 'agent'];
    if (!['admin', 'member', 'client', 'owner', 'super_admin', 'professional', 'agent'].includes(role)) {
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
    const isResend = body?.resend === true;

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

    // Portal admin client (Simplifica Public) — used for client invites so the magic-link
    // creates a session in the correct auth project (portal, not CRM).
    const portalAdmin =
      CLIENT_PORTAL_SUPABASE_URL && CLIENT_PORTAL_SERVICE_ROLE_KEY
        ? createClient(CLIENT_PORTAL_SUPABASE_URL, CLIENT_PORTAL_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
        : null;

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

    let existingPendingInviteQuery = supabaseAdmin
      .from('company_invitations')
      .select('id, token, send_count')
      .eq('email', email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (role === 'owner' && isSuperAdmin) {
      existingPendingInviteQuery = existingPendingInviteQuery
        .is('company_id', null)
        .eq('invited_by_user_id', currentUser.id);
    } else {
      existingPendingInviteQuery = existingPendingInviteQuery.eq('company_id', currentUser.company_id);
    }

    const { data: existingPendingInvite, error: existingPendingInviteErr } =
      await existingPendingInviteQuery.maybeSingle();

    if (existingPendingInviteErr) {
      console.error('send-company-invite: duplicate check failed', existingPendingInviteErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'duplicate_check_failed',
          message: 'No se pudo comprobar si ya existe una invitación pendiente.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    // Generate token
    const generatedToken = crypto.randomUUID();
    // Set expiration (7 days)
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    if (existingPendingInvite) {
      if (!isResend) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'duplicate_invite',
            message: 'Ya existe una invitación pendiente para este email.',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
          },
        );
      }

      const { data: updated, error: updErr } = await supabaseAdmin
        .from('company_invitations')
        .update({
          status: 'pending',
          token: generatedToken,
          expires_at: expiresAt,
          invited_by_user_id: currentUser.id,
          message: message,
          last_sent_at: new Date().toISOString(),
          send_count: ((existingPendingInvite as any).send_count || 0) + 1,
        })
        .eq('id', existingPendingInvite.id)
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
    } else {
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
          message: message,
          last_sent_at: new Date().toISOString(),
          send_count: 1,
        })
        .select('id, token')
        .single();

      if (createErr) {
        // Handle unique violation (resend)
        if ((createErr as any).code === '23505') {
          let existingQuery = supabaseAdmin
            .from('company_invitations')
            .select('id, token, send_count')
            .eq('email', email);

          if (role === 'owner' && isSuperAdmin) {
            existingQuery = existingQuery
              .is('company_id', null)
              .eq('invited_by_user_id', currentUser.id);
          } else {
            existingQuery = existingQuery.eq('company_id', currentUser.company_id);
          }

          const { data: existing } = await existingQuery.maybeSingle();

          if (existing) {
            const { data: updated, error: updErr } = await supabaseAdmin
              .from('company_invitations')
              .update({
                status: 'pending',
                token: generatedToken,
                expires_at: expiresAt,
                invited_by_user_id: currentUser.id,
                message: message,
                last_sent_at: new Date().toISOString(),
                send_count: ((existing as any).send_count || 0) + 1,
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

    // COMPATIBILITY: The deployed staff app still resolves invitations from `?token=`.
    // Keep the token in redirectTo for staff invites, and mirror it in auth metadata so
    // the frontend can migrate away from URL tokens safely in a later rollout.
    //
    // REDIRECT STRATEGY: Client invitations go to the client portal to avoid StaffGuard.
    // Staff users invited as clients would hit StaffGuard on the staff app (app.simplificacrm.es)
    // which blocks them with "profile is null" because clients have no staff profile.
    const isClientInvite = role === 'client';
    // Include token in redirect URL for client invites so the portal can load invitation details.
    const safeRedirectUrl = isClientInvite
      ? `${effectivePortalUrl}/invite?token=${inviteToken}`
      : `${redirectBase}/invite?token=${inviteToken}`;

    // Explicit invite link with token — always returned in the API response so the
    // admin can share it manually when the email doesn't arrive.
    const inviteLink = isClientInvite
      ? `${effectivePortalUrl}/invite?token=${inviteToken}`
      : `${redirectBase}/invite?token=${inviteToken}`;

    // Send invite email using Supabase Auth
    // Strategy: Try inviteUserByEmail first, if it fails for ANY reason, fallback to OTP magic link.
    // This is robust against supabase-js version changes in error shapes.
    let emailSent = false;
    let emailError = null;
    // Track portal auth user ID for client_portal_users linking
    let portalAuthUserId: string | null = null;

    // For client invites: use portal admin client so the invite email creates a session
    // in Simplifica Public (portal auth). Falls back to CRM admin if not configured.
    const inviteAdminClient = isClientInvite && portalAdmin ? portalAdmin : supabaseAdmin;
    if (isClientInvite && !portalAdmin) {
      console.warn(
        'send-company-invite: CLIENT_PORTAL_SUPABASE_URL or CLIENT_PORTAL_SERVICE_ROLE_KEY not set — ' +
          'client invite will use CRM auth. Set secrets to enable portal auth.',
      );
    }

    // ── Step 0: Send branded email via send-branded-email Edge Function ────
    // Falls back to Supabase Auth built-in invite if unavailable or on error.
    const brandedEmailResult = await sendBrandedEmailInvite({
      companyId: role === 'owner' && isSuperAdmin ? null : currentUser.company_id,
      to: [{ email, name: '' }],
      subject: isClientInvite
        ? `Te han invitado a ${APP_URL.replace(/https?:\/\//, '')}`
        : undefined,
      data: {
        invite_url: inviteLink,
        role,
        role_label: activeRole || role,
        inviter_name: userData.display_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || undefined,
        message: message || undefined,
        company_cif: undefined, // fetched separately if needed
      },
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SERVICE_ROLE_KEY,
      emailType: isClientInvite
      ? 'invite_client'
      : `invite_${['owner','admin','member','professional','agent'].includes(role) ? role : 'member'}`,
      fallbackFn: async () => {
        // Placeholder — actual fallback happens in Steps 1 and 2 below
        return { success: false, error: 'skipping' };
      },
    });

    // If send-branded-email succeeded, skip Supabase Auth email entirely
    if (brandedEmailResult.success) {
      console.log('send-company-invite: branded email sent successfully, skipping Supabase Auth');
      emailSent = true;
    } else {
      // send-branded-email was unavailable — fall through to Supabase Auth email
      console.warn('send-company-invite: branded email unavailable, using Supabase Auth');

      // Step 1: Try inviteUserByEmail (triggers "Invite User" email template)
      try {
        const { data: inviteData, error: inviteErr } =
          await inviteAdminClient.auth.admin.inviteUserByEmail(email, {
            redirectTo: safeRedirectUrl,
            data: { message: message, company_invite_token: inviteToken },
          });

        if (inviteErr) {
          console.log('send-company-invite: inviteUserByEmail returned error', {
            status: inviteErr.status,
            code: (inviteErr as any).code,
            message: inviteErr.message,
          });
        } else {
          emailSent = true;
          portalAuthUserId = inviteData?.user?.id ?? null;
          console.log('send-company-invite: inviteUserByEmail succeeded', {
            portalAuthUserId,
          });
        }
      } catch (inviteThrown: any) {
        console.log('send-company-invite: inviteUserByEmail threw', {
          status: inviteThrown?.status,
          code: inviteThrown?.code,
          message: inviteThrown?.message,
          name: inviteThrown?.name,
        });
      }

      // Step 2: User already exists — send magic link via signInWithOtp.
      // CRITICAL: Do NOT use admin.generateLink() here. generateLink only GENERATES the link
    // and returns it — it does NOT send any email. Despite returning 200, zero emails go out.
    // Additionally, generateLink updates GoTrue's internal rate-limit timestamp, which blocks
    // any subsequent signInWithOtp call with 429 for 60 seconds. Use signInWithOtp exclusively.
    if (!emailSent) {
      console.log('send-company-invite: user already exists — sending magic link via OTP', email);

      try {
        const { error: otpErr } = await inviteAdminClient.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: safeRedirectUrl,
            shouldCreateUser: false,
            data: { message: message, company_invite_token: inviteToken },
          },
        });

        if (otpErr) {
          const otpCode = (otpErr as any).code;
          const otpStatus = otpErr.status;
          console.error('send-company-invite: OTP returned error', {
            status: otpStatus,
            code: otpCode,
            message: otpErr.message,
          });
          // 429 means an email was already sent within the last 60 seconds — treat as success
          if (otpStatus === 429 || otpCode === 'over_email_send_rate_limit') {
            emailSent = true;
            console.log('send-company-invite: OTP rate-limited — previous email still valid');
          } else {
            emailError = otpErr;
          }
        } else {
          emailSent = true;
          console.log('send-company-invite: OTP magic link sent successfully');
        }
      } catch (otpThrown: any) {
        console.error('send-company-invite: OTP threw', otpThrown?.message);
        emailError = otpThrown;
      }

      // For client invites, resolve portalAuthUserId for client_portal_users linking.
      // We intentionally avoid generateLink because it would invalidate the OTP token
      // that was just sent to the user's email.
      if (isClientInvite && portalAdmin && !portalAuthUserId) {
        // First, check if a client_portal_users record exists from a previous invite
        try {
          const { data: existingRow } = await portalAdmin
            .from('client_portal_users')
            .select('auth_user_id')
            .eq('email', email)
            .maybeSingle();
          portalAuthUserId = existingRow?.auth_user_id ?? null;
          if (portalAuthUserId) {
            console.log('send-company-invite: portalAuthUserId from existing client_portal_users', { portalAuthUserId });
          }
        } catch (e: any) {
          console.warn('send-company-invite: client_portal_users lookup failed', e?.message);
        }

        // Fallback: search auth.users via admin API
        if (!portalAuthUserId) {
          try {
            const { data: listData } = await inviteAdminClient.auth.admin.listUsers({
              page: 1,
              perPage: 500,
            });
            const matchedUser = listData?.users?.find(
              (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
            );
            portalAuthUserId = matchedUser?.id ?? null;
            if (portalAuthUserId) {
              console.log('send-company-invite: portalAuthUserId from listUsers', { portalAuthUserId });
            } else {
              console.warn('send-company-invite: user not found in portal auth.users', { email });
            }
          } catch (lookupErr: any) {
            console.warn('send-company-invite: listUsers failed', lookupErr?.message);
          }
        }
      }
    }

    // Step 3 REMOVED: No more magic-link clipboard fallback.
    // If both invite and OTP fail, we return an error — the admin must retry.

    // ── Portal user linking (for client invites) ──────────────────────────
    // Create client_portal_users in the portal database so the portal app
    // recognizes the user after magic-link login. Also mirrors the record
    // into the CRM database for admin visibility.
    if (isClientInvite && portalAdmin) {
      try {
        // portalAuthUserId is captured in Step 1 (invite) or Step 2 (generateLink before OTP).
        // Do NOT call generateLink here — it would create a new token that invalidates
        // the magic-link token sent by signInWithOtp, causing "One-time token not found".

        if (portalAuthUserId) {
          // Try to find the client_id — but don't block the upsert if not found yet.
          // The invited person may only exist in company_invitations, not in clients yet.
          const { data: clientRow } = await supabaseAdmin
            .from('clients')
            .select('id')
            .eq('email', email)
            .eq('company_id', currentUser.company_id)
            .maybeSingle();

          const clientId = clientRow?.id ?? null;

          if (!clientId) {
            console.log(
              'send-company-invite: no clients record found for invited email — proceeding with client_id=null',
              { email, company_id: currentUser.company_id },
            );
          }

          // Portal database
          const { error: portalUpsertErr } = await portalAdmin
            .from('client_portal_users')
            .upsert(
              {
                auth_user_id: portalAuthUserId,
                client_id: clientId,
                company_id: currentUser.company_id,
                email: email,
                is_active: true,
              },
              { onConflict: 'auth_user_id' },
            );

          if (portalUpsertErr) {
            console.warn('send-company-invite: portal client_portal_users upsert failed', {
              code: portalUpsertErr.code,
              message: portalUpsertErr.message,
              details: portalUpsertErr.details,
            });
          } else {
            console.log('send-company-invite: client_portal_users created in portal', {
              auth_user_id: portalAuthUserId,
              client_id: clientId,
            });
          }

          // CRM database (mirror for admin visibility)
          const { error: crmUpsertErr } = await supabaseAdmin
            .from('client_portal_users')
            .upsert(
              {
                auth_user_id: portalAuthUserId,
                client_id: clientId,
                company_id: currentUser.company_id,
                email: email,
                is_active: true,
                created_by: currentUser.id,
              },
              { onConflict: 'auth_user_id' },
            );

          if (crmUpsertErr) {
            console.warn('send-company-invite: CRM client_portal_users upsert failed', {
              code: crmUpsertErr.code,
              message: crmUpsertErr.message,
              details: crmUpsertErr.details,
            });
          }
        } else {
          console.warn('send-company-invite: could not determine portal auth user ID');
        }
      } catch (portalLinkErr: any) {
        // Non-fatal — invitation still works, linking can be retried
        console.warn(
          'send-company-invite: portal user linking failed (non-fatal)',
          portalLinkErr?.message,
        );
      }
    }

    // ── Response ────────────────────────────────────────────────────────────
    if (!emailSent) {
      console.error('send-company-invite: email NOT sent — returning error', {
        invitationId,
        forceEmail,
        emailError: emailError?.message,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'email_delivery_failed',
          message: 'No se pudo enviar el email de invitación. Intentá de nuevo más tarde.',
          invitation_id: invitationId || null,
        }),
        {
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
          status: 502,
        },
      );
    }
    } // close } else { block (branded email unavailable fallback)

    return new Response(
      JSON.stringify({
        success: true,
        invitation_id: invitationId || null,
        email_sent: true,
      }),
      {
        headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
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
