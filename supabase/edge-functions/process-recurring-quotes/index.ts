// @ts-nocheck
// ==============================================
// Edge Function: process-recurring-quotes
// ==============================================
// Processes recurring quotes that are due for invoicing.
// This function should be called by a cron job (e.g., daily at 00:05)
// 
// For each recurring quote where next_run_at <= NOW():
// 1. Creates a real invoice in the invoices table
// 2. Copies all quote items to invoice items
// 3. Creates payment link (PayPal/Stripe if configured)
// 4. Sends email notification to client
// 5. Updates quote: last_run_at = NOW(), next_run_at = calculated next date
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "default-dev-key-change-in-prod";
const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://simplifica.app";

function cors(origin?: string) {
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0 && !allowAll) allowed.push('http://localhost:4200');
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  const acao = isAllowed && origin ? origin : allowAll ? '*' : '';
  return {
    'Access-Control-Allow-Origin': acao,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  } as Record<string, string>;
}

// Decrypt credentials
async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

function generateToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

// Calculate next run date based on recurrence type
function calculateNextRunAt(lastRunAt: Date, recurrenceType: string): Date {
  const next = new Date(lastRunAt);
  
  switch (recurrenceType) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'biannual':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'annual':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    default:
      // Default to monthly
      next.setMonth(next.getMonth() + 1);
  }
  
  return next;
}

// Create PayPal Order
async function createPayPalOrder(
  credentials: { clientId: string; clientSecret: string },
  isSandbox: boolean,
  invoice: any,
  paymentToken: string
): Promise<{ orderId: string; approvalUrl: string } | null> {
  const baseUrl = isSandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  try {
    const auth = btoa(`${credentials.clientId}:${credentials.clientSecret}`);
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json();

    const returnUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=success`;
    const cancelUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=cancelled`;

    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: invoice.id,
          custom_id: `invoice_${paymentToken}`,
          description: `Factura ${invoice.full_invoice_number}`,
          amount: {
            currency_code: "EUR",
            value: Number(invoice.total).toFixed(2),
          },
        }],
        application_context: {
          brand_name: invoice.company_name || "Simplifica",
          locale: "es-ES",
          landing_page: "BILLING",
          user_action: "PAY_NOW",
          return_url,
          cancel_url,
        },
      }),
    });

    if (!orderRes.ok) return null;
    const order = await orderRes.json();
    const approvalUrl = order.links?.find((l: any) => l.rel === "approve")?.href;
    return { orderId: order.id, approvalUrl };
  } catch (e) {
    console.error("[process-recurring] PayPal error:", e);
    return null;
  }
}

// Create Stripe Checkout Session
async function createStripeCheckout(
  credentials: { secretKey: string },
  invoice: any,
  paymentToken: string
): Promise<{ sessionId: string; checkoutUrl: string } | null> {
  try {
    const returnUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=success`;
    const cancelUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=cancelled`;

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credentials.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "payment",
        "success_url": returnUrl,
        "cancel_url": cancelUrl,
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][product_data][name]": `Factura ${invoice.full_invoice_number}`,
        "line_items[0][price_data][product_data][description]": invoice.client_name || "Pago de factura recurrente",
        "line_items[0][price_data][unit_amount]": Math.round(Number(invoice.total) * 100).toString(),
        "line_items[0][quantity]": "1",
        "metadata[payment_link_token]": paymentToken,
        "metadata[invoice_id]": invoice.id,
        "customer_email": invoice.client_email || "",
        "locale": "es",
      }),
    });

    if (!response.ok) return null;
    const session = await response.json();
    return { sessionId: session.id, checkoutUrl: session.url };
  } catch (e) {
    console.error("[process-recurring] Stripe error:", e);
    return null;
  }
}

