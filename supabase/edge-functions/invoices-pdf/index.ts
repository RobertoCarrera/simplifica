// @ts-nocheck
// Edge Function: invoices-pdf
// Purpose: Generate a professional PDF for an invoice with VeriFactu QR using pdfmake
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import pdfMake from "https://esm.sh/pdfmake@0.2.10/build/pdfmake.js";
import pdfFonts from "https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js";
import qrcodeGenerator from "https://esm.sh/qrcode-generator@1.4.4";

pdfMake.vfs = pdfFonts.pdfMake.vfs;

function cors(origin?: string) {
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  } as Record<string, string>;
}

function formatMoney(value: number | null | undefined, currency = 'EUR') {
  const v = typeof value === 'number' ? value : 0;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(v);
}

type TaxSettings = {
  pricesIncludeTax: boolean
  iva_enabled: boolean
  iva_rate: number
  irpf_enabled: boolean
  irpf_rate: number
};

function computeLine(item: any, settings: TaxSettings) {
  const qty = Number(item?.quantity ?? 1);
  const baseUnit = Number(
    item?.unit_price ?? item?.price ?? item?.price_per_unit ?? item?.base_price ?? item?.list_price ?? item?.unitPrice ?? 0
  );
  const discountRaw = item?.discount_percent ?? item?.discount_percentage ?? item?.discount ?? 0;
  const discountPct = isFinite(Number(discountRaw)) ? Number(discountRaw) : 0;
  const taxRate = settings.iva_enabled ? Number(item?.tax_rate ?? item?.vat_rate ?? settings.iva_rate ?? 0) : 0;

  let unitBaseNet: number, unitBaseTax: number, unitBaseGross: number;
  let unitDiscNet: number, unitDiscTax: number, unitDiscGross: number;

  if (settings.pricesIncludeTax) {
    const divisor = 1 + (isFinite(taxRate) ? taxRate : 0) / 100;
    unitBaseGross = baseUnit;
    unitBaseNet = divisor ? baseUnit / divisor : baseUnit;
    unitBaseTax = unitBaseGross - unitBaseNet;

    unitDiscGross = baseUnit * (1 - discountPct / 100);
    unitDiscNet = divisor ? unitDiscGross / divisor : unitDiscGross;
    unitDiscTax = unitDiscGross - unitDiscNet;
  } else {
    unitBaseNet = baseUnit;
    unitBaseTax = unitBaseNet * ((isFinite(taxRate) ? taxRate : 0) / 100);
    unitBaseGross = unitBaseNet + unitBaseTax;

    unitDiscNet = baseUnit * (1 - discountPct / 100);
    unitDiscTax = unitDiscNet * ((isFinite(taxRate) ? taxRate : 0) / 100);
    unitDiscGross = unitDiscNet + unitDiscTax;
  }

  const lineNet = unitDiscNet * qty;
  const lineTax = unitDiscTax * qty;
  const lineGross = unitDiscGross * qty;
  const baseLineNet = unitBaseNet * qty;
  const baseLineGross = unitBaseGross * qty;

  return {
    qty,
    taxRate,
    // Show original unit price
    unitDisplay: settings.pricesIncludeTax ? unitBaseGross : unitBaseNet,
    // Show discounted line amount
    lineDisplay: settings.pricesIncludeTax ? lineGross : lineNet,
    lineNet,
    lineTax,
    lineGross,
    baseLineNet,
    baseLineGross,
  };
}

