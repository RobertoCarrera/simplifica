// @ts-nocheck
// ==============================================
// Edge Function: budget-receipt-pdf
// ==============================================
// Generates the PDF receipt (recibo) for a paid recurring budget. The
// receipt shows the company + client info, the line items that were
// invoiced, the total paid, the date of payment, and the provider
// (stripe / paypal / cash / bank_transfer) used.
//
// It is the receipt the client downloads from the public payment page
// (or from the portal) to keep for their records.
//
// GET /budget-receipt-pdf?payment_id=<uuid>      (preferred — single payment)
// GET /budget-receipt-pdf?budget_id=<uuid>       (all payments of a budget)
// Auth: Bearer (only members of the budget's company can generate)
// ==============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import pdfMake from 'https://esm.sh/pdfmake@0.2.10/build/pdfmake.js';
import pdfFonts from 'https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js';
pdfMake.vfs = pdfFonts.pdfMake.vfs;

import { corsHeaders as sharedCorsHeaders, originAllowed } from '../quotes-pdf/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';

function cors(origin?: string) {
  return sharedCorsHeaders(origin, 'GET, OPTIONS');
}

function money(v: number | null | undefined, currency = 'EUR') {
  const n = typeof v === 'number' ? v : 0;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n);
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(d);
  }
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return String(d);
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Tarjeta (Stripe)',
  paypal: 'PayPal',
  cash: 'Efectivo',
  bank_transfer: 'Transferencia bancaria',
  other: 'Otro',
};

