// @ts-nocheck
// Edge Function: quotes-pdf
// Purpose: Generate a pretty PDF for a quote using pdfmake and store in Supabase Storage
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as sharedCorsHeaders, originAllowed } from "./cors.ts";

// pdfmake imports
import pdfMake from "https://esm.sh/pdfmake@0.2.10/build/pdfmake.js";
import pdfFonts from "https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js";
pdfMake.vfs = pdfFonts.pdfMake.vfs;

function cors(origin?: string) { return sharedCorsHeaders(origin, 'GET, OPTIONS'); }

function money(v: number | null | undefined, currency = 'EUR') {
  const n = typeof v === 'number' ? v : 0;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n);
}

type TaxSettings = {
  pricesIncludeTax: boolean
  iva_enabled: boolean
  iva_rate: number
  irpf_enabled: boolean
  irpf_rate: number
};

function computeLineAmounts(item: any, currency: string | undefined, settings: TaxSettings) {
  const qty = Number(item?.quantity ?? 1);
  const baseUnit = Number(
    item?.unit_price ?? item?.price ?? item?.price_per_unit ?? item?.base_price ?? item?.list_price ?? item?.unitPrice ?? 0
  );
  // Support multiple naming conventions for discount
  const discountRaw = item?.discount_percent ?? item?.discount_percentage ?? item?.discount ?? 0;
  const discountPct = isFinite(Number(discountRaw)) ? Number(discountRaw) : 0;
  const taxRate = settings.iva_enabled ? Number(item?.tax_rate ?? settings.iva_rate ?? 0) : 0;

  // Compute base (no discount) unit amounts and discounted unit amounts
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
    // Show original unit price (never discounted) in the table
    unitDisplay: settings.pricesIncludeTax ? unitBaseGross : unitBaseNet,
    // Show discounted line amount in the table
    lineDisplay: settings.pricesIncludeTax ? lineGross : lineNet,
    lineNet,
    lineTax,
    lineGross,
    baseLineNet,
    baseLineGross,
  };
}

