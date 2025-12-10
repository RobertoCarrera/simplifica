// @ts-nocheck
// Recurring quotes dispatcher: finds due recurring quotes and creates invoices.
// Intended to run on a schedule via Supabase Edge Functions cron.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function addInterval(date: Date, type: string, interval: number, day?: number): Date {
  const d = new Date(date);
  switch (type) {
    case 'weekly':
      d.setDate(d.getDate() + 7 * interval);
      if (typeof day === 'number') {
        const diff = (day - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + diff);
      }
      return d;
    case 'monthly':
      d.setMonth(d.getMonth() + interval);
      if (day) d.setDate(Math.min(day, 28));
      return d;
    case 'trimestral':
    case 'quarterly':
      d.setMonth(d.getMonth() + 3 * interval);
      if (day) d.setDate(Math.min(day, 28));
      return d;
    case 'annual':
    case 'yearly':
      d.setFullYear(d.getFullYear() + interval);
      if (day) d.setDate(Math.min(day, 28));
      return d;
    default:
      // For 'monthly' default if unknown type
      d.setMonth(d.getMonth() + interval);
      return d;
  }
}

// Get recurrence period string (e.g., '2025-12')
function getRecurrencePeriod(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Create invoice from quote - returns invoice_id or null on error
async function createInvoiceFromQuote(
  admin: any,
  quote: any,
  recurrencePeriod: string
): Promise<{ invoice_id: string | null; invoice_number: string | null; error: string | null }> {
  try {
    // Check if invoice already exists for this period (idempotency)
    const { data: existingInv } = await admin
      .from('invoices')
      .select('id, invoice_series, invoice_number')
      .eq('source_quote_id', quote.id)
      .eq('recurrence_period', recurrencePeriod)
      .maybeSingle();

    if (existingInv) {
      return {
        invoice_id: existingInv.id,
        invoice_number: `${existingInv.invoice_series}-${existingInv.invoice_number}`,
        error: null
      };
    }

    // Get default invoice series for company
    const { data: series, error: sErr } = await admin
      .from('invoice_series')
      .select('id, year, series_code, verifactu_enabled')
      .eq('company_id', quote.company_id)
      .eq('is_active', true)
      .eq('is_default', true)
      .order('year', { ascending: false })
      .limit(1)
      .single();

    if (sErr || !series?.id) {
      return { invoice_id: null, invoice_number: null, error: 'No default invoice series configured' };
    }

    const invoiceSeriesLabel = `${series.year}-${series.series_code}`;

    // Get next invoice number
    const { data: nextNumber, error: numErr } = await admin.rpc('get_next_invoice_number', { p_series_id: series.id });
    if (numErr || !nextNumber) {
      return { invoice_id: null, invoice_number: null, error: `Failed to get next invoice number: ${numErr?.message}` };
    }

    // Create invoice
    const now = new Date();
    const dueDate = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    const { data: invoiceRow, error: invErr } = await admin
      .from('invoices')
      .insert({
        company_id: quote.company_id,
        client_id: quote.client_id,
        series_id: series.id,
        invoice_number: nextNumber,
        invoice_series: invoiceSeriesLabel,
        invoice_type: 'normal',
        invoice_date: now.toISOString().slice(0, 10),
        due_date: dueDate.toISOString().slice(0, 10),
        subtotal: quote.subtotal,
        tax_amount: quote.tax_amount,
        total: quote.total_amount,
        currency: quote.currency || 'EUR',
        status: 'approved',
        notes: `Factura recurrente generada automáticamente desde presupuesto: ${quote.full_quote_number || quote.quote_number || ''}\nPeríodo: ${recurrencePeriod}`,
        created_by: quote.created_by,
        source_quote_id: quote.id,
        recurrence_period: recurrencePeriod,
        is_recurring: true
      })
      .select('id')
      .single();

    if (invErr || !invoiceRow?.id) {
      // Check for duplicate key (race condition)
      const isUnique = invErr?.code === '23505' || /duplicate|unique/i.test(invErr?.message || '');
      if (isUnique) {
        const { data: existing } = await admin
          .from('invoices')
          .select('id, invoice_series, invoice_number')
          .eq('source_quote_id', quote.id)
          .eq('recurrence_period', recurrencePeriod)
          .maybeSingle();
        if (existing) {
          return {
            invoice_id: existing.id,
            invoice_number: `${existing.invoice_series}-${existing.invoice_number}`,
            error: null
          };
        }
      }
      return { invoice_id: null, invoice_number: null, error: `Failed to create invoice: ${invErr?.message}` };
    }

    const invoiceId = invoiceRow.id;

    // Copy quote items to invoice items
    const { data: qItems, error: qiErr } = await admin
      .from('quote_items')
      .select('line_number, description, quantity, unit_price, discount_percent, tax_rate, tax_amount, subtotal, total')
      .eq('quote_id', quote.id)
      .order('line_number', { ascending: true });

    if (!qiErr && qItems && qItems.length > 0) {
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
        console.error(`Failed to copy items for invoice ${invoiceId}:`, iiErr);
      }
    }

    // Recalculate totals
    await admin.rpc('calculate_invoice_totals', { p_invoice_id: invoiceId });

    return {
      invoice_id: invoiceId,
      invoice_number: `${invoiceSeriesLabel}-${nextNumber}`,
      error: null
    };
  } catch (e) {
    return { invoice_id: null, invoice_number: null, error: String(e) };
  }
}