function generateReceiptPdf(ctx: {
  budget: any;
  lines: any[];
  payments: any[];
  client: any;
  company: any;
  companySettings: any;
}) {
  const { budget, lines, payments, client, company, companySettings } = ctx;
  const currency = budget.currency || 'EUR';
  const PRIMARY = '#3366CC';
  const ACCENT = '#2E8B57';
  const LIGHT_GRAY = '#F5F5F7';
  const TEXT_DARK = '#262626';
  const TEXT_LIGHT = '#737373';

  // ── Emitter (company) info ──────────────────────────────────────────────
  const emitterInfo: any[] = [];
  if (company?.name) emitterInfo.push({ text: company.name, bold: true, fontSize: 11, margin: [0, 0, 0, 4] });
  const taxId = companySettings?.cif || companySettings?.nif || companySettings?.tax_id;
  if (taxId) emitterInfo.push({ text: `NIF/CIF: ${taxId}`, fontSize: 9, color: TEXT_LIGHT });
  if (companySettings?.fiscal_address) {
    emitterInfo.push({ text: String(companySettings.fiscal_address), fontSize: 8, color: TEXT_LIGHT });
  }
  if (companySettings?.phone) {
    emitterInfo.push({ text: `Tel: ${companySettings.phone}`, fontSize: 8, color: TEXT_LIGHT });
  }
  if (companySettings?.email) {
    emitterInfo.push({ text: companySettings.email, fontSize: 8, color: TEXT_LIGHT });
  }

  // ── Client info ─────────────────────────────────────────────────────────
  const clientInfo: any[] = [];
  if (client?.name) clientInfo.push({ text: client.name, bold: true, fontSize: 11, margin: [0, 0, 0, 4] });
  const cTax = client?.tax_id || client?.dni || client?.cif;
  if (cTax) clientInfo.push({ text: `DNI/CIF: ${cTax}`, fontSize: 9, color: TEXT_LIGHT });
  const cAddr = client?.address?.line1 || client?.address?.street || client?.address_text;
  if (cAddr) clientInfo.push({ text: String(cAddr), fontSize: 8, color: TEXT_LIGHT });
  if (client?.phone) clientInfo.push({ text: `Tel: ${client.phone}`, fontSize: 8, color: TEXT_LIGHT });
  if (client?.email) clientInfo.push({ text: client.email, fontSize: 8, color: TEXT_LIGHT });

  // ── Receipt number (deterministic from budget + payment) ───────────────
  const firstPayment = payments[0] || {};
  const periodLabel = budget.period;
  const receiptNumber = `R-${periodLabel}-${String(budget.id).slice(0, 8).toUpperCase()}`;

  // ── Line items table ───────────────────────────────────────────────────
  const tableBody: any[][] = [
    [
      { text: 'DESCRIPCIÓN', style: 'tableHeader', fillColor: PRIMARY, color: 'white' },
      { text: 'CANT.', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY, color: 'white' },
      { text: 'P. UNITARIO', style: 'tableHeader', alignment: 'right', fillColor: PRIMARY, color: 'white' },
      { text: 'IVA', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY, color: 'white' },
      { text: 'IMPORTE', style: 'tableHeader', alignment: 'right', fillColor: PRIMARY, color: 'white' },
    ],
  ];
  (lines || []).forEach((line, idx) => {
    const qty = Number(line.quantity ?? 1);
    const unit = Number(line.unit_price ?? 0);
    const taxRate = Number(line.tax_rate ?? 21);
    const lineTotal = Number(line.line_total ?? unit);
    const fill = idx % 2 === 0 ? LIGHT_GRAY : null;
    tableBody.push([
      { text: line.description || '', fontSize: 9, fillColor: fill },
      { text: qty.toString(), alignment: 'center', fontSize: 9, fillColor: fill },
      { text: money(unit, currency), alignment: 'right', fontSize: 9, fillColor: fill },
      { text: `${taxRate}%`, alignment: 'center', fontSize: 9, fillColor: fill },
      { text: money(lineTotal, currency), alignment: 'right', fontSize: 10, bold: true, fillColor: fill },
    ]);
  });

  // ── Payments summary ──────────────────────────────────────────────────
  const paymentRows: any[][] = [
    [
      { text: 'FECHA', style: 'tableHeader', fillColor: ACCENT, color: 'white' },
      { text: 'PROVEEDOR', style: 'tableHeader', fillColor: ACCENT, color: 'white' },
      { text: 'REFERENCIA', style: 'tableHeader', fillColor: ACCENT, color: 'white' },
      { text: 'IMPORTE', style: 'tableHeader', alignment: 'right', fillColor: ACCENT, color: 'white' },
    ],
  ];
  (payments || []).forEach((p, idx) => {
    const fill = idx % 2 === 0 ? LIGHT_GRAY : null;
    paymentRows.push([
      { text: formatDate(p.paid_at), fontSize: 9, fillColor: fill },
      { text: PROVIDER_LABELS[p.provider] || p.provider || '—', fontSize: 9, fillColor: fill },
      { text: p.provider_reference || '—', fontSize: 8, color: TEXT_LIGHT, fillColor: fill },
      { text: money(p.amount, p.currency || currency), alignment: 'right', fontSize: 10, bold: true, fillColor: fill },
    ]);
  });

  // ── Totals ─────────────────────────────────────────────────────────────
  const totalPaid = (payments || []).reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0,
  );

  // ── Document definition ───────────────────────────────────────────────
  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],

    header: {
      columns: [
        {
          text: 'RECIBO DE PAGO',
          alignment: 'right',
          margin: [0, 20, 40, 0],
          fontSize: 14,
          color: PRIMARY,
          bold: true,
        },
      ],
    },

    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `Recibo ${receiptNumber} — generado el ${formatDate(new Date().toISOString())}`,
          alignment: 'left',
          fontSize: 7,
          color: TEXT_LIGHT,
          margin: [40, 0, 0, 0],
        },
        {
          text: `Página ${currentPage} de ${pageCount}`,
          alignment: 'right',
          fontSize: 7,
          color: TEXT_LIGHT,
          margin: [0, 0, 40, 0],
        },
      ],
    }),

    content: [
      // ── Emitter / client row ─────────────────────────────────────────
      {
        columns: [
          { width: '*', stack: emitterInfo.length ? emitterInfo : [{ text: '—', fontSize: 9 }] },
          { width: '*', stack: clientInfo.length ? clientInfo : [{ text: '—', fontSize: 9 }] },
        ],
        columnGap: 20,
        margin: [0, 0, 0, 20],
      },

      // ── Receipt meta box ─────────────────────────────────────────────
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              { text: 'Nº Recibo', bold: true, fontSize: 9, color: TEXT_LIGHT },
              { text: receiptNumber, fontSize: 10, alignment: 'right' },
            ],
            [
              { text: 'Periodo', bold: true, fontSize: 9, color: TEXT_LIGHT },
              { text: periodLabel, fontSize: 10, alignment: 'right' },
            ],
            [
              { text: 'Fecha emisión presupuesto', bold: true, fontSize: 9, color: TEXT_LIGHT },
              { text: formatDate(budget.issue_date), fontSize: 10, alignment: 'right' },
            ],
            [
              { text: 'Fecha de pago', bold: true, fontSize: 9, color: TEXT_LIGHT },
              { text: formatDate(budget.paid_at || firstPayment.paid_at), fontSize: 10, alignment: 'right' },
            ],
            [
              { text: 'Estado', bold: true, fontSize: 9, color: TEXT_LIGHT },
              {
                text: budget.payment_status === 'paid' ? '✓ COBRADO' :
                      budget.payment_status === 'refunded' ? 'DEVUELTO' :
                      budget.payment_status === 'failed' ? 'FALLIDO' : 'PENDIENTE',
                fontSize: 10,
                alignment: 'right',
                bold: true,
                color: budget.payment_status === 'paid' ? ACCENT : TEXT_DARK,
              },
            ],
          ],
        },
        layout: {
          hLineColor: () => '#E0E0E0',
          vLineColor: () => '#E0E0E0',
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
        margin: [0, 0, 0, 20],
      },

      // ── Lines table ──────────────────────────────────────────────────
      { text: 'DETALLE DEL PRESUPUESTO', fontSize: 11, bold: true, color: PRIMARY, margin: [0, 0, 0, 8] },
      {
        table: { headerRows: 1, widths: ['*', 50, 80, 50, 80], body: tableBody },
        layout: {
          hLineColor: () => '#E5E5E5',
          vLineColor: () => '#E5E5E5',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 16],
      },

      // ── Totals box ──────────────────────────────────────────────────
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            table: {
              body: [
                [
                  { text: 'Subtotal', fontSize: 9, color: TEXT_LIGHT },
                  { text: money(budget.subtotal, currency), fontSize: 10, alignment: 'right' },
                ],
                [
                  { text: `IVA (${budget.tax_rate || 21}%)`, fontSize: 9, color: TEXT_LIGHT },
                  { text: money(budget.tax_amount, currency), fontSize: 10, alignment: 'right' },
                ],
                [
                  { text: 'Total presupuesto', fontSize: 10, bold: true, color: TEXT_DARK },
                  { text: money(budget.total, currency), fontSize: 11, bold: true, alignment: 'right' },
                ],
                [
                  { text: 'Total cobrado', fontSize: 10, bold: true, color: ACCENT, fillColor: '#F0F9F4' },
                  { text: money(totalPaid, currency), fontSize: 12, bold: true, alignment: 'right', color: ACCENT, fillColor: '#F0F9F4' },
                ],
              ],
            },
            layout: {
              hLineColor: (i: number) => (i === 3 ? ACCENT : '#E0E0E0'),
              vLineColor: () => '#E0E0E0',
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 5,
              paddingBottom: () => 5,
            },
          },
        ],
        margin: [0, 0, 0, 20],
      },

      // ── Payment history ──────────────────────────────────────────────
      { text: 'HISTÓRICO DE PAGOS', fontSize: 11, bold: true, color: ACCENT, margin: [0, 0, 0, 8] },
      {
        table: { headerRows: 1, widths: [80, 100, '*', 80], body: paymentRows },
        layout: {
          hLineColor: () => '#E5E5E5',
          vLineColor: () => '#E5E5E5',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 20],
      },

      // ── Notes ───────────────────────────────────────────────────────
      budget.notes
        ? {
            stack: [
              { text: 'NOTAS', fontSize: 9, bold: true, color: TEXT_LIGHT, margin: [0, 0, 0, 4] },
              { text: String(budget.notes), fontSize: 8, color: TEXT_DARK },
            ],
            margin: [0, 10, 0, 0],
          }
        : {},
    ],

    styles: {
      tableHeader: { fontSize: 9, bold: true },
    },
    defaultStyle: { font: 'Roboto' },
  };

  return new Promise<Uint8Array>((resolve, reject) => {
    try {
      const pdf = pdfMake.createPdf(docDefinition);
      pdf.getBuffer((buffer) => resolve(new Uint8Array(buffer)));
    } catch (e) {
      reject(e);
    }
  });
}

