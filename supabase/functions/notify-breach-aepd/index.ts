// Edge Function: notify-breach-aepd
// Purpose: When a GDPR breach incident is created or escalated to high/critical severity,
//          this function creates an in-app notification for the company owner to remind
//          them of the 72-hour AEPD notification obligation (GDPR Article 33).
//
// Trigger: Called from GdprComplianceService.reportBreachIncident() AFTER inserting
//          a breach incident with severity 'high' or 'critical'.
//
// AEPD External Notification: Must be done manually via sede.aepd.gob.es
//          This function only creates the in-app reminder.
//
// NOTE: This function does NOT perform external AEPD notification (email/webhook).
//       The company owner must do that manually at https://sede.aepd.gob.es

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BreachNotificationPayload {
  incidentId: string;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Auth: require service role key (internal-only endpoint)
  const authHeader = req.headers.get('authorization') || '';
  const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!token || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  if (!SUPABASE_URL) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let payload: BreachNotificationPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { incidentId } = payload;
  if (!incidentId) {
    return new Response(JSON.stringify({ error: 'incidentId is required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Admin client to bypass RLS
  const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Fetch the breach incident
    const { data: incident, error: incidentErr } = await supabase
      .from('gdpr_breach_incidents')
      .select('id, company_id, incident_reference, breach_type, discovered_at, severity_level, resolution_status, aepd_notified_at')
      .eq('id', incidentId)
      .maybeSingle();

    if (incidentErr) throw incidentErr;
    if (!incident) {
      return new Response(JSON.stringify({ error: 'Breach incident not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const companyId = incident.company_id as string;

    // 2. Only notify for high/critical severity
    if (incident.severity_level !== 'high' && incident.severity_level !== 'critical') {
      return new Response(JSON.stringify({ ok: true, message: 'Severity not high/critical — no notification created' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Skip if already notified
    if (incident.aepd_notified_at) {
      return new Response(JSON.stringify({ ok: true, message: 'Already notified — skipping' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 4. Find owner(s) of the company
    const { data: ownerRole, error: roleErr } = await supabase
      .from('app_roles')
      .select('id')
      .eq('name', 'owner')
      .limit(1)
      .maybeSingle();

    if (roleErr) throw roleErr;

    let ownerUserIds: string[] = [];
    if (ownerRole?.id) {
      const { data: members, error: membersErr } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', companyId)
        .eq('role_id', ownerRole.id)
        .eq('status', 'active');
      if (membersErr) throw membersErr;
      ownerUserIds = (members || []).map((m: any) => m.user_id as string);
    }

    // If no owner found, fallback to super_admin
    if (ownerUserIds.length === 0) {
      const { data: superAdminRole } = await supabase
        .from('app_roles')
        .select('id')
        .eq('name', 'super_admin')
        .limit(1)
        .maybeSingle();

      if (superAdminRole?.id) {
        const { data: admins } = await supabase
          .from('company_members')
          .select('user_id')
          .eq('company_id', companyId)
          .eq('role_id', superAdminRole.id)
          .eq('status', 'active');
        ownerUserIds = (admins || []).map((m: any) => m.user_id as string);
      }
    }

    if (ownerUserIds.length === 0) {
      console.warn(`[notify-breach-aepd] No owners/admins found for company ${companyId}`);
      return new Response(JSON.stringify({ error: 'No owners/admins found for company' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 5. Format breach type for display
    const breachTypeLabels: Record<string, string> = {
      confidentiality: 'confidencialidad',
      integrity: 'integridad',
      availability: 'disponibilidad',
    };
    const breachTypeDisplay = (Array.isArray(incident.breach_type) ? incident.breach_type : [incident.breach_type])
      .map((t: string) => breachTypeLabels[t] || t)
      .join(', ');

    const discoveredDate = new Date(incident.discovered_at).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const deadlineDate = new Date(new Date(incident.discovered_at).getTime() + 72 * 60 * 60 * 1000)
      .toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    const severityLabel = incident.severity_level === 'critical' ? 'CRÍTICA' : 'ALTA';

    // 6. Create in-app notifications for all owners
    const now = new Date().toISOString();
    const notificationsToInsert = ownerUserIds.map((userId: string) => ({
      recipient_id: userId,
      company_id: companyId,
      type: 'gdpr_breach_aepd',
      title: '🚨 Brecha de datos — Notificación AEPD obligatoria',
      content: `Se ha registrado una brecha de datos de ${severityLabel} gravedad [${breachTypeDisplay}] el ${discoveredDate}. Tiene hasta el ${deadlineDate} para notificar a la AEPD. Acceda al panel de incidencias para más detalles.`,
      reference_id: incident.id,
      metadata: {
        incident_reference: incident.incident_reference,
        breach_type: incident.breach_type,
        severity_level: incident.severity_level,
        discovered_at: incident.discovered_at,
        deadline_72h: deadlineDate,
        aepd_portal_url: 'https://sede.aepd.gob.es',
        resolution_status: incident.resolution_status,
      },
      priority: 'critical',
      is_read: false,
      created_at: now,
    }));

    const { error: notifyErr } = await supabase
      .from('notifications')
      .insert(notificationsToInsert);

    if (notifyErr) {
      console.error('[notify-breach-aepd] Error inserting notifications:', notifyErr);
      throw notifyErr;
    }

    // 7. Update incident: mark as notified
    const { error: updateErr } = await supabase
      .from('gdpr_breach_incidents')
      .update({ aepd_notified_at: now })
      .eq('id', incidentId);

    if (updateErr) {
      console.error('[notify-breach-aepd] Error updating aepd_notified_at:', updateErr);
      throw updateErr;
    }

    return new Response(JSON.stringify({
      ok: true,
      notified_owners: ownerUserIds.length,
      incident_id: incidentId,
      aepd_notified_at: now,
      message: `Notification created for ${ownerUserIds.length} owner(s). AEPD notification deadline: ${deadlineDate}`,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[notify-breach-aepd] Unhandled error:', error?.message, error?.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      detail: error?.message,
    }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
