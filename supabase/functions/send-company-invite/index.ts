// Edge Function: send-company-invite
// Purpose: Owner/Admin triggers company invitation email via send-branded-email
// Flow:
// 1) Validate requester (JWT) and parse body { email, role?, message? }
// 2) Create invitation record in company_invitations
// 3) Send email via send-branded-email (fallback to Supabase Auth / magic link)
//
// Redirect strategy (for fallback):
//   - role=client  → CLIENT_PORTAL_URL/accept-invite (portal.simplificacrm.es)
//   - role=staff   → APP_URL/invite (app.simplificacrm.es)

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, SECURITY_HEADERS } from '../_shared/security.ts';

// Helper: call send-branded-email Edge Function with fallback to Supabase Auth
async function sendBrandedEmailInvite(params: {
  companyId: string;
  emailType: string;
  to: { email: string; name: string }[];
  subject?: string;
  data: Record<string, unknown>;
  supabaseUrl: string;
  serviceRoleKey: string;
  // Fallback params
  fallbackFn: () => Promise<{ success: boolean; error?: string }>;
}): Promise<{ success: boolean; error?: string }> {
  const { supabaseUrl, serviceRoleKey, companyId, emailType, to, subject, data, fallbackFn } = params;

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
    if (result.success) {
      return { success: true };
    }
    console.warn('[send-company-invite] send-branded-email returned error:', result.error);
    return { success: false, error: result.error };
  } catch (e) {
    console.warn('[send-company-invite] send-branded-email not available, falling back to Supabase Auth');
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

  // Rate limiting: 5 req/min per IP (sends invite emails — sensitive)
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
    if (!APP_URL) {
      console.error('send-company-invite: APP_URL env var is not set');
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

    const VALID_INVITE_ROLES = ['admin', 'member', 'client', 'professional'];
    if (!['admin', 'member', 'client', 'owner', 'super_admin', 'professional'].includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_request', message: 'Invalid role' }),
        {
          status: 400,
          headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const rawMessage = body?.message != null ? String(body.message) : null;
    const message = rawMessage
      ? rawMessage
          .replace(/<[^>]*>/g, '')
          .replace(/[<>"'&]/g, (c) =>
            ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' })[c] ?? c,
          )
          .slice(0, 500)
          .trim()
      : null;

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

    // Prevent self-invite
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

    let validMemberships = allMemberships.filter((m: any) => {
      const roleName = m.role_data?.name;
      return roleName === 'owner' || roleName === 'admin';
    });

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

    const activeMembership = validMemberships[0];
    const activeRole = activeMembership.role_data?.name;
    const currentCompanyId = role === 'owner' && isSuperAdmin ? null : activeMembership.company_id;

    // Create invitation
    let invitationId: string | null = null;
    let inviteToken: string | null = null;
    const generatedToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { data: created, error: createErr } = await supabaseAdmin
      .from('company_invitations')
      .insert({
        company_id: currentCompanyId,
        email,
        role,
        status: 'pending',
        token: generatedToken,
        expires_at: expiresAt,
        invited_by_user_id: userData.id,
        message: message,
      })
      .select('id, token')
      .single();

    if (createErr) {
      if ((createErr as any).code === '23505') {
        let existingQuery = supabaseAdmin
          .from('company_invitations')
          .select('id, token')
          .eq('email', email);

        if (role === 'owner' && isSuperAdmin) {
          existingQuery = existingQuery.is('company_id', null);
        } else {
          existingQuery = existingQuery.eq('company_id', currentCompanyId);
        }

        const { data: existing } = await existingQuery.maybeSingle();

        if (existing) {
          const { data: updated, error: updErr } = await supabaseAdmin
            .from('company_invitations')
            .update({
              status: 'pending',
              token: generatedToken,
              expires_at: expiresAt,
              invited_by_user_id: userData.id,
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
                headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
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

    if (!invitationId || !inviteToken) {
      inviteToken = crypto.randomUUID();
      console.warn('send-company-invite: invitationId/token missing, using generated token');
    }

    // Redirect strategy
    const isClientInvite = role === 'client';
    const safeRedirectUrl = isClientInvite
      ? `${CLIENT_PORTAL_URL}/accept-invite`
      : `${redirectBase}/invite`;

    const inviteLink = `${safeRedirectUrl}?token=${inviteToken}`;

    // Build company data for email
    let companyName = 'Simplifica';
    if (currentCompanyId) {
      const { data: companyData } = await supabaseAdmin
        .from('companies')
        .select('name')
        .eq('id', currentCompanyId)
        .single();
      companyName = companyData?.name || 'Simplifica';
    }

    // Try send-branded-email first, fall back to Supabase Auth
    let emailSent = false;
    if (currentCompanyId || isSuperAdmin) {
      const companyIdForEmail = currentCompanyId || 'global';
      const brandedResult = await sendBrandedEmailInvite({
        companyId: companyIdForEmail,
        emailType: 'invite',
        to: [{ email, name: '' }],
        subject: undefined,
        data: { company: { name: companyName }, inviteLink, role, message },
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_ROLE_KEY,
        fallbackFn: async () => {
          // Fallback: try Supabase Auth inviteUserByEmail, then Magic Link OTP
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
              return { success: true };
            }
          } catch (inviteThrown: any) {
            console.log('send-company-invite: inviteUserByEmail threw', {
              status: inviteThrown?.status,
              code: inviteThrown?.code,
              message: inviteThrown?.message,
            });
          }

          // Fallback to Magic Link OTP
          try {
            const { error: otpErr } = await supabaseAdmin.auth.signInWithOtp({
              email,
              options: {
                emailRedirectTo: safeRedirectUrl,
                shouldCreateUser: false,
                data: { message: message },
              },
            });

            if (otpErr) {
              console.error('send-company-invite: OTP returned error', {
                status: otpErr.status,
                code: (otpErr as any).code,
                message: otpErr.message,
              });
              return { success: false, error: otpErr.message };
            } else {
              return { success: true };
            }
          } catch (otpThrown: any) {
            console.error('send-company-invite: OTP threw', {
              status: otpThrown?.status,
              code: otpThrown?.code,
              message: otpThrown?.message,
            });
            return { success: false, error: otpThrown?.message };
          }
        },
      });

      if (brandedResult.success) {
        emailSent = true;
      } else if (brandedResult.error !== 'send-branded-email unavailable') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'email_send_failed',
            message: brandedResult.error || 'No se pudo enviar el email de invitación',
          }),
          {
            headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      } else {
        // Call fallback
        const fallbackResult = await brandedResult.fallbackFn();
        if (fallbackResult.success) {
          emailSent = true;
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'email_send_failed',
              message: fallbackResult.error || 'No se pudo enviar el email de invitación',
            }),
            {
              headers: { ...corsHeaders, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
              status: 500,
            },
          );
        }
      }
    } else {
      // No company ID, use fallback directly
      // Try Supabase Auth inviteUserByEmail
      try {
        const { data: inviteData, error: inviteErr } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            redirectTo: safeRedirectUrl,
            data: { message: message },
          });

        if (!inviteErr) {
          emailSent = true;
        }
      } catch {}

      if (!emailSent) {
        try {
          const { error: otpErr } = await supabaseAdmin.auth.signInWithOtp({
            email,
            options: {
              emailRedirectTo: safeRedirectUrl,
              shouldCreateUser: false,
              data: { message: message },
            },
          });

          if (!otpErr) {
            emailSent = true;
          }
        } catch {}
      }
    }

    if (!emailSent) {
      console.error('send-company-invite: email NOT sent');
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