/**
 * Edge Function: check-gdpr-deadlines
 *
 * Cron-triggered (every 12 hours via pg_cron):
 * - Finds GDPR access requests where deadline is within 5 days or already passed
 * - Creates in-app notifications for company owner/super_admin
 * - Updates deadline_warning_sent_at / overdue_notification_sent_at to prevent duplicates
 *
 * GDPR Article 12: The controller must respond to access requests within ONE MONTH (30 days).
 *
 * Security: service_role required (internal cron endpoint).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_NAME = 'check-gdpr-deadlines';

function jsonSuccess(status: number, data: unknown) {
  return new Response(JSON.stringify({ success: true, ...data }), {
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

  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const warningThreshold = new Date();
  warningThreshold.setDate(now.getDate() + 5); // 5 days from now

  const WARNING_COLS = `
    id,
    company_id,
    request_type,
    subject_email,
    subject_name,
    deadline_date,
    processing_status,
    verification_status
  `;

  try {
    // ── 1. Find WARNING requests (deadline within 5 days, not yet warned) ──────
    const { data: warningRequests, error: warningError } = await supabase
      .from('gdpr_access_requests')
      .select(WARNING_COLS)
      .not('processing_status', 'eq', 'completed')
      .not('verification_status', 'eq', 'rejected')
      .not('deadline_date', 'is', null)
      .lte('deadline_date', warningThreshold.toISOString())
      .gt('deadline_date', now.toISOString()) // not yet overdue, just warning
      .is('deadline_warning_sent_at', null)
      .limit(100);

    if (warningError) {
      console.error(`[${FUNCTION_NAME}] Error querying warning requests:`, warningError);
      return jsonError(500, 'Error querying warning requests: ' + warningError.message);
    }

    // ── 2. Find OVERDUE requests (deadline passed, not yet notified) ────────────
    const { data: overdueRequests, error: overdueError } = await supabase
      .from('gdpr_access_requests')
      .select(WARNING_COLS)
      .not('processing_status', 'eq', 'completed')
      .not('verification_status', 'eq', 'rejected')
      .not('deadline_date', 'is', null)
      .lt('deadline_date', now.toISOString()) // already passed
      .is('overdue_notification_sent_at', null)
      .limit(100);

    if (overdueError) {
      console.error(`[${FUNCTION_NAME}] Error querying overdue requests:`, overdueError);
      return jsonError(500, 'Error querying overdue requests: ' + overdueError.message);
    }

    if ((!warningRequests || warningRequests.length === 0) && (!overdueRequests || overdueRequests.length === 0)) {
      return jsonSuccess(200, { warned: 0, overdue: 0, message: 'No pending deadline notifications' });
    }

    console.log(`[${FUNCTION_NAME}] Found ${warningRequests?.length ?? 0} warning, ${overdueRequests?.length ?? 0} overdue requests`);

    let warnedCount = 0;
    let overdueCount = 0;
    const errors: string[] = [];

    // ── 3. Notify WARNING requests ─────────────────────────────────────────────
    for (const req of (warningRequests ?? [])) {
      const daysRemaining = Math.ceil(
        (new Date(req.deadline_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const recipients = await findCompanyOwners(supabase, req.company_id);
      if (recipients.length === 0) {
        console.warn(`[${FUNCTION_NAME}] No owner/super_admin found for company ${req.company_id}, skipping request ${req.id}`);
        continue;
      }

      for (const recipientId of recipients) {
        const notifResult = await insertNotification(supabase, {
          company_id: req.company_id,
          recipient_id: recipientId,
          type: 'gdpr_deadline_warning',
          title: '⚠️ Solicitud GDPR vence en días',
          content: `Solicitud ${req.request_type} de ${req.subject_email} vence en ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''}. Revisa y responde antes del plazo legal.`,
          priority: 'high',
          reference_id: req.id,
          link: '/admin/company?tab=gdpr',
          metadata: {
            request_id: req.id,
            request_type: req.request_type,
            subject_email: req.subject_email,
            deadline_date: req.deadline_date,
            days_remaining: daysRemaining,
            urgency: 'warning',
          },
        });

        if (!notifResult.success) {
          errors.push(`request ${req.id} warning notification: ${notifResult.error}`);
        }
      }

      // Mark as warned
      const { error: updateError } = await supabase
        .from('gdpr_access_requests')
        .update({ deadline_warning_sent_at: now.toISOString() })
        .eq('id', req.id);

      if (updateError) {
        console.error(`[${FUNCTION_NAME}] Failed to mark request ${req.id} as warned:`, updateError);
        errors.push(`request ${req.id} mark warned: ${updateError.message}`);
      } else {
        warnedCount++;
        console.log(`[${FUNCTION_NAME}] Warned company ${req.company_id} about request ${req.id} (deadline: ${req.deadline_date})`);
      }
    }

    // ── 4. Notify OVERDUE requests ─────────────────────────────────────────────
    for (const req of (overdueRequests ?? [])) {
      const daysOverdue = Math.ceil(
        (now.getTime() - new Date(req.deadline_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      const recipients = await findCompanyOwners(supabase, req.company_id);
      if (recipients.length === 0) {
        console.warn(`[${FUNCTION_NAME}] No owner/super_admin found for company ${req.company_id}, skipping request ${req.id}`);
        continue;
      }

      for (const recipientId of recipients) {
        const notifResult = await insertNotification(supabase, {
          company_id: req.company_id,
          recipient_id: recipientId,
          type: 'gdpr_deadline_overdue',
          title: '🔴 Solicitud GDPR VENCIDA',
          content: `Solicitud ${req.request_type} de ${req.subject_email} está VENCIDA hace ${daysOverdue} día${daysOverdue !== 1 ? 's' : ''}. Notifica al responsable de protección de datos inmediatamente.`,
          priority: 'critical',
          reference_id: req.id,
          link: '/admin/company?tab=gdpr',
          metadata: {
            request_id: req.id,
            request_type: req.request_type,
            subject_email: req.subject_email,
            deadline_date: req.deadline_date,
            days_overdue: daysOverdue,
            urgency: 'overdue',
            action_required: 'escalate',
          },
        });

        if (!notifResult.success) {
          errors.push(`request ${req.id} overdue notification: ${notifResult.error}`);
        }
      }

      // Mark as overdue-notified
      const { error: updateError } = await supabase
        .from('gdpr_access_requests')
        .update({ overdue_notification_sent_at: now.toISOString() })
        .eq('id', req.id);

      if (updateError) {
        console.error(`[${FUNCTION_NAME}] Failed to mark request ${req.id} as overdue-notified:`, updateError);
        errors.push(`request ${req.id} mark overdue: ${updateError.message}`);
      } else {
        overdueCount++;
        console.log(`[${FUNCTION_NAME}] Notified overdue for company ${req.company_id} about request ${req.id} (deadline: ${req.deadline_date})`);
      }
    }

    return jsonSuccess(200, {
      warned: warnedCount,
      overdue: overdueCount,
      total: (warningRequests?.length ?? 0) + (overdueRequests?.length ?? 0),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error(`[${FUNCTION_NAME}] Unhandled error:`, err?.message, err?.stack);
    return jsonError(500, 'Internal server error: ' + err?.message);
  }
});

/**
 * Find owner/super_admin user IDs for a given company.
 * Returns array of user auth_user_ids.
 */
