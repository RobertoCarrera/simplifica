// security-anomaly-alerts/index.ts
// F3-8: Edge Function that reads unalerted anomalies from gdpr_anomalies,
// sends email notifications to the company admin/DPO, and marks them as sent.
// Called by pg_cron every 30 min via net.http_post() OR as a direct invocation.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

// Only callable internally (no public CORS)
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

// AWS SES config (same as send-email function)
const AWS_ACCESS_KEY_ID     = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const AWS_REGION            = Deno.env.get("AWS_SES_REGION") ?? "eu-west-1";
const SES_FROM_EMAIL        = Deno.env.get("SES_FROM_EMAIL") ?? "no-reply@simplificacrm.es";
// Fallback security alert email if no DPO configured
const SECURITY_ALERT_EMAIL  = Deno.env.get("SECURITY_ALERT_EMAIL") ?? "";

// Batch size — max anomalies to process per invocation
const BATCH = 50;

type Anomaly = {
  id: string;
  company_id: string | null;
  anomaly_type: string;
  severity: string;
  user_id: string | null;
  description: string;
  evidence: Record<string, unknown> | null;
  created_at: string;
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🚨",
  high:     "⚠️",
  medium:   "⚡",
  low:      "ℹ️",
};

function buildEmailBody(anomalies: Anomaly[]): { subject: string; html: string; text: string } {
  const critical = anomalies.filter(a => a.severity === "critical").length;
  const high     = anomalies.filter(a => a.severity === "high").length;

  const subject = critical > 0
    ? `🚨 ALERTA CRÍTICA DE SEGURIDAD — ${critical} amenaza(s) en Simplifica CRM`
    : `⚠️ Aviso de seguridad — ${anomalies.length} anomalía(s) detectada(s) en Simplifica CRM`;

  const rows = anomalies.map(a => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd">${SEVERITY_EMOJI[a.severity] ?? ""} ${a.severity.toUpperCase()}</td>
      <td style="padding:8px;border:1px solid #ddd">${a.anomaly_type}</td>
      <td style="padding:8px;border:1px solid #ddd">${a.description}</td>
      <td style="padding:8px;border:1px solid #ddd;font-size:12px">${new Date(a.created_at).toISOString()}</td>
    </tr>`).join("");

  const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;color:#333">
<h2 style="color:#c00">Alerta de Seguridad — Simplifica CRM</h2>
<p>Se han detectado <strong>${anomalies.length} anomalía(s)</strong> en el sistema.
Por favor revísalas en el panel de administración.</p>
<table style="border-collapse:collapse;width:100%">
  <thead>
    <tr style="background:#f0f0f0">
      <th style="padding:8px;border:1px solid #ddd">Severidad</th>
      <th style="padding:8px;border:1px solid #ddd">Tipo</th>
      <th style="padding:8px;border:1px solid #ddd">Descripción</th>
      <th style="padding:8px;border:1px solid #ddd">Detectada</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p style="margin-top:24px;font-size:12px;color:#888">
  Este es un mensaje automático del sistema de cumplimiento RGPD de Simplifica CRM.<br>
  No respondas a este correo.
</p>
</body></html>`;

  const text = anomalies.map(a =>
    `[${a.severity.toUpperCase()}] ${a.anomaly_type}: ${a.description} (${a.created_at})`
  ).join("\n");

  return { subject, html, text };
}

async function sendAlertEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error("[security-anomaly-alerts] AWS SES not configured, skipping email");
    return;
  }

  const aws = new AwsClient({ accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY });

  const message = new URLSearchParams({
    Action:                        "SendEmail",
    Version:                       "2010-12-01",
    "Source":                       `Simplifica CRM Security <${SES_FROM_EMAIL}>`,
    "Destination.ToAddresses.member.1": to,
    "Message.Subject.Data":         subject,
    "Message.Subject.Charset":      "UTF-8",
    "Message.Body.Text.Data":       text,
    "Message.Body.Text.Charset":    "UTF-8",
    "Message.Body.Html.Data":       html,
    "Message.Body.Html.Charset":    "UTF-8",
  });

  const resp = await aws.fetch(
    `https://email.${AWS_REGION}.amazonaws.com/`,
    { method: "POST", body: message.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`SES error ${resp.status}: ${body}`);
  }
}

serve(async (req) => {
  // Only allow internal calls (pg_cron webhook or authenticated service role)
  const authHeader = req.headers.get("authorization") ?? "";
  const isServiceRole = authHeader.startsWith("Bearer ") &&
    authHeader.slice(7) === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const isInternal = INTERNAL_SECRET &&
    req.headers.get("x-internal-secret") === INTERNAL_SECRET;

  if (!isServiceRole && !isInternal) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 1. Fetch unalerted anomalies (high + critical first)
  const { data: anomalies, error: fetchErr } = await supabase
    .from("gdpr_anomalies")
    .select("*")
    .eq("alert_sent", false)
    .eq("resolved", false)
    .in("severity", ["critical", "high", "medium"])
    .order("severity", { ascending: true })   // critical first (c < h < m alphabetically)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (fetchErr) {
    console.error("[security-anomaly-alerts] fetch error:", fetchErr.message);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  if (!anomalies || anomalies.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // 2. Group by company
  const byCompany = new Map<string | null, Anomaly[]>();
  for (const a of anomalies as Anomaly[]) {
    const key = a.company_id ?? "__global__";
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(a);
  }

  let totalSent = 0;
  const alertedIds: string[] = [];

  for (const [companyKey, compAnomalies] of byCompany) {
    // Resolve alert email: company DPO > company admin email > fallback
    let alertEmail = SECURITY_ALERT_EMAIL;

    if (companyKey !== "__global__") {
      const { data: company } = await supabase
        .from("companies")
        .select("email, settings")
        .eq("id", companyKey)
        .single();

      if (company) {
        const dpo = (company.settings as Record<string, unknown>)?.dpo_email;
        alertEmail = (typeof dpo === "string" && dpo) ? dpo : (company.email ?? alertEmail);
      }
    }

    if (!alertEmail) {
      console.warn(`[security-anomaly-alerts] No alert email for company ${companyKey}, skipping`);
      continue;
    }

    // Sort: critical > high > medium for display
    const sorted = [...compAnomalies].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.severity as keyof typeof order] ?? 9) - (order[b.severity as keyof typeof order] ?? 9);
    });

    const { subject, html, text } = buildEmailBody(sorted);

    try {
      await sendAlertEmail(alertEmail, subject, html, text);
      for (const a of compAnomalies) alertedIds.push(a.id);
      totalSent++;
    } catch (err) {
      console.error(`[security-anomaly-alerts] email error for company ${companyKey}:`, err);
    }
  }

  // 3. Mark as alert_sent
  if (alertedIds.length > 0) {
    await supabase
      .from("gdpr_anomalies")
      .update({ alert_sent: true, alert_sent_at: new Date().toISOString() })
      .in("id", alertedIds);
  }

  return new Response(
    JSON.stringify({ sent: totalSent, anomalies_alerted: alertedIds.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
