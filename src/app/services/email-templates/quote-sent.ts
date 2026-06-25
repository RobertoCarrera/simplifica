/**
 * Email template: "quote_sent"
 * ----------------------------------------------------------------------------
 * Professional HTML template sent to a client when a quote transitions from
 * `draft` → `sent`. Used by:
 *   - The Angular front, via the send-branded-email Edge Function, when a
 *     staff member clicks "Enviar al cliente" on the quote list.
 *   - The Postgres RPC `send_quote_to_client(quote_id)` (which fires the
 *     booking-notifier Edge Function in turn).
 *
 * Data contract — the `data` argument passed to send-branded-email:
 *   {
 *     cliente_nombre:   string   — recipient name (used in greeting)
 *     numero_presupuesto: string — formatted quote number (e.g. "2026-P-00012")
 *     fecha_emision:    string   — formatted issue date (e.g. "25/06/2026")
 *     fecha_validez:    string   — formatted expiry date (e.g. "25/07/2026")
 *     empresa:          string   — company display name
 *     line_items: Array<{
 *       descripcion: string
 *       cantidad:    number
 *       precio_unitario: number
 *       tipo_iva:    number   — tax rate %, e.g. 21
 *       subtotal:    number   — line subtotal (qty * unit_price)
 *       total:       number   — line total incl. tax
 *     }>
 *     subtotal:    number — sum of line subtotals
 *     iva_importe: number — sum of tax amounts
 *     iva_porcentaje: number — e.g. 21
 *     total:       number — grand total incl. tax
 *     moneda:      string — ISO 4217 (e.g. "EUR")
 *     quote_url:   string — link to the client portal
 *     notas?:      string — optional internal notes shown as a callout
 *     empresa_nif?: string — company tax ID for the footer
 *     empresa_direccion?: string — fiscal address for the footer
 *     empresa_email?:    string — fiscal email for the footer
 *     empresa_web?:      string — website for the footer
 *   }
 *
 * The template is intentionally framework-free (no Angular, no Tailwind)
 * because the rendered HTML is sent through send-branded-email → SES and
 * must render correctly in Gmail, Outlook, Apple Mail, etc.
 */

export interface QuoteSentLineItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  tipo_iva: number;
  subtotal: number;
  total: number;
}

export interface QuoteSentData {
  cliente_nombre: string;
  numero_presupuesto: string;
  fecha_emision: string;
  fecha_validez: string;
  empresa: string;
  line_items: QuoteSentLineItem[];
  subtotal: number;
  iva_importe: number;
  iva_porcentaje: number;
  total: number;
  moneda: string;
  quote_url: string;
  notas?: string;
  empresa_nif?: string;
  empresa_direccion?: string;
  empresa_email?: string;
  empresa_web?: string;
  /** Optional company logo URL. If absent we render the company name as a text logo. */
  empresa_logo_url?: string;
  /** Primary color (hex) for the CTA button and accents. Defaults to a deep indigo. */
  primary_color?: string;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Minimal HTML escape. We accept that send-branded-email interpolates the
 * returned string into its own wrapper; we still escape here so user-provided
 * content (client name, line item descriptions, notes) cannot inject markup.
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a number as a currency string. es-ES uses 1.234,56 € — safe for
 * Spain-facing customers (the default tenant language is `es`).
 */
function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    // Fallback if Intl refuses the currency code.
    const n = (Number.isFinite(value) ? value : 0).toFixed(2);
    return `${n} ${currency || 'EUR'}`;
  }
}

/**
 * Build the "Datos fiscales" footer block. Each line is independently hidden
 * when the value is missing — so the footer degrades gracefully for tenants
 * that haven't filled in their full profile.
 */