function generateQuotePdf(ctx: { quote: any, items: any[], client: any, company: any, settings: TaxSettings }) {
  const { quote, items, client, company, settings } = ctx;

  // Normalizar número de presupuesto con prefijo P
  const rawNumber = String(quote?.full_quote_number || quote?.quote_number || '');
  const displayNumber = rawNumber.replace('-Q-', '-P-').replace('-F-', '-P-');

  // Colores corporativos
  const PRIMARY_COLOR = '#3366CC';
  const ACCENT_COLOR = '#2E8B57';
  const LIGHT_GRAY = '#F5F5F7';
  const TEXT_DARK = '#262626';
  const TEXT_LIGHT = '#737373';

  // Construir información del emisor
  const emitterInfo = [];
  if (company?.name) emitterInfo.push({ text: company.name, bold: true, fontSize: 11, margin: [0, 0, 0, 4] });
  if (company?.settings?.cif || company?.settings?.nif || company?.settings?.tax_id) {
    const taxId = company.settings.cif || company.settings.nif || company.settings.tax_id;
    emitterInfo.push({ text: `NIF/CIF: ${taxId}`, fontSize: 9, color: TEXT_LIGHT });
  }
  if (company?.settings?.fiscal_address) {
    emitterInfo.push({ text: String(company.settings.fiscal_address), fontSize: 8, color: TEXT_LIGHT });
  }
  if (company?.settings?.phone) {
    emitterInfo.push({ text: `Tel: ${company.settings.phone}`, fontSize: 8, color: TEXT_LIGHT });
  }
  if (company?.settings?.email) {
    emitterInfo.push({ text: company.settings.email, fontSize: 8, color: TEXT_LIGHT });
  }

  // Construir información del cliente
  const clientInfo = [];
  if (client?.name) clientInfo.push({ text: client.name, bold: true, fontSize: 11, margin: [0, 0, 0, 4] });
  if (client?.tax_id || client?.dni || client?.cif) {
    const taxId = client.tax_id || client.dni || client.cif;
    clientInfo.push({ text: `DNI/CIF: ${taxId}`, fontSize: 9, color: TEXT_LIGHT });
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

  // Preparar items de la tabla
  const tableBody = [
    [
      { text: 'DESCRIPCIÓN', style: 'tableHeader', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'CANT.', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'PRECIO', style: 'tableHeader', alignment: 'right', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'IVA', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'DTO', style: 'tableHeader', alignment: 'center', fillColor: PRIMARY_COLOR, color: 'white' },
      { text: 'IMPORTE', style: 'tableHeader', alignment: 'right', fillColor: PRIMARY_COLOR, color: 'white' }
    ]
  ];

  // Rows
  let subtotalBeforeDiscount = 0; // Suma bruta antes de descuentos
  let discountTotalNet = 0; // Total descontado
  let subtotal = 0; // Base imponible (neto después de descuentos)
  let taxAmount = 0;
  let grossTotal = 0;

  (items || []).forEach((it, idx) => {
    const desc = it.description || '';
    const notes = it.notes ? `\n(${it.notes})` : '';
    const line = computeLineAmounts(it, quote?.currency, settings);
    const discountShow = isFinite(Number(it?.discount_percent ?? it?.discount_percentage ?? it?.discount)) 
      ? `${Number(it?.discount_percent ?? it?.discount_percentage ?? it?.discount)}%` 
      : '-';

    subtotalBeforeDiscount += (line.baseLineNet ?? line.lineNet);
    discountTotalNet += Math.max(0, (line.baseLineNet ?? line.lineNet) - line.lineNet);
    subtotal += line.lineNet;
    taxAmount += line.lineTax;
    grossTotal += line.lineGross;

    tableBody.push([
      { text: `${desc}${notes}`, fontSize: 9, fillColor: idx % 2 === 0 ? LIGHT_GRAY : null },
      { text: line.qty.toString(), alignment: 'center', fontSize: 9, fillColor: idx % 2 === 0 ? LIGHT_GRAY : null },
      { text: money(line.unitDisplay, quote?.currency), alignment: 'right', fontSize: 9, fillColor: idx % 2 === 0 ? LIGHT_GRAY : null },
      { text: `${line.taxRate}%`, alignment: 'center', fontSize: 9, fillColor: idx % 2 === 0 ? LIGHT_GRAY : null },
      { text: discountShow, alignment: 'center', fontSize: 9, color: discountShow !== '-' ? ACCENT_COLOR : TEXT_LIGHT, fillColor: idx % 2 === 0 ? LIGHT_GRAY : null },
      { text: money(line.lineDisplay, quote?.currency), alignment: 'right', fontSize: 10, bold: true, color: PRIMARY_COLOR, fillColor: idx % 2 === 0 ? LIGHT_GRAY : null }
    ]);
  });

  // Resumen basado en configuración
  const irpfAmount = settings.irpf_enabled ? subtotal * (settings.irpf_rate / 100) : 0;
  const totalAmount = Math.max(0, grossTotal - irpfAmount);
  const taxPercent = subtotal > 0 ? ((taxAmount / subtotal) * 100).toFixed(1) : String(settings.iva_rate);

  // Definición del documento
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 40],
    
    header: function(currentPage, pageCount) {
      return {
        columns: [
          {
            // Logo/Nombre empresa
            stack: [
              { 
                text: company?.name || 'EMPRESA', 
                fontSize: 20, 
                bold: true, 
                color: 'white',
                margin: [30, 20, 0, 2]
              },
              company?.settings?.tagline ? {
                text: String(company.settings.tagline),
                fontSize: 9,
                color: '#E0E0E0',
                margin: [30, 0, 0, 0]
              } : {}
            ]
          },
          {
            // Número y fecha
            stack: [
              { 
                text: 'PRESUPUESTO', 
                fontSize: 11, 
                bold: true, 
                color: 'white',
                alignment: 'right',
                margin: [0, 15, 30, 2]
              },
              { 
                text: displayNumber, 
                fontSize: 16, 
                bold: true, 
                color: 'white',
                alignment: 'right',
                margin: [0, 0, 30, 2]
              },
              { 
                text: `Fecha: ${quote?.quote_date ?? ''}`, 
                fontSize: 9, 
                color: '#E0E0E0',
                alignment: 'right',
                margin: [0, 0, 30, 0]
              },
              quote?.valid_until ? {
                text: `Válido hasta: ${quote.valid_until}`,
                fontSize: 8,
                color: '#D0D0D0',
                alignment: 'right',
                margin: [0, 2, 30, 0]
              } : {}
            ]
          }
        ],
        // Fondo azul para el header
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: 595.28,
            h: 85,
            color: PRIMARY_COLOR
          }
        ]
      };
    },

    footer: function(currentPage, pageCount) {
      return {
        columns: [
          {
            text: `Documento generado electrónicamente - Válido sin firma`,
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
      { text: '', margin: [0, 70, 0, 0] },

      // Cajas de Emisor y Cliente
      {
        columns: [
          {
            width: '48%',
            stack: [
              {
                text: 'DATOS DEL EMISOR',
                fontSize: 9,
                bold: true,
                color: PRIMARY_COLOR,
                margin: [0, 0, 0, 8]
              },
              {
                stack: emitterInfo,
                margin: [0, 0, 0, 0]
              }
            ],
            margin: [0, 0, 10, 20]
          },
          {
            width: '48%',
            stack: [
              {
                text: 'DATOS DEL CLIENTE',
                fontSize: 9,
                bold: true,
                color: PRIMARY_COLOR,
                margin: [0, 0, 0, 8]
              },
              {
                stack: clientInfo,
                margin: [0, 0, 0, 0]
              }
            ],
            margin: [10, 0, 0, 20]
          }
        ]
      },

      // Descripción del presupuesto (si existe)
      quote?.description ? {
        stack: [
          { text: 'Descripción:', bold: true, fontSize: 10, color: TEXT_DARK, margin: [0, 0, 0, 4] },
          { text: String(quote.description), fontSize: 9, color: TEXT_LIGHT }
        ],
        margin: [0, 0, 0, 15]
      } : {},

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

      // Resumen y totales
      {
        columns: [
          { width: '*', text: '' }, // Spacer
          {
            width: 200,
            stack: [
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: 200,
                    h: 90,
                    r: 4,
                    color: LIGHT_GRAY
                  }
                ]
              },
              {
                margin: [10, -85, 10, 10],
                stack: [
                  {
                    text: 'RESUMEN',
                    fontSize: 10,
                    bold: true,
                    color: PRIMARY_COLOR,
                    margin: [0, 0, 0, 10]
                  },
                  discountTotalNet > 0 ? {
                    columns: [
                      { text: 'Subtotal:', fontSize: 9, color: TEXT_LIGHT },
                      { text: money(subtotalBeforeDiscount, quote?.currency), fontSize: 9, alignment: 'right', color: TEXT_LIGHT }
                    ],
                    margin: [0, 0, 0, 4]
                  } : {},
                  discountTotalNet > 0 ? {
                    columns: [
                      { text: 'Descuento:', fontSize: 9, color: ACCENT_COLOR },
                      { text: `- ${money(discountTotalNet, quote?.currency)}`, fontSize: 9, alignment: 'right', color: ACCENT_COLOR }
                    ],
                    margin: [0, 0, 0, 8]
                  } : {},
                  {
                    columns: [
                      { text: 'Base imponible:', fontSize: 10, color: TEXT_DARK, bold: discountTotalNet > 0 },
                      { text: money(subtotal, quote?.currency), fontSize: 10, alignment: 'right', color: TEXT_DARK, bold: discountTotalNet > 0 }
                    ],
                    margin: [0, 0, 0, 6]
                  },
                  {
                    columns: [
                      { text: `IVA (${taxPercent}%):`, fontSize: 10, color: TEXT_DARK },
                      { text: money(taxAmount, quote?.currency), fontSize: 10, alignment: 'right', color: TEXT_DARK }
                    ],
                    margin: [0, 0, 0, 6]
                  },
                  settings.irpf_enabled ? {
                    columns: [
                      { text: `IRPF (${settings.irpf_rate}%):`, fontSize: 10, color: TEXT_DARK },
                      { text: `- ${money(irpfAmount, quote?.currency)}`, fontSize: 10, alignment: 'right', color: TEXT_DARK }
                    ],
                    margin: [0, 0, 0, 10]
                  } : {},
                  {
                    canvas: [
                      {
                        type: 'line',
                        x1: 0,
                        y1: 0,
                        x2: 180,
                        y2: 0,
                        lineWidth: 1.5,
                        lineColor: ACCENT_COLOR
                      }
                    ],
                    margin: [0, 0, 0, 8]
                  },
                  {
                    columns: [
                      { text: 'TOTAL:', fontSize: 13, bold: true, color: ACCENT_COLOR },
                      { text: money(totalAmount, quote?.currency), fontSize: 15, bold: true, alignment: 'right', color: ACCENT_COLOR }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },

      // Notas y condiciones (si existen)
      (quote?.terms_conditions || quote?.notes) ? {
        stack: [
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
            margin: [0, 20, 0, 15]
          },
          {
            text: 'OBSERVACIONES Y CONDICIONES',
            fontSize: 11,
            bold: true,
            color: PRIMARY_COLOR,
            margin: [0, 0, 0, 8]
          },
          {
            text: String(quote.terms_conditions || quote.notes || ''),
            fontSize: 8,
            color: TEXT_LIGHT
          }
        ],
        margin: [0, 10, 0, 0]
      } : {}
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
  if (origin && !originAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'CORS_ORIGIN_FORBIDDEN' }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
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
    const quoteId = url.searchParams.get('quote_id');
    const force = url.searchParams.get('force') === '1';
    const download = url.searchParams.get('download') === '1';
    
    if (!quoteId) {
      return new Response(
        JSON.stringify({ error: 'quote_id required' }),
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

    // Load quote & context using user-scoped client (RLS)
    const { data: quote, error: qErr } = await user
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .maybeSingle();
    
    if (qErr || !quote) {
      return new Response(
        JSON.stringify({ error: qErr?.message || 'Quote not found' }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    let { data: items, error: itErr } = await user
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('line_number', { ascending: true });

    // Fallback: if RLS trimmed items (e.g., only first visible) use service role after company validation
    if (!itErr && items && items.length <= 1) {
      const { data: adminItems } = await admin
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('line_number', { ascending: true });
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
      .eq('id', quote.client_id)
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
      .eq('id', quote.company_id)
      .maybeSingle();
    
    if (coErr) {
      return new Response(
        JSON.stringify({ error: coErr.message }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    // Load tax settings (use service role to avoid RLS issues)
    const companyId = quote.company_id;
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
    const bucket = Deno.env.get('QUOTE_PDF_BUCKET') || 'quotes';
    const fileName = `${quote.full_quote_number || quote.quote_number || quote.id}.pdf`;
    const path = `${companyId}/${fileName}`;

    // Check if PDF already exists (unless force=1)
    if (!force) {
      const { data: exists } = await admin.storage
        .from(bucket)
        .list(`${companyId}`, { search: fileName });
      
      if ((exists || []).find(f => f.name === fileName)) {
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
              'Content-Disposition': `inline; filename="${fileName}"`
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
  const pdfBytes = await generateQuotePdf({ quote, items, client, company, settings });

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
          'Content-Disposition': `inline; filename="${fileName}"`
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