// ── HTTP serve ──────────────────────────────────────────────────────────
serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (origin && !originAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'CORS_ORIGIN_FORBIDDEN' }), {
      status: 403,
      headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
    });
  }

  const ip = getClientIP(req);
  const rl = await checkRateLimit(`budget-receipt-pdf:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) }),
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
    });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Bearer token' }), {
        status: 401,
        headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
      });
    }

    const url = new URL(req.url);
    const paymentId = url.searchParams.get('payment_id');
    const budgetId = url.searchParams.get('budget_id');
    const download = url.searchParams.get('download') === '1';

    if (!paymentId && !budgetId) {
      return new Response(
        JSON.stringify({ error: 'payment_id or budget_id required' }),
        { status: 400, headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }) },
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const targetId = paymentId || budgetId!;
    if (!uuidRegex.test(targetId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid id format' }),
        { status: 400, headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }) },
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ── Auth: identify caller & company ───────────────────────────────
    const { data: { user: caller } } = await user.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
      });
    }
    const { data: me } = await admin
      .from('users')
      .select('id, company_id, client_id')
      .eq('auth_user_id', caller.id)
      .single();
    if (!me?.company_id) {
      return new Response(JSON.stringify({ error: 'User has no company' }), {
        status: 403, headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
      });
    }

    // ── Load budget + payments ──────────────────────────────────────
    let budgetIdResolved = budgetId;
    if (paymentId) {
      const { data: payment } = await admin
        .from('recurring_budget_payments')
        .select('budget_id')
        .eq('id', paymentId)
        .maybeSingle();
      if (!payment) {
        return new Response(JSON.stringify({ error: 'Payment not found' }), {
          status: 404, headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
        });
      }
      budgetIdResolved = payment.budget_id;
    }

    const { data: budget, error: bErr } = await user
      .from('recurring_budgets')
      .select('*')
      .eq('id', budgetIdResolved)
      .eq('company_id', me.company_id)
      .maybeSingle();
    if (bErr || !budget) {
      return new Response(JSON.stringify({ error: 'Budget not found' }), {
        status: 404, headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
      });
    }

    // ── Load lines, payments, client, company, settings ────────────
    const [linesRes, paymentsRes, clientRes, companyRes, compSetRes] = await Promise.all([
      admin.from('recurring_budget_lines')
        .select('*')
        .eq('budget_id', budget.id)
        .order('sort_order'),
      admin.from('recurring_budget_payments')
        .select('*')
        .eq('budget_id', budget.id)
        .order('paid_at', { ascending: false }),
      admin.from('clients').select('*').eq('id', budget.client_id).maybeSingle(),
      admin.from('companies').select('*').eq('id', budget.company_id).maybeSingle(),
      admin.from('company_settings').select('*').eq('company_id', budget.company_id).maybeSingle(),
    ]);

    const pdfBytes = await generateReceiptPdf({
      budget,
      lines: linesRes.data || [],
      payments: paymentsRes.data || [],
      client: clientRes.data,
      company: companyRes.data,
      companySettings: compSetRes.data,
    });

    // ── Upload to storage bucket "payment-receipts" (idempotent) ────
    const bucket = 'payment-receipts';
    const path = paymentId
      ? `budgets/${budget.id}/receipts/${paymentId}.pdf`
      : `budgets/${budget.id}/receipts/all.pdf`;

    await admin.storage.from(bucket).upload(path, new Blob([pdfBytes], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: true,
    });

    // ── Persist the receipt_pdf_path on the budget (so the portal can
    //    show a "Download receipt" button without re-generating).
    await admin
      .from('recurring_budgets')
      .update({
        receipt_pdf_path: path,
        receipt_generated_at: new Date().toISOString(),
      })
      .eq('id', budget.id);

    if (download) {
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="recibo-${budget.period}.pdf"`,
        },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, path, bytes: pdfBytes.byteLength }),
      { status: 200, headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }) },
    );
  } catch (e) {
    console.error('[budget-receipt-pdf] unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: withSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
    });
  }
});
