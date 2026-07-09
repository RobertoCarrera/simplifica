/**
 * Edge Function: check-completed-sessions
 *
 * Cron-triggered (every 60 minutes via pg_cron):
 * - Finds bookings where status='confirmed', end_time < NOW(), and session_end_notified_at IS NULL
 * - Creates HIGH priority notification for the assigned professional
 * - Updates session_end_notified_at to prevent duplicate notifications
 *
 * Phase 1 of Roberto's post-session automation flow.
 *
 * Security: canonical v2 auth — internal cron sends apikey header (sb_publishable_*)
 * which is accepted as service-role equivalent. See docs/designs/canonical-v2-ef-auth.md.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';

// Minimal inlined copy of withSecurityHeaders so this function bundles without
// needing ../_shared/security.ts on the bundler's search path. Keep in sync
// with the canonical shared module.
const _LOCAL_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-DNS-Prefetch-Control': 'off',
  'Content-Security-Policy': "default-src 'none'",
};
function _localWithSecurityHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { ..._LOCAL_SECURITY_HEADERS, ...headers };
}


async function getAuthUser(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Missing Authorization header');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized: invalid or expired token');
  return user;
}

function jsonSuccess(status: number, data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: _localWithSecurityHeaders({ 'Content-Type': 'application/json' }),
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: _localWithSecurityHeaders({ 'Content-Type': 'application/json' }),
  });
}

/**
 * Canonical v2 auth check (see docs/designs/canonical-v2-ef-auth.md).
 *
 * Returns `{ ok, asServiceRole }`. asServiceRole=true means the caller is
 * trusted as the backend (can bypass RLS, perform cross-tenant work).
 * This is the ONLY check the cron endpoint accepts — user JWTs are not
 * valid for an internal cron job.
 */
