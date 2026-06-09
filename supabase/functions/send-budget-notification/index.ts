// @ts-nocheck
// ================================================================
// Edge Function: send-budget-notification
// ================================================================
// Sends a SINGLE presupuesto (recurring_budgets) notification:
//   - in-app notification (via write_inapp_budget_reminder RPC)
//   - branded email (via send-branded-email with the right email_type)
//
// Two entry points:
//   1) Trigger-driven (kind=created): fired by the AFTER INSERT trigger
//      on recurring_budgets via dispatch_send_budget_notification. The
//      trigger only passes { kind, budget_id }.
//   2) Cron-driven (kind=reminder|overdue): fired by the daily cron
//      send-budget-reminders → dispatch_due_budget_notifications →
//      dispatch_send_budget_notification. The cron also passes
//      day_offset (negative for reminder, positive for overdue).
//
// Auth: service_role Bearer token (verify_jwt = false in config.toml).
// Internal-only — never expose to end-users directly.
// ================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ── Env ──────────────────────────────────────────────────────── */
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/* ── CORS ─────────────────────────────────────────────────────── */
function getCorsHeaders(_req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(new Request('http://x/')), 'Content-Type': 'application/json' },
  });
}

/* ── Auth guard ───────────────────────────────────────────────── */
function assertServiceRole(req: Request): Response | null {
  const authHeader = req.headers.get('Authorization') || '';
  const token      = authHeader.replace('Bearer ', '');
  if (token !== SERVICE_ROLE_KEY) {
    return jsonResponse(401, { error: 'Unauthorized — service role required' });
  }
  return null;
}

/* ── Helpers ──────────────────────────────────────────────────── */
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MONTHS_CA = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
];

