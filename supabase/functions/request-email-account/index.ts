// Edge Function: request-email-account
// Purpose: When a professional without an email account wants to send feedback,
//          this function notifies the company owner that they need an email account configured.
//
// Trigger: Called from FeedbackModalComponent when professional clicks "Solicitar cuenta de correo"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';


interface RequestEmailAccountPayload {
  companyId: string;
  userId: string;
  userName: string;
  userEmail: string;
}

serve(async (req: Request) => {
  // Rate limiting FIRST (before CORS preflight) — Rafter v0.22 F-02 fix
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`request-email-account:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) }),
    });
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
    });
  }

  // Auth: require valid user session
  const authHeader = req.headers.get('authorization') || '';
  const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
    });
  }

  try {
    // Create Supabase client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const privateSupabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse payload
    const payload: RequestEmailAccountPayload = await req.json();

    if (!payload.companyId || !payload.userId || !payload.userName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
      });
    }

    // Rafter v0.23 F-10 fix: per-user rate limit (5/hour) on top of the per-IP
    // limit. A compromised JWT from one IP could otherwise spawn 20 AWS SES
    // notifications/min. Tighter per-user cap protects the SES bill from
    // authenticated abuse.
    const userRl = await checkRateLimit(`request-email-account:user:${payload.userId}`, 5, 3_600_000);
    if (!userRl.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: withSecurityHeaders({
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
          ...getRateLimitHeaders(userRl),
        }),
      });
    }

    // Find the owner of the company using service role (bypasses RLS)
    const { data: ownerMember } = await privateSupabase
      .from('company_members')
      .select('user_id, app_roles!inner(name)')
      .eq('company_id', payload.companyId)
      .eq('app_roles.name', 'owner')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (!ownerMember?.user_id) {
      return new Response(JSON.stringify({ error: 'No owner found for company' }), {
        status: 404,
        headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
      });
    }

    // Insert notification for the owner
    const { error: notifyError } = await privateSupabase.from('notifications').insert({
      company_id: payload.companyId,
      recipient_id: ownerMember.user_id,
      profile_type: 'owner',
      type: 'email_account_request',
      title: 'Solicitud de cuenta de correo',
      content: `${payload.userName} (${payload.userEmail}) quiere enviar feedback pero necesita que se le configure una cuenta de correo en Simplifica CRM.`,
      is_read: false,
      priority: 'high',
    });

    if (notifyError) {
      console.error('[request-email-account] Error inserting notification:', notifyError);
      return new Response(JSON.stringify({ error: 'Failed to send notification' }), {
        status: 500,
        headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('[request-email-account] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: withSecurityHeaders({ ...getCorsHeaders(req), 'Content-Type': 'application/json' }),
    });
  }
});