async function requireAuthorizedCaller(
  req: Request,
  _supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ ok: boolean; asServiceRole: boolean }> {
  // Legacy env-based keys (still set in Supabase Cloud for backwards compat).
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const VALID = new Set<string>([SERVICE_ROLE_KEY]);
  // v2 keys: registered via env when the project migrated to sb_publishable_/sb_secret_.
  for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')))      if (typeof v === 'string') VALID.add(v);
  // Rafter v0.63 R-44D54: removed SUPABASE_PUBLISHABLE_KEYS loop.
  // Publishable key is PUBLIC (embedded in the frontend bundle); including it
  // in the auth bypass set would let any internet caller invoke this cron
  // endpoint with the publishable key from the frontend bundle.

  const apikeyHeader = req.headers.get('apikey') ?? '';
  const authHeader   = req.headers.get('Authorization') ?? '';
  const bearerToken  = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';

  // Path 1: apikey header (v2 cron) — bypasses user gate
  if (apikeyHeader && VALID.has(apikeyHeader)) return { ok: true, asServiceRole: true };
  // Path 2: legacy service_role Bearer — bypasses user gate
  if (bearerToken && bearerToken === SERVICE_ROLE_KEY) return { ok: true, asServiceRole: true };

  return { ok: false, asServiceRole: false };
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed. Use POST.');
  }

  // Rate limit by IP (Rafter v0.45 — MEDIUM severity hardening, 600/min/IP)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || req.headers.get('x-real-ip')
          || 'unknown';
  const rateCheck = await checkRateLimit(`check-completed-sessions:${ip}`, 600, 60_000);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      { status: 429, headers: { ...getRateLimitHeaders(rateCheck), ..._localWithSecurityHeaders({ 'Content-Type': 'application/json' }) } }
    );
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  // Canonical v2 auth — accept apikey header OR legacy service_role Bearer.
  // Internal cron sends only apikey (per docs/designs/canonical-v2-ef-auth.md
  // and Supabase's own guidance: new sb_secret_* keys are not JWTs and cannot
  // be sent in Authorization: Bearer without the gateway rejecting with 401).
  const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const auth = await requireAuthorizedCaller(req, supabaseAdmin);
  if (!auth.ok) {
    return jsonError(401, 'Unauthorized: apikey header or service_role Bearer required');
  }

  try {
    // supabaseAdmin was created above for the auth check; reuse it for the body.

    // ── 1. Find completed-but-unnotified bookings ─────────────────────────────
    // We query confirmed bookings where end_time has passed and we haven't notified yet.
    // Uses service role to bypass RLS (needed to read bookings across companies).
    //
    // Rafter v0.57 (2026-06-29 audit): the `professionals:professional_id ( user_id )`
    // join below is REQUIRED. notifications.recipient_id is FK-constrained to
    // users(id), but booking.professional_id is professionals(id), NOT users(id).
    // Using the joined user_id satisfies the FK; 293 historic past bookings were
    // silently dropped before this fix because the insert failed the FK check.
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        company_id,
        client_id,
        professional_id,
        service_id,
        start_time,
        end_time,
        status,
        payment_method,
        payment_status,
        session_end_notified_at,
        services:service_id ( name ),
        clients:client_id ( name, email ),
        professionals:professional_id ( user_id )
      `)
      .eq('status', 'confirmed')
      .is('session_end_notified_at', null)
      .lt('end_time', new Date().toISOString())
      .limit(100); // Process in batches

    if (bookingsError) {
      console.error('[check-completed-sessions] Error querying bookings:', bookingsError);
      return jsonError(500, 'Error querying bookings: ' + bookingsError.message);
    }

    if (!bookings || bookings.length === 0) {
      return jsonSuccess(200, { notified: 0, message: 'No pending sessions to notify' });
    }

    console.log(`[check-completed-sessions] Found ${bookings.length} sessions to notify`);

    // ── 2. For each booking, create notification + mark as notified ───────────
    let notified = 0;
    const errors: string[] = [];

    for (const booking of bookings) {
      // Rafter v0.57 fix: notifications.recipient_id must reference users(id),
      // but booking.professional_id is professionals(id). Resolve via the join
      // we added to the SELECT above so the FK on notifications.recipient_id
      // is satisfied. Falls back to old (broken) value only as a last resort
      // so we get a clean FK error rather than a silent null.
      const professionalUserId = (booking.professionals as any)?.user_id as string | null;
      const professionalId = professionalUserId ?? (booking.professional_id as string | null);
      const clientName = (booking.clients as any)?.name || 'Cliente';
      const serviceName = (booking.services as any)?.name || 'Servicio';

      if (!professionalId) {
        console.warn(`[check-completed-sessions] Booking ${booking.id} has no professional_id, skipping`);
        continue;
      }

      // Determine payment status for notification content
      const isCashPayment = !booking.payment_method || booking.payment_method === 'cash';
      const needsPayment = booking.payment_status === 'pending' || booking.payment_status === 'partial';

      let content = `La sesión de ${serviceName} con ${clientName} ha finalizado. Confirma los detalles y cierra la sesión.`;
      if (isCashPayment && needsPayment) {
        content += `\n💵 PAGO PENDIENTE: La reserva está marcada como pago en efectivo. Registrá el cobro al cerrar la sesión.`;
      }

      const notificationPayload = {
        company_id: booking.company_id,
        recipient_id: professionalId,
        profile_type: 'professional',
        type: 'session_end',
        title: isCashPayment && needsPayment ? '🎯 Sesión finalizada — CIERRE + COBRO PENDIENTE' : '🎯 Sesión finalizada — requiere cierre',
        content,
        is_read: false,
        priority: 'high' as const,
        reference_id: booking.id,
        link: `/booking/${booking.id}`,
        metadata: {
          booking_id: booking.id,
          client_id: booking.client_id,
          service_name: serviceName,
          client_name: clientName,
          end_time: booking.end_time,
          action_required: 'confirm_session',
          payment_method: booking.payment_method,
          payment_status: booking.payment_status,
          needs_cash_collection: isCashPayment && needsPayment,
        },
      };

      try {
        // Insert notification
        const { error: notifError } = await supabaseAdmin
          .from('notifications')
          .insert(notificationPayload);

        if (notifError) {
          console.error(`[check-completed-sessions] Failed to insert notification for booking ${booking.id}:`, notifError);
          errors.push(`booking ${booking.id}: ${notifError.message}`);
          continue;
        }

        // Mark booking as notified
        const { error: updateError } = await supabaseAdmin
          .from('bookings')
          .update({ session_end_notified_at: new Date().toISOString() })
          .eq('id', booking.id);

        if (updateError) {
          console.error(`[check-completed-sessions] Failed to update session_end_notified_at for booking ${booking.id}:`, updateError);
          errors.push(`booking ${booking.id} update: ${updateError.message}`);
          continue;
        }

        notified++;
        console.log(`[check-completed-sessions] Notified professional ${professionalId} for booking ${booking.id}`);
      } catch (err: any) {
        console.error(`[check-completed-sessions] Exception for booking ${booking.id}:`, err?.message);
        errors.push(`booking ${booking.id}: ${err?.message}`);
      }
    }

    return jsonSuccess(200, {
      total: bookings.length,
      notified,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('[check-completed-sessions] Unhandled error:', err?.message, err?.stack);
    return jsonError(500, 'Internal server error: ' + err?.message);
  }
});
