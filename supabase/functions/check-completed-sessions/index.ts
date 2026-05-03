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
 * Security: service_role required (internal cron endpoint).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DURATION_JSON = Deno.env.get('SUPABASE_URL') ? '' : ''; // unused

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
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed. Use POST.');
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  // Internal auth: require service role key as Bearer token
  const authHeader = req.headers.get('Authorization') || '';
  const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token || token !== serviceRoleKey) {
    return jsonError(401, 'Unauthorized: valid service role key required');
  }

  try {
    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // ── 1. Find completed-but-unnotified bookings ─────────────────────────────
    // We query confirmed bookings where end_time has passed and we haven't notified yet.
    // Uses service role to bypass RLS (needed to read bookings across companies).
    const { data: bookings, error: bookingsError } = await supabase
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
        session_end_notified_at,
        services:service_id ( name ),
        clients:client_id ( name, email )
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
      const professionalId = booking.professional_id as string | null;
      const clientName = (booking.clients as any)?.name || 'Cliente';
      const serviceName = (booking.services as any)?.name || 'Servicio';

      if (!professionalId) {
        console.warn(`[check-completed-sessions] Booking ${booking.id} has no professional_id, skipping`);
        continue;
      }

      const notificationPayload = {
        company_id: booking.company_id,
        recipient_id: professionalId,
        profile_type: 'professional', // Session completion is a professional-level notification
        type: 'session_end',
        title: '🎯 Sesión finalizada — requiere cierre',
        content: `La sesión de ${serviceName} con ${clientName} ha finalizado. Confirma los detalles, registra el pago y cierra la sesión.`,
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
        },
      };

      try {
        // Insert notification
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notificationPayload);

        if (notifError) {
          console.error(`[check-completed-sessions] Failed to insert notification for booking ${booking.id}:`, notifError);
          errors.push(`booking ${booking.id}: ${notifError.message}`);
          continue;
        }

        // Mark booking as notified
        const { error: updateError } = await supabase
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
