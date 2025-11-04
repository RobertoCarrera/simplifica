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
const PRIMARY_COLOR = rgb(0.2, 0.4, 0.8); // Azul corporativo
const SECONDARY_COLOR = rgb(0.95, 0.95, 0.97); // Gris muy claro para fondos
const TEXT_DARK = rgb(0.15, 0.15, 0.15);
const TEXT_LIGHT = rgb(0.45, 0.45, 0.45);

function money(v: number | null | undefined, currency='EUR'){
  const n = typeof v === 'number' ? v : 0;
  return new Intl.NumberFormat('es-ES',{ style:'currency', currency }).format(n);
}

function drawText(page:any, text:string, x:number, y:number, font:any, size=10, color=rgb(0,0,0)){
  page.drawText(text ?? '', { x, y, size, font, color });
}

function drawTextRight(page:any, text:string, x:number, y:number, font:any, size=10, color=rgb(0,0,0)){
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text ?? '', { x: x - width, y, size, font, color });
}

async function renderQuotePdf(ctx: { quote:any, items:any[], client:any, company:any }){
  const { quote, items, client, company } = ctx;
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  let y = A4.height - margin;

  // Header bar con color corporativo
  page.drawRectangle({
    x: 0,
    y: A4.height - 80,
    width: A4.width,
    height: 80,
    color: PRIMARY_COLOR,
  });

  // Título en blanco sobre la banda azul
  drawText(page, company?.name || 'Empresa', margin, A4.height - 45, bold, 20, rgb(1, 1, 1));
  
  // Número de presupuesto - derecha
  const quoteNum = `Presupuesto ${quote?.full_quote_number || quote?.quote_number || ''}`.trim();
  drawTextRight(page, quoteNum, A4.width - margin, A4.height - 45, bold, 18, rgb(1, 1, 1));
  
  // Fecha - debajo del número
  drawTextRight(page, `Fecha: ${quote?.quote_date ?? ''}`, A4.width - margin, A4.height - 65, font, 10, rgb(0.9, 0.9, 0.9));

  y = A4.height - 100;

  // Emisor y Cliente en cajas con fondo claro
  const boxY = y - 10;
  const boxHeight = 70;
  
  // Caja Emisor
  page.drawRectangle({
    x: margin,
    y: boxY - boxHeight,
    width: 220,
    height: boxHeight,
    color: SECONDARY_COLOR,
    borderColor: rgb(0.85, 0.85, 0.87),
    borderWidth: 1,
  });
  
  drawText(page, 'EMISOR', margin + 10, boxY - 18, bold, 10, PRIMARY_COLOR);
  drawText(page, company?.name ?? '', margin + 10, boxY - 33, bold, 11, TEXT_DARK);
  if (company?.settings?.fiscal_address){
    const addr = String(company.settings.fiscal_address);
    drawText(page, addr.slice(0, 35), margin + 10, boxY - 48, font, 9, TEXT_LIGHT);
    if (addr.length > 35) drawText(page, addr.slice(35, 70), margin + 10, boxY - 60, font, 9, TEXT_LIGHT);
  }

  // Caja Cliente
  const clientX = A4.width - margin - 220;
  page.drawRectangle({
    x: clientX,
    y: boxY - boxHeight,
    width: 220,
    height: boxHeight,
    color: SECONDARY_COLOR,
    borderColor: rgb(0.85, 0.85, 0.87),
    borderWidth: 1,
  });
  
  drawText(page, 'CLIENTE', clientX + 10, boxY - 18, bold, 10, PRIMARY_COLOR);
  drawText(page, client?.name ?? '', clientX + 10, boxY - 33, bold, 11, TEXT_DARK);
  const cAddr = client?.address?.line1 || client?.address?.street || client?.address_text || '';
  if (cAddr){
    const addr = String(cAddr);
    drawText(page, addr.slice(0, 35), clientX + 10, boxY - 48, font, 9, TEXT_LIGHT);
    if (addr.length > 35) drawText(page, addr.slice(35, 70), clientX + 10, boxY - 60, font, 9, TEXT_LIGHT);
  }

  y = boxY - boxHeight - 30;

  // Tabla de conceptos con cabecera destacada
  const tableX = margin;
  const tableW = { desc: 265, qty: 45, unit: 75, tax: 45, total: 85 };
  const headerY = y;
  
  // Fondo de cabecera
  page.drawRectangle({
    x: tableX - 5,
    y: headerY - 5,
    width: A4.width - (2 * margin) + 10,
    height: 20,
    color: SECONDARY_COLOR,
  });

  drawText(page, 'Concepto', tableX, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'Cant.', tableX + tableW.desc + tableW.qty, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'Precio', tableX + tableW.desc + tableW.qty + tableW.unit, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'IVA', tableX + tableW.desc + tableW.qty + tableW.unit + tableW.tax, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'Importe', tableX + tableW.desc + tableW.qty + tableW.unit + tableW.tax + tableW.total, headerY, bold, 10, TEXT_DARK);
  
  y -= 20;
  page.drawLine({ start:{ x:margin, y }, end:{ x:A4.width - margin, y }, thickness: 1.5, color: PRIMARY_COLOR });
  y -= 10;

  const rowH = 16;
  let rowIndex = 0;
  for (const it of items || []){
    if (y < margin + 180){
      page = pdf.addPage([A4.width, A4.height]);
      y = A4.height - margin - 20;
      drawText(page, 'Continuación', margin, y, bold, 11, TEXT_LIGHT);
      y -= 30;
    }
    
    // Fila alternada (zebra striping)
    if (rowIndex % 2 === 0){
      page.drawRectangle({
        x: tableX - 5,
        y: y - 4,
        width: A4.width - (2 * margin) + 10,
        height: rowH,
        color: rgb(0.98, 0.98, 0.99),
      });
    }
    
    const desc = it.description ?? '';
    const qty = Number(it.quantity ?? 1);
    const unit = Number(it.unit_price ?? it.price ?? 0);
    const tax = Number(it.tax_rate ?? 0);
    const total = Number(it.total ?? (qty * unit * (1 + tax/100)));
    
    drawText(page, String(desc).slice(0, 45), tableX, y, font, 9, TEXT_DARK);
    drawTextRight(page, `${qty}`, tableX + tableW.desc + tableW.qty, y, font, 9, TEXT_DARK);
    drawTextRight(page, money(unit, quote?.currency), tableX + tableW.desc + tableW.qty + tableW.unit, y, font, 9, TEXT_DARK);
    drawTextRight(page, `${tax}%`, tableX + tableW.desc + tableW.qty + tableW.unit + tableW.tax, y, font, 9, TEXT_DARK);
    drawTextRight(page, money(total, quote?.currency), tableX + tableW.desc + tableW.qty + tableW.unit + tableW.tax + tableW.total, y, bold, 9, TEXT_DARK);
    
    y -= rowH;
    rowIndex++;
  }

  // Totales con fondo y destacados
  y -= 10;
  page.drawLine({ start:{ x:margin, y }, end:{ x:A4.width - margin, y }, thickness: 1, color: rgb(0.7,0.7,0.7) });
  y -= 20;
  
  const totalsX = A4.width - margin - 200;
  const totalsBoxX = totalsX - 15;
  
  page.drawRectangle({
    x: totalsBoxX,
    y: y - 60,
    width: 215,
    height: 70,
    color: SECONDARY_COLOR,
    borderColor: rgb(0.85, 0.85, 0.87),
    borderWidth: 1,
  });
  
  drawText(page, 'Subtotal:', totalsX, y, font, 10, TEXT_DARK);
  drawTextRight(page, money(quote?.subtotal, quote?.currency), totalsX + 190, y, font, 10, TEXT_DARK);
  y -= 18;
  
  drawText(page, 'Impuestos:', totalsX, y, font, 10, TEXT_DARK);
  drawTextRight(page, money(quote?.tax_amount, quote?.currency), totalsX + 190, y, font, 10, TEXT_DARK);
  y -= 22;
  
  const lineY = y + 2;
  page.drawLine({ start:{ x:totalsX, y: lineY }, end:{ x: totalsX + 190, y: lineY }, thickness: 1.5, color: PRIMARY_COLOR });
  y -= 5;
  
  drawText(page, 'TOTAL:', totalsX, y, bold, 13, PRIMARY_COLOR);
  drawTextRight(page, money(quote?.total_amount, quote?.currency), totalsX + 190, y, bold, 13, PRIMARY_COLOR);

  // Footer con notas
  y -= 35;
  if (y > margin + 40) {
    const notes = quote?.terms_conditions || quote?.notes || '';
    if (notes) {
      page.drawLine({ start:{ x:margin, y }, end:{ x:A4.width - margin, y }, thickness: 0.5, color: rgb(0.85,0.85,0.85) });
      y -= 15;
      drawText(page, 'Condiciones y notas', margin, y, bold, 10, TEXT_DARK);
      y -= 14;
      
      // Dividir notas en líneas
      const maxChars = 95;
      const noteLines = [];
      let remaining = String(notes);
      while (remaining.length > 0 && noteLines.length < 4) {
        noteLines.push(remaining.slice(0, maxChars));
        remaining = remaining.slice(maxChars);
      }
      
      for (const line of noteLines) {
        drawText(page, line, margin, y, font, 8, TEXT_LIGHT);
        y -= 11;
      }
    }
  }

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
