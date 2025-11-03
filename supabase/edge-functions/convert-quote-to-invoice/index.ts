// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  const allowOrigin = isAllowed && origin ? origin : (allowAll ? '*' : '');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  } as Record<string,string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = { ...cors(origin), 'Content-Type':'application/json' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers });

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers });

    const { quote_id, invoice_series_id } = await req.json();
    if (!quote_id) return new Response(JSON.stringify({ error: 'quote_id is required' }), { status:400, headers });

    const url = Deno.env.get('SUPABASE_URL')||'';
    const anon = Deno.env.get('SUPABASE_ANON_KEY')||'';
    if (!url || !anon) return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status:500, headers });

    // User-scoped client (RLS enforced)
    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false }});

    // Load quote and validate state and ownership via RLS
    const { data: quote, error: qErr } = await sb
      .from('quotes')
      .select('id, company_id, client_id, status, invoice_id, subtotal, tax_amount, total_amount, currency, full_quote_number, notes')
      .eq('id', quote_id)
      .single();
    if (qErr || !quote) return new Response(JSON.stringify({ error: 'Quote not accessible' }), { status:403, headers });
    if (quote.status !== 'accepted') return new Response(JSON.stringify({ error: 'Solo se pueden convertir presupuestos aceptados' }), { status:400, headers });
    if (quote.invoice_id) return new Response(JSON.stringify({ error: 'Este presupuesto ya fue convertido a factura' }), { status:400, headers });

    // Resolve current app user (public.users) for created_by FK
    const { data: authUser } = await sb.auth.getUser();
    const authUserId = authUser?.user?.id || null;
    let appUserId: string | null = null;
    if (authUserId) {
      const { data: appUser } = await sb
        .from('users')
        .select('id')
        .eq('auth_user_id', authUserId)
        .limit(1)
        .maybeSingle();
      appUserId = appUser?.id || null;
    }

    // Pick invoice series (default active for company if not provided)
    let seriesId = invoice_series_id || null;
    if (!seriesId) {
      const { data: series, error: sErr } = await sb
        .from('invoice_series')
        .select('id')
        .eq('company_id', quote.company_id)
        .eq('is_active', true)
        .eq('is_default', true)
        .order('year', { ascending: false })
        .limit(1)
        .single();
      if (sErr || !series?.id) return new Response(JSON.stringify({ error: 'No hay serie de factura por defecto configurada' }), { status:400, headers });
      seriesId = series.id;
    }

    // Build series label
    const { data: seriesRow, error: serErr } = await sb
      .from('invoice_series')
      .select('year, series_code')
      .eq('id', seriesId)
      .single();
    if (serErr || !seriesRow) return new Response(JSON.stringify({ error: 'Serie no encontrada' }), { status:400, headers });
    const invoiceSeriesLabel = `${seriesRow.year}-${seriesRow.series_code}`;

    // Get next invoice number (text, zero-padded)
    const { data: nextNumber, error: numErr } = await sb.rpc('get_next_invoice_number', { p_series_id: seriesId });
    if (numErr || !nextNumber) return new Response(JSON.stringify({ error: 'No se pudo generar el siguiente número de factura', details: numErr?.message }), { status:400, headers });

    // Create invoice
    const { data: invoiceRow, error: invErr } = await sb
      .from('invoices')
      .insert({
        company_id: quote.company_id,
        client_id: quote.client_id,
        series_id: seriesId,
        invoice_number: nextNumber,
        invoice_series: invoiceSeriesLabel,
        invoice_type: 'normal',
        invoice_date: new Date().toISOString().slice(0,10),
        due_date: new Date(Date.now()+30*24*3600*1000).toISOString().slice(0,10),
        subtotal: quote.subtotal,
        tax_amount: quote.tax_amount,
        total: quote.total_amount,
        currency: quote.currency,
        status: 'draft',
        notes: `Generada desde presupuesto: ${quote.full_quote_number || ''}` + (quote.notes ? `\n\n${quote.notes}` : ''),
        created_by: appUserId
      })
      .select('id')
      .single();
    if (invErr || !invoiceRow?.id) return new Response(JSON.stringify({ error: 'No se pudo crear la factura', details: invErr?.message }), { status:400, headers });

    const invoiceId = invoiceRow.id as string;

    // Copy items
    const { data: qItems, error: qiErr } = await sb
      .from('quote_items')
      .select('line_number, description, quantity, unit_price, discount_percent, tax_rate, tax_amount, subtotal, total')
      .eq('quote_id', quote_id)
      .order('line_number', { ascending: true });
    if (qiErr) return new Response(JSON.stringify({ error: 'No se pudieron obtener los items del presupuesto' }), { status:400, headers });

    if (qItems && qItems.length) {
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
      const { error: iiErr } = await sb.from('invoice_items').insert(itemsToInsert);
      if (iiErr) return new Response(JSON.stringify({ error: 'No se pudieron copiar los items', details: iiErr.message }), { status:400, headers });
    }

  // Recalculate totals (optional safety) - ignore response
  await sb.rpc('calculate_invoice_totals', { p_invoice_id: invoiceId });

    // Update quote linkage
    const { error: uqErr } = await sb
      .from('quotes')
      .update({ invoice_id: invoiceId, status: 'invoiced', invoiced_at: new Date().toISOString() })
      .eq('id', quote_id);
    if (uqErr) return new Response(JSON.stringify({ error: 'Factura creada pero no se pudo actualizar el presupuesto', invoice_id: invoiceId, details: uqErr.message }), { status:207, headers });

    return new Response(JSON.stringify({ ok: true, invoice_id: invoiceId, invoice_number: `${invoiceSeriesLabel}-${nextNumber}` }), { status:200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers });
  }
});
