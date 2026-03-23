// Edge Function: notify-waitlist (DEPRECATED — thin adapter)
//
// ⚠️  DEPRECATED: This function is a backward-compatibility adapter only.
//     Existing callers still work, but all business logic has moved to the
//     `notify_waitlist` PostgreSQL RPC. New code should call the RPC directly
//     via supabase.rpc('notify_waitlist', {...}) and then invoke
//     `send-waitlist-email` for each entry in `emails_to_send`.
//
//     Planned removal: Phase 4 of waitlist feature rollout.
//
// What this adapter does:
//   1. Validates JWT + admin role (same as before)
//   2. Calls `notify_waitlist` RPC — delegates all DB logic
//   3. Dispatches `send-waitlist-email` for each email payload returned
//   4. Returns same response shape as the original function for compatibility

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  // Rate limiting: 20 req/min per IP (same as original)
  const ip = getClientIP(req);
  const rl = checkRateLimit(`notify-waitlist:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  try {
    // ── Auth: verify JWT ───────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'missing_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse request body ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { service_id, start_time, end_time, mode = 'active' } = body;

    if (!service_id || !start_time || !end_time) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_request',
          message: 'Required fields: service_id, start_time, end_time',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Delegate to notify_waitlist RPC ────────────────────────────────────
    // Use the user's token so SECURITY DEFINER RPC inherits auth context
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: rpcResult, error: rpcError } = await userClient.rpc('notify_waitlist', {
      p_service_id: service_id,
      p_start_time: start_time,
      p_end_time: end_time,
      p_mode: mode,
    });

    if (rpcError) {
      console.error('notify-waitlist adapter: RPC error:', rpcError);
      return new Response(
        JSON.stringify({ success: false, error: 'rpc_error', message: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Handle RPC-level errors (returned as JSONB error fields)
    if (rpcResult?.error) {
      const status =
        rpcResult.error === 'not_authenticated'
          ? 401
          : rpcResult.error === 'permission_denied'
            ? 403
            : 500;
      return new Response(JSON.stringify({ success: false, error: rpcResult.error }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailsToSend: Array<{
      email: string;
      name: string;
      service_name: string;
      waitlist_id: string;
    }> = rpcResult?.emails_to_send ?? [];

    // ── Dispatch send-waitlist-email for each returned entry ───────────────
    // Fire in parallel; errors are logged but don't fail the whole adapter
    const emailPromises = emailsToSend.map((entry) =>
      userClient.functions
        .invoke('send-waitlist-email', {
          body: {
            to: entry.email,
            name: entry.name,
            service_name: entry.service_name,
            start_time,
            end_time,
            type: mode === 'passive' ? 'passive' : 'active_notify',
            waitlist_id: entry.waitlist_id,
          },
        })
        .catch((err: unknown) =>
          console.warn(`notify-waitlist adapter: email dispatch failed for ${entry.email}:`, err),
        ),
    );

    await Promise.allSettled(emailPromises);

    // ── Return backward-compatible response ────────────────────────────────
    const notifiedCount = rpcResult?.notified ?? 0;
    return new Response(
      JSON.stringify({
        success: true,
        notified: notifiedCount > 0,
        notified_count: notifiedCount,
        // Legacy field for callers that check waitlist_id:
        waitlist_id: emailsToSend[0]?.waitlist_id ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('notify-waitlist adapter: Unhandled error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