function renderFiscalFooter(d: QuoteSentData): string {
  const lines: string[] = [];
  if (d.empresa_nif)        lines.push(`NIF: ${escapeHtml(d.empresa_nif)}`);
  if (d.empresa_direccion)  lines.push(escapeHtml(d.empresa_direccion));
  if (d.empresa_email)      lines.push(escapeHtml(d.empresa_email));
  if (d.empresa_web)        lines.push(escapeHtml(d.empresa_web));
  if (lines.length === 0) return '';
  return lines.join(' &middot; ');
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Returns the HTML body for the "quote_sent" email. Pure function — no I/O,
 * no Angular dependencies. Safe to call from SSR, prerender, or test.
 */
export function renderQuoteSentEmail(data: QuoteSentData): string {
  const primary = escapeHtml(data.primary_color || '#4f46e5');

  // Logo block: image if available, otherwise a text-based "logo" so the
  // header still looks intentional instead of empty.
  const logoBlock = data.empresa_logo_url
    ? `<img src="${escapeHtml(data.empresa_logo_url)}" alt="${escapeHtml(data.empresa)}" style="max-height:60px;max-width:220px;display:block;margin:0 auto;">`
    : `<div style="font-size:20px;font-weight:700;color:${primary};text-align:center;letter-spacing:0.5px;">${escapeHtml(data.empresa || '')}</div>`;

  // Line items table — one row per line, with subtotal + tax + total columns.
  const lineRows = (data.line_items || []).map((li) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#1f2937;font-size:14px;vertical-align:top;">
        ${escapeHtml(li.descripcion)}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#374151;font-size:14px;text-align:center;vertical-align:top;">
        ${escapeHtml(li.cantidad)}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#374151;font-size:14px;text-align:right;vertical-align:top;">
        ${formatCurrency(li.precio_unitario, data.moneda)}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#374151;font-size:14px;text-align:right;vertical-align:top;">
        ${escapeHtml(li.tipo_iva)}%
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;color:#111827;font-size:14px;text-align:right;font-weight:600;vertical-align:top;">
        ${formatCurrency(li.total, data.moneda)}
      </td>
    </tr>
  `).join('');

  // Fallback if no line items arrived (shouldn't happen but be defensive).
  const lineTableBody = lineRows || `
    <tr><td colspan="5" style="padding:16px 8px;text-align:center;color:#9ca3af;font-size:13px;font-style:italic;">
      Sin líneas de detalle
    </td></tr>
  `;

  // Optional internal notes — rendered as a callout so they are visually
  // distinct from the financial table.
  const notesBlock = data.notas
    ? `<div style="margin:20px 0;padding:12px 14px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;color:#78350f;font-size:13px;">
         <strong style="display:block;margin-bottom:4px;">Notas:</strong>
         ${escapeHtml(data.notas)}
       </div>`
    : '';

  // CTA button. Hidden if no quote_url is provided (defensive — the RPC
  // always sets it but third-party callers might not).
  const ctaBlock = data.quote_url
    ? `<div style="text-align:center;margin:28px 0 12px 0;">
         <a href="${escapeHtml(data.quote_url)}"
            style="display:inline-block;background:${primary};color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;letter-spacing:0.3px;">
           Ver presupuesto
         </a>
       </div>
       <p style="text-align:center;color:#6b7280;font-size:12px;margin:8px 0 0 0;">
         Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
         <span style="color:#9ca3af;word-break:break-all;">${escapeHtml(data.quote_url)}</span>
       </p>`
    : '';

  const fiscalFooter = renderFiscalFooter(data);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Presupuesto ${escapeHtml(data.numero_presupuesto)} - ${escapeHtml(data.empresa)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">

          <!-- Header: logo + issue date -->
          <tr>
            <td style="padding:24px 24px 12px 24px;border-bottom:1px solid #f3f4f6;">
              ${logoBlock}
              <div style="text-align:center;color:#6b7280;font-size:12px;margin-top:8px;">
                Presupuesto ${escapeHtml(data.numero_presupuesto)} &middot; emitido el ${escapeHtml(data.fecha_emision)}
              </div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:24px 24px 0 24px;">
              <h1 style="margin:0;font-size:20px;color:#111827;font-weight:700;">
                Hola ${escapeHtml(data.cliente_nombre || 'cliente')},
              </h1>
              <p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#374151;">
                Te adjuntamos el presupuesto <strong>${escapeHtml(data.numero_presupuesto)}</strong> que hemos preparado
                para ti. Es válido hasta el <strong>${escapeHtml(data.fecha_validez)}</strong>.
              </p>
            </td>
          </tr>

          ${notesBlock ? `<tr><td style="padding:0 24px;">${notesBlock}</td></tr>` : ''}

          <!-- Line items table -->
          <tr>
            <td style="padding:20px 24px 0 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th align="left"   style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">Concepto</th>
                    <th align="center" style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">Cant.</th>
                    <th align="right"  style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">P. unit.</th>
                    <th align="right"  style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">IVA</th>
                    <th align="right"  style="padding:10px 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineTableBody}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding:16px 24px 0 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="right" style="padding:6px 8px;color:#6b7280;font-size:13px;">Subtotal</td>
                  <td align="right" width="120" style="padding:6px 8px;color:#374151;font-size:13px;">${formatCurrency(data.subtotal, data.moneda)}</td>
                </tr>
                <tr>
                  <td align="right" style="padding:6px 8px;color:#6b7280;font-size:13px;">IVA (${escapeHtml(data.iva_porcentaje)}%)</td>
                  <td align="right" width="120" style="padding:6px 8px;color:#374151;font-size:13px;">${formatCurrency(data.iva_importe, data.moneda)}</td>
                </tr>
                <tr>
                  <td align="right" style="padding:10px 8px 4px 8px;border-top:2px solid #111827;color:#111827;font-size:15px;font-weight:700;">TOTAL</td>
                  <td align="right" width="120" style="padding:10px 8px 4px 8px;border-top:2px solid #111827;color:#111827;font-size:17px;font-weight:700;">${formatCurrency(data.total, data.moneda)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          ${ctaBlock ? `<tr><td style="padding:0 24px 8px 24px;">${ctaBlock}</td></tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:24px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              ${fiscalFooter ? `<p style="margin:0 0 6px 0;text-align:center;color:#6b7280;font-size:12px;line-height:1.5;">${fiscalFooter}</p>` : ''}
              <p style="margin:6px 0 0 0;text-align:center;color:#9ca3af;font-size:11px;line-height:1.5;">
                Este correo y, en su caso, la información adjunta, es confidencial y va dirigida
                exclusivamente a su destinatario. Si ha recibido este mensaje por error, le rogamos
                que lo elimine y nos lo comunique.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Returns the email subject. Localized through the `lang` arg so callers
 * can reuse the template for non-Spanish tenants later (de, en, ca, ...).
 */
export function getQuoteSentSubject(data: QuoteSentData, lang: 'es' | 'en' | 'ca' | 'de' = 'es'): string {
  switch (lang) {
    case 'en': return `Your quote ${data.numero_presupuesto} from ${data.empresa}`;
    case 'ca': return `El teu pressupost ${data.numero_presupuesto} de ${data.empresa}`;
    case 'de': return `Ihr Angebot ${data.numero_presupuesto} von ${data.empresa}`;
    case 'es':
    default:   return `Presupuesto ${data.numero_presupuesto} - ${data.empresa}`;
  }
}

/**
 * Convenience helper used by send-branded-email-style callers that need
 * both subject and body in a single call.
 */
export function buildQuoteSentEmail(data: QuoteSentData, lang: 'es' | 'en' | 'ca' | 'de' = 'es'): {
  subject: string;
  html: string;
} {
  return {
    subject: getQuoteSentSubject(data, lang),
    html: renderQuoteSentEmail(data),
  };
}