// Send email notification using AWS SES
async function sendInvoiceEmail(
  invoice: any,
  pdfUrl: string,
  paymentLink: string | null
): Promise<boolean> {
  const region = Deno.env.get('AWS_REGION') || '';
  const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID') || '';
  const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY') || '';
  const fromEmail = Deno.env.get('SES_FROM_ADDRESS') || '';
  
  if (!region || !accessKeyId || !secretAccessKey || !fromEmail || !invoice.client_email) {
    console.log("[process-recurring] SES not configured or no client email");
    return false;
  }

  try {
    // AWS SES SigV4 signing
    const te = new TextEncoder();
    
    function toHex(buf: ArrayBuffer): string {
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function sha256Hex(data: string): Promise<string> {
      return toHex(await crypto.subtle.digest('SHA-256', te.encode(data)));
    }

    async function hmacSha256Raw(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
      const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return crypto.subtle.sign('HMAC', cryptoKey, te.encode(data));
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const amzDate = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const dateStamp = amzDate.slice(0, 8);

    const paymentSection = paymentLink 
      ? `<p><a href="${paymentLink}" style="display:inline-block;padding:12px 24px;background:#10b981;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">💳 Pagar ahora</a></p>`
      : '';

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:600px;margin:0 auto;">
        <div style="background:#1e293b;padding:20px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:24px;">Nueva Factura</h1>
        </div>
        <div style="padding:20px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p>Hola${invoice.client_name ? ' ' + invoice.client_name : ''},</p>
          <p>Se ha generado una nueva factura correspondiente a tu suscripción recurrente.</p>
          
          <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0 0 8px 0;"><strong>Factura:</strong> ${invoice.full_invoice_number}</p>
            <p style="margin:0 0 8px 0;"><strong>Fecha:</strong> ${invoice.invoice_date}</p>
            <p style="margin:0 0 8px 0;"><strong>Total:</strong> ${Number(invoice.total).toFixed(2)} €</p>
          </div>
          
          <p><a href="${pdfUrl}" target="_blank" style="color:#2563eb;">📄 Descargar factura (PDF)</a></p>
          ${paymentSection}
          
          <p style="color:#666;font-size:12px;margin-top:20px;">Este es un email automático generado por el sistema de facturación recurrente.</p>
        </div>
      </div>
    `;

    const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
    const bodyJson = JSON.stringify({
      FromEmailAddress: fromEmail,
      Destination: { ToAddresses: [invoice.client_email] },
      Content: {
        Simple: {
          Subject: { Data: `Nueva factura ${invoice.full_invoice_number}`, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } }
        }
      }
    });

    const payloadHash = await sha256Hex(bodyJson);
    const canonicalHeaders = `host:email.${region}.amazonaws.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `POST\n/v2/email/outbound-emails\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

    // Derive signing key
    let signingKey = await hmacSha256Raw(te.encode('AWS4' + secretAccessKey), dateStamp);
    signingKey = await hmacSha256Raw(signingKey, region);
    signingKey = await hmacSha256Raw(signingKey, 'ses');
    signingKey = await hmacSha256Raw(signingKey, 'aws4_request');
    const signature = toHex(await hmacSha256Raw(signingKey, stringToSign));

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash
      },
      body: bodyJson
    });

    if (!res.ok) {
      console.error("[process-recurring] SES error:", await res.text());
      return false;
    }

    return true;
  } catch (e) {
    console.error("[process-recurring] Email error:", e);
    return false;
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const baseHeaders = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: baseHeaders });
  const headers = { ...baseHeaders, 'Content-Type': 'application/json' };
  
  // Allow both POST (manual) and GET (cron)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    // For cron jobs, we use service role. For manual calls, verify Bearer token
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    
    const url = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!url || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500, headers });
    }

    // Admin client for all operations (bypasses RLS)
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Verify token if provided (for manual execution)
    if (token && token !== serviceKey) {
      const { data: authData, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !authData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
      }
    }

    // Find all recurring quotes that need processing
    const now = new Date().toISOString();
    const { data: dueQuotes, error: qErr } = await admin
      .from('quotes')
      .select(`
        id, company_id, client_id, full_quote_number, subtotal, tax_amount, total_amount, currency,
        recurrence_type, next_run_at, last_run_at, notes, created_by,
        client:clients(id, name, email),
        company:companies(id, name)
      `)
      .eq('status', 'invoiced')
      .not('recurrence_type', 'is', null)
      .neq('recurrence_type', 'none')
      .not('next_run_at', 'is', null)
      .lte('next_run_at', now)
      .is('deleted_at', null);

    if (qErr) {
      console.error("[process-recurring] Error fetching quotes:", qErr);
      return new Response(JSON.stringify({ error: 'Error fetching due quotes', details: qErr.message }), { status: 500, headers });
    }

    if (!dueQuotes || dueQuotes.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No recurring quotes due', processed: 0 }), { status: 200, headers });
    }

    console.log(`[process-recurring] Found ${dueQuotes.length} recurring quotes to process`);

    const results: any[] = [];

    for (const quote of dueQuotes) {
      try {
        console.log(`[process-recurring] Processing quote ${quote.full_quote_number}`);

        // 1. Get default invoice series for the company
        const { data: series, error: sErr } = await admin
          .from('invoice_series')
          .select('id, year, series_code, verifactu_enabled')
          .eq('company_id', quote.company_id)
          .eq('is_active', true)
          .eq('is_default', true)
          .order('year', { ascending: false })
          .limit(1)
          .single();

        if (sErr || !series) {
          console.error(`[process-recurring] No series for company ${quote.company_id}`);
          results.push({ quote_id: quote.id, error: 'No default invoice series' });
          continue;
        }

        const invoiceSeriesLabel = `${series.year}-${series.series_code}`;

        // 2. Get next invoice number
        const { data: nextNumber, error: numErr } = await admin.rpc('get_next_invoice_number', { p_series_id: series.id });
        if (numErr || !nextNumber) {
          console.error(`[process-recurring] Could not get next invoice number:`, numErr);
          results.push({ quote_id: quote.id, error: 'Could not generate invoice number' });
          continue;
        }

        const fullInvoiceNumber = `${invoiceSeriesLabel}-${nextNumber}`;
        const invoiceDate = new Date().toISOString().slice(0, 10);
        const dueDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        
        // Calculate recurrence period (e.g., "2025-12")
        const recurrencePeriod = invoiceDate.slice(0, 7);

        // 3. Create the invoice
        const { data: invoiceRow, error: invErr } = await admin
          .from('invoices')
          .insert({
            company_id: quote.company_id,
            client_id: quote.client_id,
            series_id: series.id,
            invoice_number: nextNumber,
            invoice_series: invoiceSeriesLabel,
            full_invoice_number: fullInvoiceNumber,
            invoice_type: 'normal',
            invoice_date: invoiceDate,
            invoice_month: `${invoiceDate.slice(0, 7)}-01`,
            due_date: dueDate,
            subtotal: quote.subtotal,
            tax_amount: quote.tax_amount,
            total: quote.total_amount,
            currency: quote.currency || 'EUR',
            status: 'approved',
            payment_status: 'pending',
            notes: `Factura recurrente generada desde: ${quote.full_quote_number}\nPeríodo: ${recurrencePeriod}`,
            created_by: quote.created_by,
            source_quote_id: quote.id
          })
          .select('id')
          .single();

        if (invErr || !invoiceRow?.id) {
          console.error(`[process-recurring] Could not create invoice:`, invErr);
          results.push({ quote_id: quote.id, error: 'Could not create invoice', details: invErr?.message });
          continue;
        }

        const invoiceId = invoiceRow.id;
        console.log(`[process-recurring] Created invoice ${fullInvoiceNumber} (${invoiceId})`);

        // 4. Copy quote items to invoice items
        const { data: qItems } = await admin
          .from('quote_items')
          .select('line_number, description, quantity, unit_price, discount_percent, tax_rate, tax_amount, subtotal, total')
          .eq('quote_id', quote.id)
          .order('line_number', { ascending: true });

        if (qItems && qItems.length > 0) {
          const itemsToInsert = qItems.map((it: any) => ({
            invoice_id: invoiceId,
            line_order: it.line_number,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount_percent: it.discount_percent ?? 0,
            tax_rate: it.tax_rate,
            tax_amount: it.tax_amount,
            subtotal: it.subtotal,
            total: it.total
          }));
          
          const { error: iiErr } = await admin.from('invoice_items').insert(itemsToInsert);
          if (iiErr) {
            console.warn(`[process-recurring] Could not copy items:`, iiErr);
          }
        }

        // 5. Recalculate totals (safety)
        await admin.rpc('calculate_invoice_totals', { p_invoice_id: invoiceId }).catch(() => {});

        // 6. Try to create payment link if integration exists
        let paymentLink: string | null = null;
        const { data: integration } = await admin
          .from('payment_integrations')
          .select('*')
          .eq('company_id', quote.company_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (integration) {
          const paymentToken = generateToken();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiration

          const credentials = JSON.parse(await decrypt(integration.credentials_encrypted));
          
          const invoiceData = {
            id: invoiceId,
            full_invoice_number: fullInvoiceNumber,
            total: quote.total_amount,
            client_name: quote.client?.name,
            client_email: quote.client?.email,
            company_name: quote.company?.name
          };

          let paymentResult = null;
          if (integration.provider === 'paypal') {
            paymentResult = await createPayPalOrder(credentials, integration.is_sandbox, invoiceData, paymentToken);
          } else if (integration.provider === 'stripe') {
            paymentResult = await createStripeCheckout(credentials, invoiceData, paymentToken);
          }

          if (paymentResult) {
            // Update invoice with payment link
            await admin.from('invoices').update({
              payment_link_token: paymentToken,
              payment_link_expires_at: expiresAt.toISOString(),
              payment_link_provider: integration.provider
            }).eq('id', invoiceId);

            paymentLink = `${PUBLIC_SITE_URL}/pago/${paymentToken}`;
            console.log(`[process-recurring] Created payment link for invoice ${fullInvoiceNumber}`);
          }
        }

        // 7. Send email notification
        let emailSent = false;
        if (quote.client?.email) {
          // Get PDF URL (generate signed URL)
          const pdfPath = `${quote.company_id}/${invoiceId}.pdf`;
          
          // First, we need to trigger PDF generation
          // The PDF is typically generated on-demand, so we'll use a placeholder URL
          // In production, you might want to generate the PDF here or use a different approach
          const pdfUrl = `${url}/functions/v1/invoices-pdf?invoice_id=${invoiceId}`;
          
          emailSent = await sendInvoiceEmail(
            {
              ...invoiceData,
              invoice_date: invoiceDate,
              client_email: quote.client.email,
              client_name: quote.client.name
            },
            pdfUrl,
            paymentLink
          );
        }

        // 8. Update quote: last_run_at and next_run_at
        const newLastRunAt = new Date().toISOString();
        const newNextRunAt = calculateNextRunAt(new Date(), quote.recurrence_type);

        await admin
          .from('quotes')
          .update({
            last_run_at: newLastRunAt,
            next_run_at: newNextRunAt.toISOString()
          })
          .eq('id', quote.id);

        console.log(`[process-recurring] Updated quote ${quote.full_quote_number}: next_run_at = ${newNextRunAt.toISOString()}`);

        results.push({
          quote_id: quote.id,
          quote_number: quote.full_quote_number,
          invoice_id: invoiceId,
          invoice_number: fullInvoiceNumber,
          payment_link: paymentLink,
          email_sent: emailSent,
          next_run_at: newNextRunAt.toISOString(),
          success: true
        });

      } catch (e: any) {
        console.error(`[process-recurring] Error processing quote ${quote.id}:`, e);
        results.push({ quote_id: quote.id, error: e.message || 'Unknown error' });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => r.error).length;

    return new Response(JSON.stringify({
      ok: true,
      message: `Processed ${dueQuotes.length} recurring quotes`,
      processed: successful,
      failed,
      results
    }), { status: 200, headers });

  } catch (e: any) {
    console.error("[process-recurring] Fatal error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers });
  }
});
