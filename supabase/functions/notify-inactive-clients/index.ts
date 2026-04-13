// @ts-nocheck
// Edge Function: notify-inactive-clients
// Purpose: Emails each company owner listing clients auto-deactivated (no bookings in 90 days).
// Triggered by: pg_cron daily at 02:30 UTC via pg_net.http_post with service_role Bearer token.
// Sends via send-branded-email (with SES fallback).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

// Helper: call send-branded-email Edge Function with fallback to direct SES
async function sendBrandedEmail(params: {
  companyId: string;
  emailType: string;
  to: { email: string; name: string }[];
  subject?: string;
  data: Record<string, unknown>;
  supabaseUrl: string;
  serviceRoleKey: string;
  // Fallback params
  fallbackHtml: string;
  fallbackToEmail: string;
  fallbackSubject: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  const { supabaseUrl, serviceRoleKey, companyId, emailType, to, subject, data } = params;

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
    console.warn('[notify-inactive-clients] send-branded-email returned error:', result.error);
    return { success: false, error: result.error };
  } catch (e) {
    console.warn('[notify-inactive-clients] send-branded-email not available, falling back to direct SES');
    return { success: false, error: 'send-branded-email unavailable' };
  }
}

// Fallback direct SES sender
async function sendViaSES(params: {
  html: string;
  to: string;
  subject: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
}): Promise<{ success: boolean; error?: string }> {
  const { html, to, subject, region, accessKeyId, secretAccessKey, fromEmail } = params;
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region });
  const sesEndpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify({
    FromEmailAddress: fromEmail,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    },
  });
  const res = await aws.fetch(sesEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    return { success: false, error: t };
  }
  return { success: true };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // This endpoint is internal-only: caller must present the service role key as Bearer token.
  const authHeader = req.headers.get('authorization') || '';
  const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!token || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') || '';
  const region               = Deno.env.get('AWS_REGION') || '';
  const accessKeyId          = Deno.env.get('AWS_ACCESS_KEY_ID') || '';
  const secretAccessKey      = Deno.env.get('AWS_SECRET_ACCESS_KEY') || '';
  const fromEmail            = (Deno.env.get('SES_FROM_ADDRESS') || '').trim();

  const missingEnvs: string[] = [];
  if (!SUPABASE_URL)      missingEnvs.push('SUPABASE_URL');
  if (!region)            missingEnvs.push('AWS_REGION');
  if (!accessKeyId)       missingEnvs.push('AWS_ACCESS_KEY_ID');
  if (!secretAccessKey)   missingEnvs.push('AWS_SECRET_ACCESS_KEY');
  if (!fromEmail)         missingEnvs.push('SES_FROM_ADDRESS');
  if (missingEnvs.length > 0) {
    return new Response(JSON.stringify({ error: 'Missing env vars', missing: missingEnvs }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Admin client — bypasses RLS to read internal log + users + company_members
    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Fetch unnotified log entries from the last 25 hours
    const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data: logEntries, error: logErr } = await supabase
      .from('client_inactivity_log')
      .select('id, client_id, company_id, client_name, marked_at')
      .is('notified_at', null)
      .gte('marked_at', cutoff);

    if (logErr) throw logErr;
    if (!logEntries || logEntries.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, notified: 0, message: 'No pending entries' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 2. Group by company
    const byCompany = new Map<string, { logIds: string[]; clients: string[] }>();
    for (const entry of logEntries) {
      const cid = entry.company_id as string;
      if (!byCompany.has(cid)) byCompany.set(cid, { logIds: [], clients: [] });
      const g = byCompany.get(cid)!;
      g.logIds.push(entry.id as string);
      g.clients.push((entry.client_name as string | null) || 'Cliente desconocido');
    }

    const companyIds = [...byCompany.keys()];

    // 3. Resolve owner role id (one lookup — same for all companies)
    const { data: roleRow, error: roleErr } = await supabase
      .from('app_roles')
      .select('id')
      .eq('name', 'owner')
      .limit(1)
      .maybeSingle();
    if (roleErr || !roleRow?.id) {
      console.error('[notify-inactive] Could not find owner role:', roleErr?.message);
      return new Response(JSON.stringify({ error: 'Owner role not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const ownerRoleId = roleRow.id as string;

    // 4. Fetch active owner members for all affected companies in one query
    const { data: members, error: membersErr } = await supabase
      .from('company_members')
      .select('company_id, user_id')
      .in('company_id', companyIds)
      .eq('role_id', ownerRoleId)
      .eq('status', 'active');
    if (membersErr) throw membersErr;

    // 5. Resolve user emails for those members
    const userIds = [...new Set((members || []).map((m) => m.user_id as string))];
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', userIds);
    if (usersErr) throw usersErr;

    const userById = new Map((users || []).map((u) => [u.id as string, u]));
    // company_id → first owner user
    const ownerByCompany = new Map(
      (members || []).map((m) => [m.company_id as string, userById.get(m.user_id as string)]),
    );

    // 6. Send one email per company owner via send-branded-email (with SES fallback)
    const sesEndpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;

    const escHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let notifiedCompanies = 0;
    const notifiedLogIds: string[] = [];

    for (const [companyId, { logIds, clients }] of byCompany) {
      const owner = ownerByCompany.get(companyId);
      if (!owner?.email) {
        console.warn(`[notify-inactive] No active owner found for company ${companyId}, skipping.`);
        continue;
      }

      const ownerEmail = String(owner.email).trim();
      const ownerName  = String(owner.name || '').trim();

      const clientListHtml = clients
        .map((n) => `<li style="padding:4px 0">${escHtml(n)}</li>`)
        .join('');

      const clientWord   = clients.length === 1 ? 'cliente' : 'clientes';
      const inactivoWord = clients.length === 1 ? 'inactivo' : 'inactivos';
      const subjectLine  = `${clients.length} ${clientWord} marcado${clients.length > 1 ? 's' : ''} como ${inactivoWord} en Simplifica`;

      const html = `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:600px;margin:0 auto">
          <p>Hola${ownerName ? ' ' + escHtml(ownerName) : ''},</p>
          <p>
            Te informamos que los siguientes <strong>${clients.length} ${clientWord}</strong>
            fueron <strong>marcados como ${inactivoWord} automáticamente</strong>
            porque no registran reservas en los últimos <strong>90 días</strong>:
          </p>
          <ul style="padding-left:20px;margin:16px 0">
            ${clientListHtml}
          </ul>
          <p>Puedes reactivar cualquier cliente desde el módulo de <strong>Clientes</strong> en Simplifica.</p>
          <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:12px">
            Este es un mensaje automático del sistema Simplifica. Si tienes alguna consulta, responde a este email.
          </p>
        </div>
      `;

      // Try send-branded-email first, fall back to direct SES
      let emailSent = false;
      if (companyId && serviceRoleKey) {
        const brandedResult = await sendBrandedEmail({
          companyId,
          emailType: 'inactive_notice',
          to: [{ email: ownerEmail, name: ownerName }],
          subject: subjectLine,
          data: { ownerName, clients, inactiveWord: inactivoWord },
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey,
          fallbackHtml: html,
          fallbackToEmail: ownerEmail,
          fallbackSubject: subjectLine,
          region,
          accessKeyId,
          secretAccessKey,
          fromEmail,
        });

        if (brandedResult.success) {
          emailSent = true;
        } else if (brandedResult.error !== 'send-branded-email unavailable') {
          console.error(`[notify-inactive] Branded email failed for company ${companyId}:`, brandedResult.error);
          // Continue to fallback
        }
      }

      // Fallback to direct SES if branded email not available
      if (!emailSent) {
        const aws = new AwsClient({ accessKeyId, secretAccessKey, region });
        const body = JSON.stringify({
          FromEmailAddress: fromEmail,
          Destination: { ToAddresses: [ownerEmail] },
          Content: {
            Simple: {
              Subject: { Data: subjectLine, Charset: 'UTF-8' },
              Body: { Html: { Data: html, Charset: 'UTF-8' } },
            },
          },
        });

        const res = await aws.fetch(sesEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (res.ok) {
          notifiedCompanies++;
          notifiedLogIds.push(...logIds);
        } else {
          const errText = await res.text().catch(() => '(unreadable)');
          console.error(`[notify-inactive] SES failed for company ${companyId} → ${ownerEmail}:`, errText);
        }
      } else {
        notifiedCompanies++;
        notifiedLogIds.push(...logIds);
      }
    }

    // 7. Mark successfully-notified log entries
    if (notifiedLogIds.length > 0) {
      const { error: updateErr } = await supabase
        .from('client_inactivity_log')
        .update({ notified_at: new Date().toISOString() })
        .in('id', notifiedLogIds);
      if (updateErr) {
        console.error('[notify-inactive] Failed to mark entries as notified:', updateErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        ok:                true,
        notified_companies: notifiedCompanies,
        notified_clients:   notifiedLogIds.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[notify-inactive] Unhandled error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});