// Genera el QR code como data URL para pdfmake
function generateQRDataURL(text: string, size = 200): string {
  const qr = qrcodeGenerator(0, 'M');
  qr.addData(text || '');
  qr.make();
  
  const modules = qr.getModuleCount();
  const cellSize = Math.floor(size / modules);
  const actualSize = cellSize * modules;
  
  // Crear un canvas virtual (simple array-based approach)
  const canvas: boolean[][] = [];
  for (let r = 0; r < modules; r++) {
    canvas[r] = [];
    for (let c = 0; c < modules; c++) {
      canvas[r][c] = qr.isDark(r, c);
    }
  }
  
  // Convertir a SVG (más limpio que bitmap)
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${actualSize}" height="${actualSize}" viewBox="0 0 ${modules} ${modules}">`;
  svg += '<rect width="100%" height="100%" fill="white"/>';
  
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (canvas[r][c]) {
        svg += `<rect x="${c}" y="${r}" width="1" height="1" fill="black"/>`;
      }
    }
  }
  svg += '</svg>';
  
  // Convertir SVG a data URL
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function generateInvoicePdf(payload: { invoice: any, items: any[], client: any, company: any, meta: any, settings: TaxSettings }) {
  const { invoice, items, client, company, meta, settings } = payload;

  // Colores corporativos
  const PRIMARY_COLOR = '#3366CC';
  const SECONDARY_COLOR = '#F5F5F7';
  const TEXT_DARK = '#262626';
  const TEXT_LIGHT = '#737373';

  // Número de factura
  const invoiceNum = invoice?.full_invoice_number || 
    `${invoice?.invoice_series || meta?.series}-${invoice?.invoice_number || meta?.number}`;

  // Información del emisor
  const emitterInfo = [];
  if (company?.name) {
    emitterInfo.push({ text: company.name, bold: true, fontSize: 11, margin: [0, 0, 0, 4] });
  }
  
  const companyNif = company?.nif || company?.vat_number || company?.tax_id || company?.cif || company?.vat || null;
  if (companyNif) {
    emitterInfo.push({ text: `NIF: ${companyNif}`, fontSize: 9, color: TEXT_LIGHT });
  }
  
  if (company?.settings?.fiscal_address) {
    emitterInfo.push({ 
      text: String(company.settings.fiscal_address), 
      fontSize: 8, 
      color: TEXT_LIGHT 
    });
  }
  
  if (company?.settings?.phone) {
    emitterInfo.push({ text: `Tel: ${company.settings.phone}`, fontSize: 8, color: TEXT_LIGHT });
  }
  
  if (company?.settings?.email) {
    emitterInfo.push({ text: company.settings.email, fontSize: 8, color: TEXT_LIGHT });
  }

  // Información del cliente
  const clientInfo = [];
  if (client?.name) {
    clientInfo.push({ text: client.name, bold: true, fontSize: 11, margin: [0, 0, 0, 4] });
  }
  
  const clientNif = client?.nif || client?.vat_number || client?.tax_id || client?.cif || client?.vat || null;
  if (clientNif) {
    clientInfo.push({ text: `NIF: ${clientNif}`, fontSize: 9, color: TEXT_LIGHT });
  }
  
  const clientAddr = client?.address?.line1 || client?.address?.street || client?.address_text || '';
  if (clientAddr) {
    clientInfo.push({ text: String(clientAddr), fontSize: 8, color: TEXT_LIGHT });
  }
  
  if (client?.phone) {
    clientInfo.push({ text: `Tel: ${client.phone}`, fontSize: 8, color: TEXT_LIGHT });
  }
  
  if (client?.email) {
    clientInfo.push({ text: client.email, fontSize: 8, color: TEXT_LIGHT });
  }

  // Preparar tabla de items
  const tableBody = [
    // Header
    [
      { text: 'CONCEPTO', style: 'tableHeader', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'CANT.', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'PRECIO', style: 'tableHeader', alignment: 'right', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'IVA', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'DTO', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'IMPORTE', style: 'tableHeader', alignment: 'right', fillColor: PRIMARY_COLOR, color: 'white' }
    ]
  ];

  let subtotalBeforeDiscount = 0; // Suma bruta antes de descuentos
  let discountTotalNet = 0; // Total descontado
  let subtotal = 0; // Base imponible (neto después de descuentos)
  let taxAmount = 0;
  let grossTotal = 0;

  // Items
  (items || []).forEach((it, idx) => {
    const desc = it.description || '';
    const line = computeLine(it, settings);
    const discountShow = isFinite(Number(it?.discount_percent ?? it?.discount_percentage ?? it?.discount))
      ? `${Number(it?.discount_percent ?? it?.discount_percentage ?? it?.discount)}%`
      : '-';

    subtotalBeforeDiscount += (line.baseLineNet ?? line.lineNet);
    discountTotalNet += Math.max(0, (line.baseLineNet ?? line.lineNet) - line.lineNet);
    subtotal += line.lineNet;
    taxAmount += line.lineTax;
    grossTotal += line.lineGross;

    tableBody.push([
      { 
        text: desc, 
        fontSize: 9,
        fillColor: idx % 2 === 0 ? SECONDARY_COLOR : null
      },
      { 
        text: line.qty.toString(), 
        alignment: 'center', 
        fontSize: 9,
        fillColor: idx % 2 === 0 ? SECONDARY_COLOR : null
      },
      { 
        text: formatMoney(line.unitDisplay, invoice?.currency), 
        alignment: 'right', 
        fontSize: 9,
        fillColor: idx % 2 === 0 ? SECONDARY_COLOR : null
      },
      { 
        text: `${line.taxRate}%`, 
        alignment: 'center', 
        fontSize: 9,
        fillColor: idx % 2 === 0 ? SECONDARY_COLOR : null
      },
      {
        text: discountShow,
        alignment: 'center',
        fontSize: 9,
        color: discountShow !== '-' ? '#2E8B57' : TEXT_LIGHT,
        fillColor: idx % 2 === 0 ? SECONDARY_COLOR : null
      },
      { 
        text: formatMoney(line.lineDisplay, invoice?.currency), 
        alignment: 'right', 
        fontSize: 10,
        bold: true,
        color: TEXT_DARK,
        fillColor: idx % 2 === 0 ? SECONDARY_COLOR : null
      }
    ]);
  });

  // Generar QR code - SIEMPRE priorizamos URL AEAT oficial para que el lector muestre enlace
  let qrText: string | undefined;
  const nifForQr = company?.nif || company?.vat_number || company?.tax_id || company?.cif || null;
  const hashForQr = meta?.chained_hash || invoice?.verifactu_hash || null;
  const rawDate = invoice?.invoice_date as string | undefined;
  const totalCandidate = invoice?.total ?? invoice?.total_amount;

  if (nifForQr && rawDate && isFinite(Number(totalCandidate)) && hashForQr) {
    try {
      const dateParts = rawDate.split('-'); // YYYY-MM-DD
      if (dateParts.length === 3) {
        const dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`; // DD-MM-YYYY
        const total = Number(totalCandidate).toFixed(2);
        qrText = `https://www2.agenciatributaria.gob.es/wlpl/TOCP-MANT/vn?TIP_DOC=F&ID_EMISOR_NUM=${encodeURIComponent(nifForQr)}&FECHA=${encodeURIComponent(dateStr)}&TOTAL=${encodeURIComponent(total)}&HUELLA=${encodeURIComponent(hashForQr)}`;
      }
    } catch (e) {
      console.error('Error constructing AEAT URL:', e);
    }
  }

  // Fallback: si no pudimos construir URL AEAT, intentamos URL alternativa con serie/número/hash
  if (!qrText) {
    const seriesForQr = meta?.series || invoice?.invoice_series;
    const numberForQr = meta?.number || invoice?.invoice_number;
    // URL de consulta propia si tenemos serie, número y hash
    if (seriesForQr && numberForQr && hashForQr) {
      qrText = `https://app.sincronia.es/verifactu?serie=${encodeURIComponent(seriesForQr)}&num=${encodeURIComponent(numberForQr)}&hash=${encodeURIComponent(hashForQr)}`;
    } else {
      // Último recurso: texto plano legible
      qrText = meta?.qr_payload || `SERIE:${seriesForQr}|NUM:${numberForQr}|HASH:${hashForQr || 'N/A'}`;
    }
  }

  const qrDataURL = generateQRDataURL(qrText, 200);

  // Prefer persisted aggregates when they are present and coherent
  const aggSubtotal = Number(invoice?.subtotal);
  const aggTax = Number(invoice?.tax_amount ?? invoice?.vat_amount);
  const aggTotal = Number(invoice?.total ?? invoice?.total_amount);
  const haveAgg = isFinite(aggSubtotal) && aggSubtotal > 0 && isFinite(aggTax) && aggTax >= 0 && isFinite(aggTotal) && aggTotal > 0;
  if (haveAgg) {
    subtotal = aggSubtotal;
    taxAmount = aggTax;
    grossTotal = aggTotal + 0; // already final total (may include IRPF retention)
  }

  // IRPF and final total for display
  const computedIrpf = settings.irpf_enabled ? subtotal * (settings.irpf_rate / 100) : 0;
  const aggIrpf = Number(invoice?.irpf_amount);
  const irpfToShow = isFinite(aggIrpf) && aggIrpf > 0 ? aggIrpf : computedIrpf;
  const finalTotal = haveAgg ? grossTotal : Math.max(0, grossTotal - irpfToShow);

  // Definición del documento
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 40],
    
    header: function(currentPage, pageCount) {
      return {
        columns: [
          {
            // Empresa
            stack: [
              { 
                text: company?.name || 'EMPRESA', 
                fontSize: 18, 
                bold: true, 
                color: 'white',
                margin: [30, 18, 0, 2]
              }
            ],
            width: '*'
          },
          {
            // Número de factura y fechas
            stack: [
              { 
                text: 'FACTURA', 
                fontSize: 10, 
                bold: true, 
                color: 'white',
                alignment: 'right',
                margin: [0, 12, 30, 2]
              },
              { 
                text: invoiceNum, 
                fontSize: 16, 
                bold: true, 
                color: 'white',
                alignment: 'right',
                margin: [0, 0, 30, 2]
              },
              { 
                text: `Fecha: ${invoice?.invoice_date ?? ''}`, 
                fontSize: 9, 
                color: '#E0E0E0',
                alignment: 'right',
                margin: [0, 0, 30, 0]
              },
              invoice?.operation_date && invoice.operation_date !== invoice?.invoice_date ? {
                text: `Fecha operación: ${invoice.operation_date}`,
                fontSize: 8,
                color: '#D0D0D0',
                alignment: 'right',
                margin: [0, 2, 30, 0]
              } : {}
            ],
            width: 'auto'
          }
        ],
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: 595.28,
            h: 75,
            color: PRIMARY_COLOR
          }
        ]
      };
    },

    footer: function(currentPage, pageCount) {
      return {
        columns: [
          {
            text: `Página ${currentPage} de ${pageCount}`,
            fontSize: 7,
            color: TEXT_LIGHT,
            alignment: 'center',
            margin: [0, 10, 0, 0]
          }
        ],
        canvas: [
          {
            type: 'line',
            x1: 30,
            y1: 5,
            x2: 565.28,
            y2: 5,
            lineWidth: 0.5,
            lineColor: '#E0E0E0'
          }
        ]
      };
    },

    content: [
      // Espaciado después del header
      { text: '', margin: [0, 60, 0, 0] },

      // Layout con QR y datos
      {
        columns: [
          {
            // Columna izquierda: Emisor y Cliente
            width: '*',
            stack: [
              // Emisor
              {
                stack: [
                  {
                    text: 'EMISOR',
                    fontSize: 9,
                    bold: true,
                    color: PRIMARY_COLOR,
                    margin: [0, 0, 0, 8]
                  },
                  {
                    stack: emitterInfo
                  }
                ],
                margin: [0, 0, 0, 20]
              },
              // Cliente
              {
                stack: [
                  {
                    text: 'CLIENTE',
                    fontSize: 9,
                    bold: true,
                    color: PRIMARY_COLOR,
                    margin: [0, 0, 0, 8]
                  },
                  {
                    stack: clientInfo
                  }
                ]
              }
            ]
          },
          {
            // Columna derecha: QR Code VeriFactu
            width: 110,
            stack: [
              {
                image: qrDataURL,
                width: 90,
                height: 90,
                alignment: 'center'
              },
              {
                text: 'VeriFactu',
                fontSize: 8,
                bold: true,
                alignment: 'center',
                color: TEXT_LIGHT,
                margin: [0, 5, 0, 0]
              }
            ],
            margin: [10, 0, 0, 0]
          }
        ],
        margin: [0, 0, 0, 25]
      },

      // Tabla de conceptos
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: tableBody
        },
        layout: {
          hLineWidth: function(i, node) {
            return (i === 0 || i === 1 || i === node.table.body.length) ? 2 : 0.5;
          },
          vLineWidth: function(i, node) {
            return 0;
          },
          hLineColor: function(i, node) {
            return (i === 0 || i === 1) ? PRIMARY_COLOR : '#E0E0E0';
          },
          paddingLeft: function(i) { return i === 0 ? 8 : 4; },
          paddingRight: function(i, node) { return (i === node.table.widths.length - 1) ? 8 : 4; },
          paddingTop: function(i) { return 6; },
          paddingBottom: function(i) { return 6; }
        },
        margin: [0, 0, 0, 20]
      },

      // Totales
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            stack: [
              {
                canvas: [
                  { type: 'rect', x: 0, y: 0, w: 220, h: 90, r: 4, color: SECONDARY_COLOR }
                ]
              },
              {
                margin: [12, -85, 12, 10],
                stack: [
                  { text: 'RESUMEN', fontSize: 10, bold: true, color: PRIMARY_COLOR, margin: [0, 0, 0, 10] },
                  discountTotalNet > 0 ? {
                    columns: [
                      { text: 'Subtotal:', fontSize: 9, color: TEXT_LIGHT },
                      { text: formatMoney(subtotalBeforeDiscount, invoice?.currency), fontSize: 9, alignment: 'right', color: TEXT_LIGHT }
                    ],
                    margin: [0, 0, 0, 4]
                  } : {},
                  discountTotalNet > 0 ? {
                    columns: [
                      { text: 'Descuento:', fontSize: 9, color: '#2E8B57' },
                      { text: `- ${formatMoney(discountTotalNet, invoice?.currency)}`, fontSize: 9, alignment: 'right', color: '#2E8B57' }
                    ],
                    margin: [0, 0, 0, 8]
                  } : {},
                  {
                    columns: [
                      { text: 'Base imponible:', fontSize: 10, color: TEXT_DARK, bold: discountTotalNet > 0 },
                      { text: formatMoney(subtotal, invoice?.currency), fontSize: 10, alignment: 'right', color: TEXT_DARK, bold: discountTotalNet > 0 }
                    ],
                    margin: [0, 0, 0, 6]
                  },
                  {
                    columns: [
                      { text: `IVA (${isFinite(invoice?.iva_rate) ? invoice.iva_rate : settings.iva_rate}%):`, fontSize: 10, color: TEXT_DARK },
                      { text: formatMoney(taxAmount, invoice?.currency), fontSize: 10, alignment: 'right', color: TEXT_DARK }
                    ],
                    margin: [0, 0, 0, 6]
                  },
                  irpfToShow > 0 ? {
                    columns: [
                      { text: `IRPF (${isFinite(invoice?.irpf_rate) ? invoice.irpf_rate : settings.irpf_rate}%):`, fontSize: 10, color: TEXT_DARK },
                      { text: `- ${formatMoney(irpfToShow, invoice?.currency)}`, fontSize: 10, alignment: 'right', color: TEXT_DARK }
                    ],
                    margin: [0, 0, 0, 10]
                  } : {},
                  {
                    canvas: [
                      { type: 'line', x1: 0, y1: 0, x2: 196, y2: 0, lineWidth: 1.5, lineColor: PRIMARY_COLOR }
                    ],
                    margin: [0, 0, 0, 8]
                  },
                  {
                    columns: [
                      { text: 'TOTAL:', fontSize: 13, bold: true, color: PRIMARY_COLOR },
                      { text: formatMoney(finalTotal, invoice?.currency), fontSize: 15, bold: true, alignment: 'right', color: PRIMARY_COLOR }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        margin: [0, 0, 0, 25]
      },

      // Información VeriFactu
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 535.28,
            y2: 0,
            lineWidth: 0.5,
            lineColor: '#E0E0E0'
          }
        ],
        margin: [0, 10, 0, 15]
      },
      {
        text: 'Información VeriFactu',
        fontSize: 9,
        bold: true,
        color: TEXT_DARK,
        margin: [0, 0, 0, 8]
      },
      {
        stack: [
          {
            text: `Hash: ${(meta?.chained_hash || invoice?.verifactu_hash || 'N/A').slice(0, 80)}`,
            fontSize: 7,
            color: TEXT_LIGHT,
            margin: [0, 0, 0, 4]
          },
          {
            text: `Dispositivo: ${meta?.device_id || 'N/A'} • Software: ${meta?.software_id || 'N/A'}`,
            fontSize: 7,
            color: TEXT_LIGHT
          }
        ]
      }
    ],

    styles: {
      tableHeader: {
        fontSize: 10,
        bold: true
      }
    },

    defaultStyle: {
      font: 'Roboto'
    }
  };

  return new Promise((resolve, reject) => {
    const pdfDocGenerator = pdfMake.createPdf(docDefinition);
    pdfDocGenerator.getBuffer((buffer) => {
      resolve(new Uint8Array(buffer));
    });
  });
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing Bearer token' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const invoiceId = url.searchParams.get('invoice_id');
    const force = url.searchParams.get('force') === '1';
    const download = url.searchParams.get('download') === '1';
    
    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: 'invoice_id required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY envs' }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Load invoice context via RLS-scoped client
    const { data: invoice, error: invErr } = await user
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();
    
    if (invErr || !invoice) {
      return new Response(
        JSON.stringify({ error: invErr?.message || 'Invoice not found' }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    let { data: items, error: itErr } = await user
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('line_order', { ascending: true });
    
    // Fallback: if RLS trimmed items, fetch with service role
    if (!itErr && items && items.length <= 1) {
      const { data: adminItems } = await admin
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('line_order', { ascending: true });
      if (adminItems && adminItems.length > items.length) items = adminItems;
    }

    if (itErr) {
      return new Response(
        JSON.stringify({ error: itErr.message }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const { data: client, error: clErr } = await user
      .from('clients')
      .select('*')
      .eq('id', invoice.client_id)
      .maybeSingle();
    
    if (clErr) {
      return new Response(
        JSON.stringify({ error: clErr.message }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const { data: company, error: coErr } = await user
      .from('companies')
      .select('*')
      .eq('id', invoice.company_id)
      .maybeSingle();
    
    if (coErr) {
      return new Response(
        JSON.stringify({ error: coErr.message }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    // verifactu schema may not be exposed via PostgREST; read using service role
    const { data: meta, error: metaErr } = await admin
      .from('verifactu.invoice_meta')
      .select('*')
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    
    if (metaErr) {
      return new Response(
        JSON.stringify({ error: metaErr.message }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    // Load tax settings (service role to avoid RLS issues)
    const series = meta?.series || invoice?.invoice_series || 'SER';
    const number = meta?.number || invoice?.invoice_number || '00001';
    const companyId = invoice.company_id;
    const { data: appSettings } = await admin
      .from('app_settings')
      .select('*')
      .maybeSingle();
    const { data: companySettings } = await admin
      .from('company_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    const settings: TaxSettings = {
      pricesIncludeTax: Boolean(companySettings?.pricesIncludeTax ?? companySettings?.prices_include_tax ?? appSettings?.pricesIncludeTax ?? appSettings?.prices_include_tax ?? false),
      iva_enabled: Boolean(companySettings?.iva_enabled ?? appSettings?.iva_enabled ?? true),
      iva_rate: Number(companySettings?.iva_rate ?? appSettings?.iva_rate ?? 21),
      irpf_enabled: Boolean(companySettings?.irpf_enabled ?? appSettings?.irpf_enabled ?? false),
      irpf_rate: Number(companySettings?.irpf_rate ?? appSettings?.irpf_rate ?? 0),
    };

    // Compute storage path
    const bucket = Deno.env.get('INVOICE_PDF_BUCKET') || 'invoices';
    const path = `${companyId}/${series}/${series}-${number}.pdf`;

    // Check if already exists (unless force=1)
    if (!force) {
      const { data: exists } = await admin.storage
        .from(bucket)
        .list(`${companyId}/${series}`, { search: `${series}-${number}.pdf` });
      
      if ((exists || []).find(f => f.name === `${series}-${number}.pdf`)) {
        const { data: signed, error: signErr } = await admin.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 60 * 24 * 30);
        
        if (signErr) {
          return new Response(
            JSON.stringify({ error: signErr.message }),
            { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
          );
        }

        if (download) {
          const { data: fileData, error: dlErr } = await admin.storage
            .from(bucket)
            .download(path);
          
          if (dlErr) {
            return new Response(
              JSON.stringify({ error: dlErr.message }),
              { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(fileData, {
            status: 200,
            headers: {
              ...headers,
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="${series}-${number}.pdf"`
            }
          });
        }

        return new Response(
          JSON.stringify({ ok: true, cached: true, url: signed.signedUrl, path }),
          { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Generate new PDF
  const pdfBytes = await generateInvoicePdf({ invoice, items, client, company, meta, settings });

    // Upload to storage
    const { error: upErr } = await admin.storage
      .from(bucket)
      .upload(path, new Blob([pdfBytes], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (upErr) {
      return new Response(
        JSON.stringify({ error: upErr.message }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    const { data: signed, error: signErr } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    
    if (signErr) {
      return new Response(
        JSON.stringify({ error: signErr.message }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    if (download) {
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${series}-${number}.pdf"`
        }
      });
    }

    return new Response(
      JSON.stringify({ ok: true, cached: false, url: signed.signedUrl, path }),
      { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
});