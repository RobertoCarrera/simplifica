// @ts-nocheck
// Edge Function: quotes-pdf
// Purpose: Generate a pretty PDF for a quote and store in Supabase Storage, returning a signed URL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return { 'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Vary':'Origin' } as Record<string,string>;
}

const A4 = { width: 595.28, height: 841.89 };

function money(v: number | null | undefined, currency='EUR'){
  const n = typeof v === 'number' ? v : 0;
  return new Intl.NumberFormat('es-ES',{ style:'currency', currency }).format(n);
}

function drawText(page:any, text:string, x:number, y:number, font:any, size=10, color=rgb(0,0,0)){
  page.drawText(text ?? '', { x, y, size, font, color });
}

async function renderQuotePdf(ctx: { quote:any, items:any[], client:any, company:any }){
  const { quote, items, client, company } = ctx;
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 36; let y = A4.height - margin;

  // Header
  drawText(page, company?.name || 'Empresa', margin, y, bold, 18);
  drawText(page, `Presupuesto ${quote?.full_quote_number || quote?.quote_number || ''}`.trim(), A4.width - margin - 220, y, bold, 16);
  y -= 20;
  drawText(page, `Fecha: ${quote?.quote_date ?? ''}`, A4.width - margin - 220, y, font, 10, rgb(0.2,0.2,0.2));
  y -= 24;

  // Seller / Client
  drawText(page, 'Emisor', margin, y, bold, 12); y -= 14;
  drawText(page, company?.name ?? '', margin, y, font, 10); y -= 12;
  if (company?.settings?.fiscal_address){ drawText(page, String(company.settings.fiscal_address), margin, y, font, 10); y -= 12; }

  let rightY = A4.height - margin - 44;
  drawText(page, 'Cliente', A4.width/2, rightY, bold, 12); rightY -= 14;
  drawText(page, client?.name ?? '', A4.width/2, rightY, font, 10); rightY -= 12;
  const cAddr = client?.address?.line1 || client?.address?.street || client?.address_text || '';
  if (cAddr){ drawText(page, String(cAddr), A4.width/2, rightY, font, 10); rightY -= 12; }

  // Items table
  y -= 20;
  const tableX = margin;
  const tableW = { desc: 280, qty: 50, unit: 80, tax: 50, total: 90 };
  drawText(page, 'Concepto', tableX, y, bold, 11);
  drawText(page, 'Cant.', tableX + tableW.desc + 8, y, bold, 11);
  drawText(page, 'Precio', tableX + tableW.desc + tableW.qty + 16, y, bold, 11);
  drawText(page, 'IVA', tableX + tableW.desc + tableW.qty + tableW.unit + 24, y, bold, 11);
  drawText(page, 'Importe', tableX + tableW.desc + tableW.qty + tableW.unit + tableW.tax + 32, y, bold, 11);
  y -= 12;
  page.drawLine({ start:{ x:margin, y }, end:{ x:A4.width - margin, y }, thickness:0.5, color: rgb(0.8,0.8,0.8) });
  y -= 8;

  const rowH = 14;
  for (const it of items || []){
    if (y < margin + 160){
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - margin;
      drawText(page, 'Continuación', margin, y, bold, 12); y -= 20;
    }
    const desc = it.description ?? '';
    const qty = Number(it.quantity ?? 1);
    const unit = Number(it.unit_price ?? it.price ?? 0);
    const tax = Number(it.tax_rate ?? 0);
    const total = Number(it.total ?? (qty * unit * (1 + tax/100)));
    drawText(page, String(desc).slice(0,120), tableX, y, font, 10);
    drawText(page, `${qty}`, tableX + tableW.desc + 8, y, font, 10);
    drawText(page, money(unit, quote?.currency), tableX + tableW.desc + tableW.qty + 16, y, font, 10);
    drawText(page, `${tax}%`, tableX + tableW.desc + tableW.qty + tableW.unit + 24, y, font, 10);
    drawText(page, money(total, quote?.currency), tableX + tableW.desc + tableW.qty + tableW.unit + tableW.tax + 32, y, font, 10);
    y -= rowH;
  }

  // Totals
  y -= 8;
  page.drawLine({ start:{ x:margin, y }, end:{ x:A4.width - margin, y }, thickness:0.5, color: rgb(0.8,0.8,0.8) });
  y -= 12;
  const totalsX = A4.width - margin - 200;
  drawText(page, 'Subtotal:', totalsX, y, bold, 11); drawText(page, money(quote?.subtotal, quote?.currency), totalsX + 100, y, font, 11); y -= 14;
  drawText(page, 'Impuestos:', totalsX, y, bold, 11); drawText(page, money(quote?.tax_amount, quote?.currency), totalsX + 100, y, font, 11); y -= 14;
  page.drawLine({ start:{ x:totalsX, y }, end:{ x: totalsX + 180, y }, thickness:0.8, color: rgb(0.2,0.2,0.2) });
  y -= 10;
  drawText(page, 'Total:', totalsX, y, bold, 13); drawText(page, money(quote?.total_amount, quote?.currency), totalsX + 100, y, bold, 13);

  // Footer
  y -= 20;
  drawText(page, 'Condiciones y notas', margin, y, bold, 11); y -= 12;
  const notes = quote?.terms_conditions || quote?.notes || '';
  if (notes) drawText(page, String(notes).slice(0,300), margin, y, font, 9, rgb(0.25,0.25,0.25));

  return await pdf.save();
}