function formatDateEs(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} de ${MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function formatDateCa(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} de ${MONTHS_CA[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function formatDateEn(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function formatPeriodLabel(period: string, recurrenceType: string, locale: string): string {
  if (recurrenceType === 'weekly') {
    return locale === 'en' ? `Week ${period}` : `Semana ${period}`;
  }
  if (recurrenceType === 'yearly') {
    return locale === 'en' ? `Year ${period}` : `Año ${period}`;
  }
  // monthly — period is YYYY-MM
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return period;
  if (locale === 'ca') {
    return `${MONTHS_CA[monthIdx]} ${m[1]}`;
  }
  if (locale === 'en') {
    const enMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${enMonths[monthIdx]} ${m[1]}`;
  }
  return `${MONTHS_ES[monthIdx].charAt(0).toUpperCase()}${MONTHS_ES[monthIdx].slice(1)} ${m[1]}`;
}

function formatMoney(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  if (Number.isNaN(n)) return '0,00';
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ' + (currency || 'EUR');
}

/* ── Localization strings ─────────────────────────────────────── */
const I18N = {
  es: {
    created: {
      subject: (period: string, total: string) => `Nuevo presupuesto ${period} — ${total}`,
      title:   'Nuevo presupuesto disponible',
      intro:   (period: string) => `Ya está disponible tu presupuesto correspondiente a ${period}.`,
      cta:     'Ver presupuesto',
      footer:  'Gracias por tu confianza.',
    },
    reminder: {
      subject: (days: number) => `Tu presupuesto vence en ${days} día${days === 1 ? '' : 's'}`,
      title:   (days: number) => `Vence en ${days} día${days === 1 ? '' : 's'}`,
      intro:   (dueDate: string) => `Tu presupuesto vence el ${dueDate}.`,
      cta:     'Pagar ahora',
      footer:  'Si ya has realizado el pago, puedes ignorar este mensaje.',
    },
    overdue: {
      subject: (days: number) => `Presupuesto vencido${days > 0 ? ` hace ${days} día${days === 1 ? '' : 's'}` : ''}`,
      title:   (days: number) => days > 0 ? `Vencido hace ${days} día${days === 1 ? '' : 's'}` : 'Vencido hoy',
      intro:   (dueDate: string) => `Tu presupuesto venció el ${dueDate} y aún no hemos recibido el pago.`,
      cta:     'Pagar ahora',
      footer:  'Si ya has realizado el pago, puedes ignorar este mensaje.',
    },
  },
  ca: {
    created: {
      subject: (period: string, total: string) => `Nou pressupost ${period} — ${total}`,
      title:   'Nou pressupost disponible',
      intro:   (period: string) => `Ja està disponible el teu pressupost corresponent a ${period}.`,
      cta:     'Veure pressupost',
      footer:  'Gràcies per la teva confiança.',
    },
    reminder: {
      subject: (days: number) => `El teu pressupost venç en ${days} dia${days === 1 ? '' : 's'}`,
      title:   (days: number) => `Venç en ${days} dia${days === 1 ? '' : 's'}`,
      intro:   (dueDate: string) => `El teu pressupost venç el ${dueDate}.`,
      cta:     'Pagar ara',
      footer:  'Si ja has realitzat el pagament, pots ignorar aquest missatge.',
    },
    overdue: {
      subject: (days: number) => `Pressupost vençut${days > 0 ? ` fa ${days} dia${days === 1 ? '' : 's'}` : ''}`,
      title:   (days: number) => days > 0 ? `Vençut fa ${days} dia${days === 1 ? '' : 's'}` : 'Venç avui',
      intro:   (dueDate: string) => `El teu pressupost va vencer el ${dueDate} i encara no hem rebut el pagament.`,
      cta:     'Pagar ara',
      footer:  'Si ja has realitzat el pagament, pots ignorar aquest missatge.',
    },
  },
  en: {
    created: {
      subject: (period: string, total: string) => `New budget ${period} — ${total}`,
      title:   'New budget available',
      intro:   (period: string) => `Your budget for ${period} is now available.`,
      cta:     'View budget',
      footer:  'Thanks for your trust.',
    },
    reminder: {
      subject: (days: number) => `Your budget is due in ${days} day${days === 1 ? '' : 's'}`,
      title:   (days: number) => `Due in ${days} day${days === 1 ? '' : 's'}`,
      intro:   (dueDate: string) => `Your budget is due on ${dueDate}.`,
      cta:     'Pay now',
      footer:  'If you have already paid, you can ignore this message.',
    },
    overdue: {
      subject: (days: number) => `Budget overdue${days > 0 ? ` by ${days} day${days === 1 ? '' : 's'}` : ''}`,
      title:   (days: number) => days > 0 ? `Overdue by ${days} day${days === 1 ? '' : 's'}` : 'Due today',
      intro:   (dueDate: string) => `Your budget was due on ${dueDate} and we have not yet received payment.`,
      cta:     'Pay now',
      footer:  'If you have already paid, you can ignore this message.',
    },
  },
} as const;

type Locale = 'es' | 'ca' | 'en';

function t(locale: Locale) {
  return I18N[locale] || I18N.es;
}

/* ── Main handler ─────────────────────────────────────────────── */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const authError = assertServiceRole(req);
  if (authError) return authError;

  let body: { kind?: string; budget_id?: string; day_offset?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const kind = (body.kind || '').toLowerCase();
  const budgetId = body.budget_id;
  const dayOffset = typeof body.day_offset === 'number' ? body.day_offset : null;

  if (!['created', 'reminder', 'overdue'].includes(kind)) {
    return jsonResponse(400, { error: 'kind must be one of: created, reminder, overdue' });
  }
  if (!budgetId) {
    return jsonResponse(400, { error: 'budget_id is required' });
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Load the budget + client + company ─────────────────────
  const { data: budget, error: budgetErr } = await serviceClient
    .from('recurring_budgets')
    .select(`
      id, company_id, client_id, period, recurrence_type, total, currency,
      due_date, issue_date, status, payment_status,
      clients!inner(id, name, email, company_id),
      companies!inner(id, name)
    `)
    .eq('id', budgetId)
    .single();

  if (budgetErr || !budget) {
    console.error('[send-budget-notification] budget not found:', budgetErr?.message);
    return jsonResponse(404, { error: 'Budget not found', details: budgetErr?.message });
  }

  // ── Idempotency guard (re-check; the trigger also guards) ──
  const logQuery = serviceClient
    .from('budget_notification_log')
    .select('id')
    .eq('budget_id', budgetId)
    .eq('kind', kind);
  const { data: existing, error: existingErr } = dayOffset === null
    ? await logQuery.is('day_offset', null)
    : await logQuery.eq('day_offset', dayOffset);

  if (existingErr) {
    console.error('[send-budget-notification] log query error:', existingErr.message);
  }
  if (existing && existing.length > 0) {
    return jsonResponse(200, {
      success: true,
      skipped: true,
      reason: 'already-notified',
      budget_id: budgetId,
      kind,
      day_offset: dayOffset,
    });
  }

  // ── Load settings ──────────────────────────────────────────
  const { data: settings } = await serviceClient
    .from('budget_notification_settings')
    .select('*')
    .eq('company_id', budget.company_id)
    .single();

  const locale: Locale = (settings?.locale === 'ca' || settings?.locale === 'en')
    ? settings.locale
    : 'es';
  const strings = t(locale);

  // Skip if the master switch is off
  if (settings && settings.email_enabled === false) {
    return jsonResponse(200, {
      success: true,
      skipped: true,
      reason: 'email_enabled=false in settings',
      budget_id: budgetId,
      kind,
    });
  }

  const client = (budget as any).clients;
  const company = (budget as any).companies;
  const clientEmail = client?.email;
  const clientName = client?.name || 'Cliente';
  const total = formatMoney(budget.total, budget.currency);
  const dueDate = (() => {
    if (!budget.due_date) return '';
    if (locale === 'en') return formatDateEn(budget.due_date);
    if (locale === 'ca') return formatDateCa(budget.due_date);
    return formatDateEs(budget.due_date);
  })();
  const periodLabel = formatPeriodLabel(budget.period, budget.recurrence_type, locale);

  // ── Build the email subject + in-app title/content ─────────
  let subject = '';
  let inAppTitle = '';
  let inAppContent = '';
  let emailType: 'budget_created' | 'budget_reminder' | 'budget_overdue' =
    kind === 'created' ? 'budget_created'
    : kind === 'reminder' ? 'budget_reminder'
    : 'budget_overdue';

  if (kind === 'created') {
    subject = strings.created.subject(periodLabel, total);
    inAppTitle = strings.created.title;
    inAppContent = `${clientName}, ${strings.created.intro(periodLabel)} Total: ${total}.`;
  } else if (kind === 'reminder') {
    const days = Math.abs(dayOffset ?? 0);
    subject = strings.reminder.subject(days);
    inAppTitle = strings.reminder.title(days);
    inAppContent = `${clientName}, ${strings.reminder.intro(dueDate)} Total: ${total}.`;
  } else { // overdue
    const days = Math.abs(dayOffset ?? 0);
    subject = strings.overdue.subject(days);
    inAppTitle = strings.overdue.title(days);
    inAppContent = `${clientName}, ${strings.overdue.intro(dueDate)} Total: ${total}.`;
  }

  // ── In-app notification (via RPC) ──────────────────────────
  let inappResult = { ok: false, error: null as string | null };
  try {
    const { error: rpcErr } = await serviceClient.rpc('write_inapp_budget_reminder', {
      p_budget_id: budget.id,
      p_kind: kind,
      p_day_offset: dayOffset,
      p_title: inAppTitle,
      p_content: inAppContent,
      p_link: `/portal/presupuestos/${budget.id}`,
      p_metadata: {
        budget_id: budget.id,
        period: budget.period,
        total: budget.total,
        currency: budget.currency,
        due_date: budget.due_date,
        recurrence_type: budget.recurrence_type,
        kind,
        day_offset: dayOffset,
      },
    });
    if (rpcErr) {
      inappResult = { ok: false, error: rpcErr.message };
      console.error('[send-budget-notification] in-app RPC error:', rpcErr.message);
    } else {
      inappResult = { ok: true, error: null };
    }
  } catch (e) {
    inappResult = { ok: false, error: (e as Error).message };
    console.error('[send-budget-notification] in-app exception:', e);
  }

  // ── Branded email (via send-branded-email) ─────────────────
  let emailResult = { ok: false, error: null as string | null };
  if (clientEmail) {
    try {
      // The public payment page URL — if a token is set, link directly
      // to it; otherwise link to the portal budget list.
      const portalBase = Deno.env.get('PORTAL_BASE_URL') || 'https://app.simplificacrm.es';
      const budgetUrl = (budget as any).payment_link_token
        ? `${portalBase}/pagar-presupuesto/${(budget as any).payment_link_token}`
        : `${portalBase}/portal/presupuestos/${budget.id}`;

      const functionsBase = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
      const emailResp = await fetch(`${functionsBase}/send-branded-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          companyId: budget.company_id,
          emailType,
          subject,
          to: [{ email: clientEmail, name: clientName }],
          data: {
            company_name: company.name,
            client_name: clientName,
            period: budget.period,
            period_label: periodLabel,
            total: budget.total,
            currency: budget.currency || 'EUR',
            total_formatted: total,
            due_date: budget.due_date,
            due_date_formatted: dueDate,
            days_to_due: budget.due_date
              ? Math.ceil((new Date(budget.due_date).getTime() - Date.now()) / 86400000)
              : null,
            budget_id: budget.id,
            payment_url: budgetUrl,
            cta_text: kind === 'created' ? strings.created.cta : strings.reminder.cta,
            intro: kind === 'created'
              ? strings.created.intro(periodLabel)
              : kind === 'reminder'
                ? strings.reminder.intro(dueDate)
                : strings.overdue.intro(dueDate),
            footer_text: kind === 'created' ? strings.created.footer : strings.reminder.footer,
            kind,
            day_offset: dayOffset,
            locale,
          },
        }),
      });
      const emailBody = await emailResp.json();
      if (!emailResp.ok || !emailBody.success) {
        emailResult = { ok: false, error: emailBody.error || `HTTP ${emailResp.status}` };
        console.error('[send-budget-notification] branded email error:', emailResult.error);
      } else {
        emailResult = { ok: true, error: null };
      }
    } catch (e) {
      emailResult = { ok: false, error: (e as Error).message };
      console.error('[send-budget-notification] branded email exception:', e);
    }
  } else {
    emailResult = { ok: false, error: 'client has no email on file' };
  }

  // ── Idempotency log ────────────────────────────────────────
  // (write_inapp_budget_reminder already inserts; we only write a separate
  //  log row if the in-app was disabled but the email succeeded, so the
  //  cron does not re-fire on the same day.)
  if (!inappResult.ok && emailResult.ok) {
    try {
      await serviceClient.from('budget_notification_log').insert({
        budget_id: budget.id,
        company_id: budget.company_id,
        kind,
        day_offset: dayOffset,
        channels: { inapp: false, email: true },
      });
    } catch (e) {
      console.warn('[send-budget-notification] duplicate log insert (already logged) — fine');
    }
  }

  const anyOk = inappResult.ok || emailResult.ok;
  return jsonResponse(anyOk ? 200 : 500, {
    success: anyOk,
    budget_id: budget.id,
    kind,
    day_offset: dayOffset,
    inapp: inappResult,
    email: emailResult,
  });
});
