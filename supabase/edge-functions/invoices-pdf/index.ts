// @ts-nocheck
// Edge Function: invoices-pdf
// Purpose: Generate a real PDF for an invoice, render QR (vector), and store in Supabase Storage, returning a signed URL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import qrcodeGenerator from "https://esm.sh/qrcode-generator@1.4.4";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return { 'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Vary':'Origin' } as Record<string,string>;
}

const A4 = { width: 595.28, height: 841.89 }; // points

function formatMoney(value: number | null | undefined, currency = 'EUR'){
  const v = typeof value === 'number' ? value : 0;
  return new Intl.NumberFormat('es-ES', { style:'currency', currency }).format(v);
}

function drawTextLine(page: any, text: string, x: number, y: number, font: any, size = 10, color = rgb(0,0,0)){
  page.drawText(text ?? '', { x, y, size, font, color });
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
  const page = pdf.addPage([A4.width, A4.height]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 36; // 0.5 inch
  let cursorY = A4.height - margin;

  // Header
  drawTextLine(page, company?.name || 'Empresa', margin, cursorY, bold, 18);
  drawTextLine(page, `Factura ${invoice?.full_invoice_number || `${invoice?.invoice_series || meta?.series}-${invoice?.invoice_number || meta?.number}`}`.trim(), A4.width - margin - 200, cursorY, bold, 16);
  cursorY -= 20;
  drawTextLine(page, `Fecha: ${invoice?.invoice_date ?? ''}` , A4.width - margin - 200, cursorY, font, 10, rgb(0.2,0.2,0.2));
  cursorY -= 24;

  // Seller and Client blocks
  drawTextLine(page, 'Emisor', margin, cursorY, bold, 12); cursorY -= 14;
  drawTextLine(page, company?.name ?? '', margin, cursorY, font, 10); cursorY -= 12;
  if (company?.settings?.fiscal_address){
    drawTextLine(page, company.settings.fiscal_address, margin, cursorY, font, 10); cursorY -= 12;
  }

  let rightY = A4.height - margin - 44;
  drawTextLine(page, 'Cliente', A4.width/2, rightY, bold, 12); rightY -= 14;
  drawTextLine(page, client?.name ?? '', A4.width/2, rightY, font, 10); rightY -= 12;
  const clientAddr = client?.address?.line1 || client?.address?.street || client?.address_text || '';
  if (clientAddr){ drawTextLine(page, String(clientAddr), A4.width/2, rightY, font, 10); rightY -= 12; }

  // QR code (top-right)
  const qrText = meta?.qr_payload || `SERIE:${meta?.series}|NUM:${meta?.number}|HASH:${meta?.chained_hash}`;
  const qrSize = 120;
  drawQRCode(page, A4.width - margin - qrSize, A4.height - margin - qrSize, qrSize, qrText);

  // Items table header
  cursorY -= 20;
  const tableX = margin;
  const tableWidths = { desc: 260, qty: 50, unit: 80, tax: 50, total: 90 };
  drawTextLine(page, 'Concepto', tableX, cursorY, bold, 11); 
  drawTextLine(page, 'Cant.', tableX + tableWidths.desc + 8, cursorY, bold, 11);
  drawTextLine(page, 'Precio', tableX + tableWidths.desc + tableWidths.qty + 16, cursorY, bold, 11);
  drawTextLine(page, 'IVA', tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + 24, cursorY, bold, 11);
  drawTextLine(page, 'Importe', tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + tableWidths.tax + 32, cursorY, bold, 11);
  cursorY -= 12;
  page.drawLine({ start: { x: margin, y: cursorY }, end: { x: A4.width - margin, y: cursorY }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
  cursorY -= 8;

  // Items rows (simple pagination: new page if near bottom)
  const rowH = 14;
  for (const it of items ?? []){
    if (cursorY < margin + 160){
      // totals area reserve; add new page
      const next = pdf.addPage([A4.width, A4.height]);
      cursorY = A4.height - margin;
      drawTextLine(next, 'Continuación', margin, cursorY, bold, 12); cursorY -= 20;
      page = next; // switch context
    }
    const desc = it.description ?? '';
    const qty = Number(it.quantity ?? 1);
    const unit = Number((it.unit_price ?? it.price) ?? 0);
    const tax = Number((it.tax_rate ?? it.vat_rate) ?? invoice?.tax_rate ?? 0);
    const total = Number(it.total ?? (qty * unit * (1 + tax/100)));
    drawTextLine(page, String(desc).slice(0,120), tableX, cursorY, font, 10);
    drawTextLine(page, `${qty}`, tableX + tableWidths.desc + 8, cursorY, font, 10);
    drawTextLine(page, formatMoney(unit, invoice?.currency), tableX + tableWidths.desc + tableWidths.qty + 16, cursorY, font, 10);
    drawTextLine(page, `${tax}%`, tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + 24, cursorY, font, 10);
    drawTextLine(page, formatMoney(total, invoice?.currency), tableX + tableWidths.desc + tableWidths.qty + tableWidths.unit + tableWidths.tax + 32, cursorY, font, 10);
    cursorY -= rowH;
  }

  // Totals block
  cursorY -= 8;
  page.drawLine({ start: { x: margin, y: cursorY }, end: { x: A4.width - margin, y: cursorY }, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
  cursorY -= 12;
  const totalsX = A4.width - margin - 200;
  drawTextLine(page, 'Subtotal:', totalsX, cursorY, bold, 11); drawTextLine(page, formatMoney(invoice?.subtotal, invoice?.currency), totalsX + 100, cursorY, font, 11); cursorY -= 14;
  drawTextLine(page, 'Impuestos:', totalsX, cursorY, bold, 11); drawTextLine(page, formatMoney(invoice?.tax_amount, invoice?.currency), totalsX + 100, cursorY, font, 11); cursorY -= 14;
  page.drawLine({ start: { x: totalsX, y: cursorY }, end: { x: totalsX + 180, y: cursorY }, thickness: 0.8, color: rgb(0.2,0.2,0.2) });
  cursorY -= 10;
  drawTextLine(page, 'Total:', totalsX, cursorY, bold, 13); drawTextLine(page, formatMoney(invoice?.total, invoice?.currency), totalsX + 100, cursorY, bold, 13); cursorY -= 20;

  // Hash chain and footer
  drawTextLine(page, `Cadena: ${meta?.chained_hash || invoice?.verifactu_hash || ''}`, margin, cursorY, font, 8, rgb(0.3,0.3,0.3)); cursorY -= 10;
  drawTextLine(page, `Dispositivo: ${meta?.device_id || ''} • Software: ${meta?.software_id || ''}`, margin, cursorY, font, 8, rgb(0.4,0.4,0.4)); cursorY -= 10;
  drawTextLine(page, `QR esquema: ${meta?.qr_payload ? 'incluido' : 'no-disponible'}`, margin, cursorY, font, 8, rgb(0.4,0.4,0.4));

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
    const { data: meta, error: metaErr } = await user.from('verifactu.invoice_meta').select('*').eq('invoice_id', invoiceId).maybeSingle();
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
