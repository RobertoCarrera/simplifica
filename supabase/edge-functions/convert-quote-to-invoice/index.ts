// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  // Dev-friendly fallback: if nothing configured, allow common localhost origin
  if (allowed.length === 0 && !allowAll) allowed.push('http://localhost:4200');
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  const acao = isAllowed && origin ? origin : allowAll ? '*' : '';
  return {
    'Access-Control-Allow-Origin': acao,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  } as Record<string,string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const baseHeaders = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: baseHeaders });
  const headers = { ...baseHeaders, 'Content-Type':'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers });

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers });

    const { quote_id, invoice_series_id } = await req.json();
    if (!quote_id) return new Response(JSON.stringify({ error: 'quote_id is required' }), { status:400, headers });

    const url = Deno.env.get('SUPABASE_URL')||'';
    const anon = Deno.env.get('SUPABASE_ANON_KEY')||'';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if (!url || !anon || !service) return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status:500, headers });

    // User-scoped client (RLS enforced)
    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false }});
    // Admin client for ownership validation
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // Decode user and map to company
    const { data: authData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authData?.user?.id) return new Response(JSON.stringify({ error: 'Invalid user token' }), { status:401, headers });
    const authUserId = authData.user.id;
    const { data: profile, error: profErr } = await admin
      .from('users')
      .select('id, company_id, active')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (profErr || !profile?.company_id || profile.active === false) return new Response(JSON.stringify({ error: 'Forbidden: user has no active company' }), { status:403, headers });
    const userCompanyId = profile.company_id;

    // Load quote and validate state and ownership via RLS
    const { data: quote, error: qErr } = await sb
      .from('quotes')
      .select('id, company_id, client_id, status, invoice_id, subtotal, tax_amount, total_amount, currency, full_quote_number, notes, rectifies_invoice_id')
      .eq('id', quote_id)
      .single();
  if (qErr || !quote) return new Response(JSON.stringify({ error: 'Quote not accessible' }), { status:403, headers });
  // Explicit ownership check
  if (quote.company_id !== userCompanyId) return new Response(JSON.stringify({ error: 'Forbidden: quote belongs to another company' }), { status:403, headers });
    
    // Allow conversion if accepted OR if it is a rectification quote (internal workflow)
    if (quote.status !== 'accepted' && !quote.rectifies_invoice_id) {
      return new Response(JSON.stringify({ error: 'Solo se pueden convertir presupuestos aceptados' }), { status:400, headers });
    }

    // If already linked to an invoice, behave idempotently: return existing invoice
    if (quote.invoice_id) {
      const { data: existingInv } = await sb
        .from('invoices')
        .select('id, invoice_series, invoice_number')
        .eq('id', quote.invoice_id as string)
        .maybeSingle();
      const invoiceNumber = existingInv ? `${existingInv.invoice_series}-${existingInv.invoice_number}` : undefined;
      return new Response(JSON.stringify({ ok: true, invoice_id: quote.invoice_id, invoice_number: invoiceNumber, already_existed: true }), { status:200, headers });
    }

    // Extra guard: if an invoice already exists pointing to this quote, return it
    const { data: existingBySource } = await sb
      .from('invoices')
      .select('id, invoice_series, invoice_number')
      .eq('source_quote_id', quote_id)
      .maybeSingle();
    if (existingBySource) {
      return new Response(JSON.stringify({ ok: true, invoice_id: existingBySource.id, invoice_number: `${existingBySource.invoice_series}-${existingBySource.invoice_number}`, already_existed: true }), { status:200, headers });
    }

    // Resolve current app user (public.users) for created_by FK
    const { data: authUser } = await sb.auth.getUser();
    const sessionUserId = authUser?.user?.id || null;
    let appUserId: string | null = null;
    if (sessionUserId) {
      const { data: appUser } = await sb
        .from('users')
        .select('id')
        .eq('auth_user_id', sessionUserId)
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
    const { data: seriesRow, error: serErr } = await admin
      .from('invoice_series')
      .select('year, series_code, verifactu_enabled, company_id')
      .eq('id', seriesId)
      .single();
    if (serErr || !seriesRow) return new Response(JSON.stringify({ error: 'Serie no encontrada' }), { status:400, headers });
    if (seriesRow.company_id !== quote.company_id) return new Response(JSON.stringify({ error: 'Serie de facturas no pertenece a la empresa del presupuesto' }), { status:403, headers });
    const invoiceSeriesLabel = `${seriesRow.year}-${seriesRow.series_code}`;

    // Get next invoice number (text, zero-padded)
    const { data: nextNumber, error: numErr } = await sb.rpc('get_next_invoice_number', { p_series_id: seriesId });
    if (numErr || !nextNumber) return new Response(JSON.stringify({ error: 'No se pudo generar el siguiente número de factura', details: numErr?.message }), { status:400, headers });

    // Create invoice
    let invoiceId: string;
    {
      const { data: invoiceRow, error: invErr } = await sb
        .from('invoices')
        .insert({
          company_id: quote.company_id,
          client_id: quote.client_id,
          series_id: seriesId,
          invoice_number: nextNumber,
          invoice_series: invoiceSeriesLabel,
          invoice_type: quote.rectifies_invoice_id ? 'rectificative' : 'normal',
          rectifies_invoice_id: quote.rectifies_invoice_id || null,
          invoice_date: new Date().toISOString().slice(0,10),
          due_date: new Date(Date.now()+30*24*3600*1000).toISOString().slice(0,10),
          subtotal: quote.subtotal,
          tax_amount: quote.tax_amount,
          total: quote.total_amount,
          currency: quote.currency,
          status: 'draft',
          notes: `Generada desde presupuesto: ${quote.full_quote_number || ''}` + (quote.notes ? `\n\n${quote.notes}` : ''),
          created_by: appUserId,
          source_quote_id: quote_id
        })
        .select('id')
        .single();

      if (invErr || !invoiceRow?.id) {
        // Unique violation on source_quote_id → another request created it first: fetch and return existing
        const isUnique = (invErr as any)?.code === '23505' || /duplicate key|unique/i.test((invErr as any)?.message || '');
        if (isUnique) {
          const { data: existing } = await sb
            .from('invoices')
            .select('id, invoice_series, invoice_number')
            .eq('source_quote_id', quote_id)
            .maybeSingle();
          if (existing?.id) {
            // Ensure quote points to it (idempotent update)
            await sb.from('quotes').update({ invoice_id: existing.id, status: 'invoiced', invoiced_at: new Date().toISOString() }).eq('id', quote_id);
            return new Response(JSON.stringify({ ok: true, invoice_id: existing.id, invoice_number: `${existing.invoice_series}-${existing.invoice_number}`, already_existed: true }), { status:200, headers });
          }
        }
        return new Response(JSON.stringify({ error: 'No se pudo crear la factura', details: invErr?.message }), { status:400, headers });
      }
      invoiceId = invoiceRow.id as string;
    }

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

    // Optional: auto-finalize with VeriFactu
    let finalizeOk = false; let finalizeError: string | null = null;
    const autoFinalize = (Deno.env.get('VERIFACTU_AUTO_FINALIZE')||'false').toLowerCase()==='true';
    if (autoFinalize && (seriesRow as any)?.verifactu_enabled) {
      try {
        const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
        if (serviceRole) {
          const adminFin = createClient(url, serviceRole, { auth: { persistSession:false } });
          const { error: finErr } = await adminFin.rpc('finalize_invoice', { p_invoice_id: invoiceId, p_series: seriesRow.series_code, p_device_id: null, p_software_id: null });
          if (!finErr) finalizeOk = true; else finalizeError = finErr.message || 'finalize_error';
        }
      } catch(e){ finalizeError = (e?.message || String(e)); }
    }

    return new Response(JSON.stringify({ ok: true, invoice_id: invoiceId, invoice_number: `${invoiceSeriesLabel}-${nextNumber}`, finalizeOk, finalizeError }), { status:200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers });
  }
});
