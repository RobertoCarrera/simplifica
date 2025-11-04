// @ts-nocheck
// Edge Function: invoices-pdf
// Purpose: Generate a real PDF for an invoice, render QR (vector), and store in Supabase Storage, returning a signed URL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import qrcodeGenerator from "https://esm.sh/qrcode-generator@1.4.4";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': (isAllowed && origin) ? origin : (allowAll ? '*' : ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  } as Record<string,string>;
}

const A4 = { width: 595.28, height: 841.89 }; // points
const PRIMARY_COLOR = rgb(0.2, 0.4, 0.8); // Azul corporativo
const SECONDARY_COLOR = rgb(0.95, 0.95, 0.97); // Gris muy claro para fondos
const TEXT_DARK = rgb(0.15, 0.15, 0.15);
const TEXT_LIGHT = rgb(0.45, 0.45, 0.45);

function formatMoney(value: number | null | undefined, currency = 'EUR'){
  const v = typeof value === 'number' ? value : 0;
  return new Intl.NumberFormat('es-ES', { style:'currency', currency }).format(v);
}

function drawTextLine(page: any, text: string, x: number, y: number, font: any, size = 10, color = rgb(0,0,0)){
  page.drawText(text ?? '', { x, y, size, font, color });
}

function drawTextRight(page: any, text: string, x: number, y: number, font: any, size = 10, color = rgb(0,0,0)){
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text ?? '', { x: x - width, y, size, font, color });
}

function drawQRCode(page: any, x: number, y: number, size: number, text: string){
  const qr = qrcodeGenerator(0, 'M');
  qr.addData(text || '');
  qr.make();
  const modules = qr.getModuleCount();
  const cell = size / modules;
  const dark = rgb(0,0,0);
  for (let r=0; r<modules; r++){
    for (let c=0; c<modules; c++){
      if (qr.isDark(r, c)){
        page.drawRectangle({ x: x + c*cell, y: y + (modules-1-r)*cell, width: cell, height: cell, color: dark });
      }
    }
  }
}