async function findCompanyOwners(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<string[]> {
  // Join users with app_roles to find owner or super_admin
  const { data, error } = await supabase
    .from('users')
    .select('auth_user_id')
    .eq('company_id', companyId)
    .eq('active', true)
    .not('auth_user_id', 'is', null);

  if (error || !data || data.length === 0) return [];

  // Filter to owner/super_admin via app_roles
  const userIds = data.map((u: any) => u.auth_user_id).filter(Boolean);

  if (userIds.length === 0) return [];

  // Get app_role names for these users
  const { data: roleData, error: roleError } = await supabase
    .from('users')
    .select('id, auth_user_id, app_roles!inner(name)')
    .in('auth_user_id', userIds)
    .eq('company_id', companyId);

  if (roleError || !roleData) {
    // Fallback: return any active user in the company
    return userIds.slice(0, 1);
  }

  return roleData
    .filter((u: any) => {
      const roleName = u.app_roles?.name;
      return roleName === 'owner' || roleName === 'super_admin';
    })
    .map((u: any) => u.auth_user_id)
    .filter(Boolean);
}

/**
 * Insert a notification into the notifications table.
 */
async function insertNotification(
  supabase: ReturnType<typeof createClient>,
  payload: {
    company_id: string;
    recipient_id: string;
    type: string;
    title: string;
    content: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    reference_id: string;
    link: string;
    metadata: Record<string, unknown>;
  },
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('notifications').insert({
    company_id: payload.company_id,
    recipient_id: payload.recipient_id,
    profile_type: 'owner', // GDPR deadlines are owner-level alerts
    type: payload.type,
    title: payload.title,
    content: payload.content,
    is_read: false,
    reference_id: payload.reference_id,
    link: payload.link,
    metadata: { ...payload.metadata, priority: payload.priority },
  });

  if (error) {
    console.error(`[check-gdpr-deadlines] Failed to insert notification:`, error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