// Generate payment link for invoice
async function generatePaymentLink(admin: any, invoiceId: string, companyId: string): Promise<string | null> {
  try {
    // Get invoice with client info
    const { data: invoice } = await admin
      .from('invoices')
      .select(`
        id, total, currency, invoice_series, invoice_number,
        client:clients(id, name, email, preferred_payment_method)
      `)
      .eq('id', invoiceId)
      .single();

    if (!invoice?.client) return null;

    // Get company payment integration
    const preferredMethod = invoice.client.preferred_payment_method || 'stripe';
    const { data: integration } = await admin
      .from('company_payment_integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('provider', preferredMethod)
      .eq('is_active', true)
      .maybeSingle();

    if (!integration) return null;

    // Create payment record
    const { data: payment, error: payErr } = await admin
      .from('payments')
      .insert({
        company_id: companyId,
        invoice_id: invoiceId,
        client_id: invoice.client.id,
        amount: invoice.total,
        currency: invoice.currency || 'EUR',
        payment_method: preferredMethod,
        status: 'pending'
      })
      .select('id')
      .single();

    if (payErr || !payment?.id) return null;

    // Generate payment link URL (simplified - actual implementation would call provider API)
    const baseUrl = Deno.env.get('SUPABASE_URL') || '';
    const paymentLink = `${baseUrl}/functions/v1/public-payment-redirect?payment_id=${payment.id}`;

    // Update payment with link
    await admin
      .from('payments')
      .update({ payment_link: paymentLink })
      .eq('id', payment.id);

    return paymentLink;
  } catch (e) {
    console.error('Error generating payment link:', e);
    return null;
  }
}

// Send invoice email
async function sendInvoiceEmail(admin: any, invoiceId: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Call invoices-email edge function
    const response = await fetch(`${supabaseUrl}/functions/v1/invoices-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ invoice_id: invoiceId })
    });

    return response.ok;
  } catch (e) {
    console.error('Error sending invoice email:', e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Use service role for cron processing
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const nowIso = new Date().toISOString();
    const now = new Date();

    // Find due recurring quotes (excluding 'proyecto' type which is one-time)
    const { data: dueQuotes, error } = await admin
      .from('quotes')
      .select(`
        id, company_id, client_id, created_by,
        quote_number, full_quote_number, title,
        subtotal, tax_amount, total_amount, currency,
        recurrence_type, recurrence_interval, recurrence_day, 
        next_run_at, last_run_at, recurrence_end_date,
        notes
      `)
      .not('recurrence_type', 'is', null)
      .neq('recurrence_type', 'none')
      .neq('recurrence_type', 'proyecto')
      .lte('next_run_at', nowIso)
      .in('status', ['accepted', 'active']);

    if (error) throw error;

    const results: any[] = [];

    for (const q of dueQuotes || []) {
      const quoteResult: any = {
        quote_id: q.id,
        quote_number: q.full_quote_number || q.quote_number,
        recurrence_type: q.recurrence_type
      };

      // Stop if beyond end_date
      if (q.recurrence_end_date && new Date(q.recurrence_end_date) < now) {
        await admin.from('quotes').update({ recurrence_type: 'none' }).eq('id', q.id);
        quoteResult.action = 'disabled_past_end_date';
        results.push(quoteResult);
        continue;
      }

      // Determine recurrence period
      const recurrencePeriod = getRecurrencePeriod(new Date(q.next_run_at || now));

      // Create invoice
      const { invoice_id, invoice_number, error: invError } = await createInvoiceFromQuote(admin, q, recurrencePeriod);

      if (invError) {
        quoteResult.action = 'error';
        quoteResult.error = invError;
        results.push(quoteResult);
        continue;
      }

      quoteResult.invoice_id = invoice_id;
      quoteResult.invoice_number = invoice_number;
      quoteResult.recurrence_period = recurrencePeriod;

      // Generate payment link
      if (invoice_id) {
        const paymentLink = await generatePaymentLink(admin, invoice_id, q.company_id);
        quoteResult.payment_link = paymentLink;

        // Send email
        const emailSent = await sendInvoiceEmail(admin, invoice_id);
        quoteResult.email_sent = emailSent;

        // Auto-finalize for Verifactu if series has it enabled
        // This will create verifactu.events entry automatically
        const { data: series } = await admin
          .from('invoice_series')
          .select('verifactu_enabled')
          .eq('company_id', q.company_id)
          .eq('series_code', invoice_number.split('-')[0])
          .single();

        if (series?.verifactu_enabled) {
          try {
            await admin.rpc('verifactu.finalize_invoice', {
              p_invoice_id: invoice_id,
              p_series: invoice_number.split('-')[0],
              p_device_id: 'RECURRING-AUTO',
              p_software_id: 'SIMPLIFICA-VF-001'
            });
            quoteResult.verifactu_finalized = true;
          } catch (vfErr: any) {
            console.error(`Verifactu finalization error for ${invoice_id}:`, vfErr);
            quoteResult.verifactu_finalized = false;
            quoteResult.verifactu_error = vfErr.message;
          }
        }
      }

      // Advance next_run_at
      const interval = q.recurrence_interval || 1;
      const next = addInterval(
        new Date(q.next_run_at || now),
        q.recurrence_type,
        interval,
        q.recurrence_day
      );

      await admin
        .from('quotes')
        .update({
          last_run_at: now.toISOString(),
          next_run_at: next.toISOString()
        })
        .eq('id', q.id);

      quoteResult.next_run_at = next.toISOString();
      quoteResult.action = 'invoice_created';
      results.push(quoteResult);
    }

    return new Response(JSON.stringify({
      processed: results.length,
      timestamp: now.toISOString(),
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in quotes-recurring-dispatcher:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