async function renderInvoicePdf(payload: { invoice: any, items: any[], client: any, company: any, meta: any }){
  const { invoice, items, client, company, meta } = payload;
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  let cursorY = A4.height - margin;

  // Header bar con color corporativo
  page.drawRectangle({
    x: 0,
    y: A4.height - 80,
    width: A4.width,
    height: 80,
    color: PRIMARY_COLOR,
  });

  // Título en blanco sobre la banda azul
  drawTextLine(page, company?.name || 'Empresa', margin, A4.height - 45, bold, 20, rgb(1, 1, 1));
  
  // Número de factura - derecha
  const invoiceNum = `Factura ${invoice?.full_invoice_number || `${invoice?.invoice_series || meta?.series}-${invoice?.invoice_number || meta?.number}`}`.trim();
  drawTextRight(page, invoiceNum, A4.width - margin, A4.height - 45, bold, 18, rgb(1, 1, 1));
  
  // Fecha - debajo del número
  drawTextRight(page, `Fecha: ${invoice?.invoice_date ?? ''}`, A4.width - margin, A4.height - 65, font, 10, rgb(0.9, 0.9, 0.9));
  // Fecha de operación (si difiere)
  if (invoice?.operation_date && invoice.operation_date !== invoice?.invoice_date) {
    drawTextRight(page, `Fecha operación: ${invoice.operation_date}`, A4.width - margin, A4.height - 80, font, 10, rgb(0.9, 0.9, 0.9));
  }

  cursorY = A4.height - 100;

  // QR code VeriFactu (top-right, debajo del header)
  const qrText = meta?.qr_payload || `SERIE:${meta?.series}|NUM:${meta?.number}|HASH:${meta?.chained_hash}`;
  const qrSize = 90;
  const qrX = A4.width - margin - qrSize - 10;
  const qrY = cursorY - qrSize - 5;
  
  // Fondo blanco para el QR
  page.drawRectangle({
    x: qrX - 5,
    y: qrY - 5,
    width: qrSize + 10,
    height: qrSize + 10,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.85, 0.85, 0.87),
    borderWidth: 1,
  });
  drawQRCode(page, qrX, qrY, qrSize, qrText);

  // Emisor y Cliente en cajas con fondo claro
  const boxY = cursorY - 10;
  const boxHeight = 85;
  
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
  
  drawTextLine(page, 'EMISOR', margin + 10, boxY - 18, bold, 10, PRIMARY_COLOR);
  drawTextLine(page, company?.name ?? '', margin + 10, boxY - 33, bold, 11, TEXT_DARK);
  const companyNif = company?.nif || company?.vat_number || company?.tax_id || company?.cif || company?.vat || null;
  if (companyNif) {
    drawTextLine(page, `NIF: ${companyNif}`, margin + 10, boxY - 46, font, 9, TEXT_LIGHT);
  }
  if (company?.settings?.fiscal_address){
    const addr = String(company.settings.fiscal_address);
    drawTextLine(page, addr.slice(0, 45), margin + 10, boxY - 61, font, 9, TEXT_LIGHT);
    if (addr.length > 45) drawTextLine(page, addr.slice(45, 90), margin + 10, boxY - 73, font, 9, TEXT_LIGHT);
  }

  // Caja Cliente
  const clientX = margin + 240;
  page.drawRectangle({
    x: clientX,
    y: boxY - boxHeight,
    width: 220,
    height: boxHeight,
    color: SECONDARY_COLOR,
    borderColor: rgb(0.85, 0.85, 0.87),
    borderWidth: 1,
  });
  
  drawTextLine(page, 'CLIENTE', clientX + 10, boxY - 18, bold, 10, PRIMARY_COLOR);
  drawTextLine(page, client?.name ?? '', clientX + 10, boxY - 33, bold, 11, TEXT_DARK);
  const clientNif = client?.nif || client?.vat_number || client?.tax_id || client?.cif || client?.vat || null;
  if (clientNif) {
    drawTextLine(page, `NIF: ${clientNif}`, clientX + 10, boxY - 46, font, 9, TEXT_LIGHT);
  }
  const clientAddr = client?.address?.line1 || client?.address?.street || client?.address_text || '';
  if (clientAddr){
    const addr = String(clientAddr);
    drawTextLine(page, addr.slice(0, 45), clientX + 10, boxY - 61, font, 9, TEXT_LIGHT);
    if (addr.length > 45) drawTextLine(page, addr.slice(45, 90), clientX + 10, boxY - 73, font, 9, TEXT_LIGHT);
  }

  cursorY = boxY - boxHeight - 30;

  // Tabla de conceptos con cabecera destacada
  const tableX = margin;
  const tableWidths = { desc: 250, qty: 45, unit: 75, tax: 45, total: 85 };
  const headerY = cursorY;
  
  // Fondo de cabecera
  page.drawRectangle({
    x: tableX - 5,
    y: headerY - 5,
    width: A4.width - (2 * margin) + 10,
    height: 20,
    color: SECONDARY_COLOR,
  });

  drawTextLine(page, 'Concepto', tableX, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'Cant.', tableX + tableWidths.desc + tableWidths.qty, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'Precio', tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'IVA', tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + tableWidths.tax, headerY, bold, 10, TEXT_DARK);
  drawTextRight(page, 'Importe', tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + tableWidths.tax + tableWidths.total, headerY, bold, 10, TEXT_DARK);
  
  cursorY -= 20;
  page.drawLine({ start: { x: margin, y: cursorY }, end: { x: A4.width - margin, y: cursorY }, thickness: 1.5, color: PRIMARY_COLOR });
  cursorY -= 10;

  // Items rows con zebra striping
  const rowH = 16;
  let rowIndex = 0;
  for (const it of items ?? []){
    if (cursorY < margin + 200){
      // totals area reserve; add new page
      page = pdf.addPage([A4.width, A4.height]);
      cursorY = A4.height - margin - 20;
      drawTextLine(page, 'Continuación', margin, cursorY, bold, 11, TEXT_LIGHT);
      cursorY -= 30;
    }
    
    // Fila alternada (zebra striping)
    if (rowIndex % 2 === 0){
      page.drawRectangle({
        x: tableX - 5,
        y: cursorY - 4,
        width: A4.width - (2 * margin) + 10,
        height: rowH,
        color: rgb(0.98, 0.98, 0.99),
      });
    }
    
    const desc = it.description ?? '';
    const qty = Number(it.quantity ?? 1);
    const unit = Number((it.unit_price ?? it.price) ?? 0);
    const tax = Number((it.tax_rate ?? it.vat_rate) ?? invoice?.tax_rate ?? 0);
    const total = Number(it.total ?? (qty * unit * (1 + tax/100)));
    
    drawTextLine(page, String(desc).slice(0, 42), tableX, cursorY, font, 9, TEXT_DARK);
    drawTextRight(page, `${qty}`, tableX + tableWidths.desc + tableWidths.qty, cursorY, font, 9, TEXT_DARK);
    drawTextRight(page, formatMoney(unit, invoice?.currency), tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit, cursorY, font, 9, TEXT_DARK);
    drawTextRight(page, `${tax}%`, tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + tableWidths.tax, cursorY, font, 9, TEXT_DARK);
    drawTextRight(page, formatMoney(total, invoice?.currency), tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + tableWidths.tax + tableWidths.total, cursorY, bold, 9, TEXT_DARK);
    
    cursorY -= rowH;
    rowIndex++;
  }

  // Totales con fondo y destacados
  cursorY -= 10;
  page.drawLine({ start: { x: margin, y: cursorY }, end: { x: A4.width - margin, y: cursorY }, thickness: 1, color: rgb(0.7,0.7,0.7) });
  cursorY -= 20;
  
  const totalsX = A4.width - margin - 200;
  const totalsBoxX = totalsX - 15;
  
  page.drawRectangle({
    x: totalsBoxX,
    y: cursorY - 60,
    width: 215,
    height: 70,
    color: SECONDARY_COLOR,
    borderColor: rgb(0.85, 0.85, 0.87),
    borderWidth: 1,
  });
  
  drawTextLine(page, 'Subtotal:', totalsX, cursorY, font, 10, TEXT_DARK);
  drawTextRight(page, formatMoney(invoice?.subtotal, invoice?.currency), totalsX + 190, cursorY, font, 10, TEXT_DARK);
  cursorY -= 18;
  
  drawTextLine(page, 'Cuota de IVA:', totalsX, cursorY, font, 10, TEXT_DARK);
  drawTextRight(page, formatMoney(invoice?.tax_amount, invoice?.currency), totalsX + 190, cursorY, font, 10, TEXT_DARK);
  cursorY -= 22;
  
  const lineY = cursorY + 2;
  page.drawLine({ start: { x: totalsX, y: lineY }, end: { x: totalsX + 190, y: lineY }, thickness: 1.5, color: PRIMARY_COLOR });
  cursorY -= 5;
  
  drawTextLine(page, 'TOTAL:', totalsX, cursorY, bold, 13, PRIMARY_COLOR);
  drawTextRight(page, formatMoney(invoice?.total, invoice?.currency), totalsX + 190, cursorY, bold, 13, PRIMARY_COLOR);
  cursorY -= 30;

  // Footer VeriFactu con información de trazabilidad
  if (cursorY > margin + 40) {
    page.drawLine({ start: { x: margin, y: cursorY }, end: { x: A4.width - margin, y: cursorY }, thickness: 0.5, color: rgb(0.85,0.85,0.85) });
    cursorY -= 15;
    
    drawTextLine(page, 'Información VeriFactu', margin, cursorY, bold, 9, TEXT_DARK);
    cursorY -= 12;
    
    const hashText = `Hash: ${(meta?.chained_hash || invoice?.verifactu_hash || 'N/A').slice(0, 70)}`;
    drawTextLine(page, hashText, margin, cursorY, font, 7, TEXT_LIGHT);
    cursorY -= 10;
    
    const deviceText = `Dispositivo: ${meta?.device_id || 'N/A'} • Software: ${meta?.software_id || 'N/A'}`;
    drawTextLine(page, deviceText, margin, cursorY, font, 7, TEXT_LIGHT);
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
    const invoiceId = url.searchParams.get('invoice_id');
    const force = url.searchParams.get('force') === '1';
    const download = url.searchParams.get('download') === '1';
    if (!invoiceId) return new Response(JSON.stringify({ error:'invoice_id required'}), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')||'';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')||'';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY envs' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }

    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession:false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false }});

    // Load invoice context via RLS-scoped client
    const { data: invoice, error: invErr } = await user.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
    if (invErr || !invoice) return new Response(JSON.stringify({ error: invErr?.message || 'Invoice not found' }), { status:404, headers:{...headers,'Content-Type':'application/json'}});
    const { data: items, error: itErr } = await user.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('line_order', { ascending: true });
    if (itErr) return new Response(JSON.stringify({ error: itErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    const { data: client, error: clErr } = await user.from('clients').select('*').eq('id', invoice.client_id).maybeSingle();
    if (clErr) return new Response(JSON.stringify({ error: clErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    const { data: company, error: coErr } = await user.from('companies').select('*').eq('id', invoice.company_id).maybeSingle();
    if (coErr) return new Response(JSON.stringify({ error: coErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
  // verifactu schema may not be exposed via PostgREST; read using service role after RLS ownership is confirmed above
  const { data: meta, error: metaErr } = await admin.from('verifactu.invoice_meta').select('*').eq('invoice_id', invoiceId).maybeSingle();
  if (metaErr) return new Response(JSON.stringify({ error: metaErr.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});

    // Compute storage path
    const series = meta?.series || invoice?.invoice_series || 'SER';
    const number = meta?.number || invoice?.invoice_number || '00001';
    const companyId = invoice.company_id;
    const bucket = Deno.env.get('INVOICE_PDF_BUCKET') || 'invoices';
    const path = `${companyId}/${series}/${series}-${number}.pdf`;

    // Short-circuit if already exists and not forced: return signed URL
    if (!force){
      const { data: exists } = await admin.storage.from(bucket).list(`${companyId}/${series}`, { search: `${series}-${number}.pdf` });
      if ((exists || []).find(f => f.name === `${series}-${number}.pdf`)){
        const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(path, 60*60*24*30);
        if (signErr) return new Response(JSON.stringify({ error: signErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
        if (download){
          // Fetch file and stream back as application/pdf
          const { data: fileData, error: dlErr } = await admin.storage.from(bucket).download(path);
          if (dlErr) return new Response(JSON.stringify({ error: dlErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
          return new Response(fileData, { status:200, headers: { ...headers, 'Content-Type':'application/pdf', 'Content-Disposition': `inline; filename="${series}-${number}.pdf"` }});
        }
        return new Response(JSON.stringify({ ok:true, cached:true, url: signed.signedUrl, path }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
      }
    }

    // Render and upload
    const pdfBytes = await renderInvoicePdf({ invoice, items, client, company, meta });
    const { error: upErr } = await admin.storage.from(bucket).upload(path, new Blob([pdfBytes], { type:'application/pdf' }), { contentType:'application/pdf', upsert:true });
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(path, 60*60*24*30);
    if (signErr) return new Response(JSON.stringify({ error: signErr.message }), { status:500, headers:{...headers,'Content-Type':'application/json'}});

    if (download){
      return new Response(pdfBytes, { status:200, headers: { ...headers, 'Content-Type':'application/pdf', 'Content-Disposition': `inline; filename="${series}-${number}.pdf"` }});
    }
    return new Response(JSON.stringify({ ok:true, cached:false, url: signed.signedUrl, path }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});