serve(async (req)=>{
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error:'Method not allowed'}), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers:{...headers,'Content-Type':'application/json'}});

    const url = new URL(req.url);
    const quoteId = url.searchParams.get('quote_id');
    const force = url.searchParams.get('force') === '1';
    const download = url.searchParams.get('download') === '1';
    if (!quoteId) return new Response(JSON.stringify({ error:'quote_id required'}), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')||'';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')||'';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY envs' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }

    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession:false }, global:{ headers:{ Authorization: `Bearer ${token}` }}});
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false }});

    // Load quote & context using user-scoped client (RLS)
    const { data: quote, error: qErr } = await user.from('quotes').select('*').eq('id', quoteId).maybeSingle();
    if (qErr || !quote) return new Response(JSON.stringify({ error: qErr?.message || 'Quote not found' }), { status:404, headers:{...headers,'Content-Type':'application/json'}});
    const { data: items, error: itErr } = await user.from('quote_items').select('*').eq('quote_id', quoteId).order('line_number', { ascending: true });
    if (itErr) return new Response(JSON.stringify({ error: itErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    const { data: client, error: clErr } = await user.from('clients').select('*').eq('id', quote.client_id).maybeSingle();
    if (clErr) return new Response(JSON.stringify({ error: clErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    const { data: company, error: coErr } = await user.from('companies').select('*').eq('id', quote.company_id).maybeSingle();
    if (coErr) return new Response(JSON.stringify({ error: coErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    const companyId = quote.company_id;
    const bucket = Deno.env.get('QUOTE_PDF_BUCKET') || 'quotes';
    const fileName = `${quote.full_quote_number || quote.quote_number || quote.id}.pdf`;
    const path = `${companyId}/${fileName}`;

    if (!force){
      const { data: exists } = await admin.storage.from(bucket).list(`${companyId}`, { search: fileName });
      if ((exists || []).find(f => f.name === fileName)){
        const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(path, 60*60*24*30);
        if (signErr) return new Response(JSON.stringify({ error: signErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
        if (download){
          const { data: fileData, error: dlErr } = await admin.storage.from(bucket).download(path);
          if (dlErr) return new Response(JSON.stringify({ error: dlErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
          return new Response(fileData, { status:200, headers: { ...headers, 'Content-Type':'application/pdf', 'Content-Disposition': `inline; filename="${fileName}"` }});
        }
        return new Response(JSON.stringify({ ok:true, cached:true, url: signed.signedUrl, path }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
      }
    }

    const pdfBytes = await renderQuotePdf({ quote, items, client, company });
    const { error: upErr } = await admin.storage.from(bucket).upload(path, new Blob([pdfBytes], { type:'application/pdf' }), { contentType:'application/pdf', upsert:true });
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(path, 60*60*24*30);
    if (signErr) return new Response(JSON.stringify({ error: signErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});

    if (download){
      return new Response(pdfBytes, { status:200, headers: { ...headers, 'Content-Type':'application/pdf', 'Content-Disposition': `inline; filename="${fileName}"` }});
    }
    return new Response(JSON.stringify({ ok:true, cached:false, url: signed.signedUrl, path }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});
