/**
 * VeriFactu Invoice Transformer
 * Transforma datos de factura de Simplifica al formato VeriFactu
 */

import { 
  RegistroAlta, 
  RegistroAnulacion, 
  Cabecera, 
  SistemaInformatico,
  formatDateAEAT,
  generateTimestamp,
} from './xml-generator.ts';
import { generateCanonicalHash, generateAnulacionCanonicalHash } from './xades-signer.ts';

/**
 * Datos de factura desde la tabla invoices
 */
export interface InvoiceData {
  id: string;
  invoice_number: string;
  series?: string;
  invoice_date: string;
  total_amount: number;
  total_tax: number;
  subtotal: number;
  status: string;
  company_id: string;
  client_id?: string;
  notes?: string;
  
  // Datos del emisor
  company?: {
    name: string;
    nif: string;
    address?: string;
  };
  
  // Datos del cliente (destinatario)
  client?: {
    name: string;
    nif?: string;
    tax_id?: string;
    address?: string;
    country?: string;
  };
  
  // Líneas de factura
  invoice_lines?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
  }>;
}

/**
 * Datos de VeriFactu settings
 */
export interface VerifactuSettings {
  issuer_nif: string;
  issuer_name: string;
  environment: 'pre' | 'prod';
  software_code: string;
  software_name: string;
  software_version: string;
  producer_nif: string;
  producer_name: string;
  installation_number: string;
}

/**
 * Datos del registro anterior para encadenamiento
 */
export interface PreviousRecord {
  nif_emisor: string;
  numero_serie: string;
  fecha_expedicion: string;
  huella: string;
}

/**
 * Determina el tipo de factura según datos
 */
function determineInvoiceType(invoice: InvoiceData): 'F1' | 'F2' | 'F3' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' {
  // F1: Factura normal
  // F2: Factura simplificada
  // R1-R5: Facturas rectificativas
  
  // Simplificación: si hay cliente con NIF, es F1; si no, F2
  if (invoice.client?.nif || invoice.client?.tax_id) {
    return 'F1';
  }
  
  // Si el importe total es <= 400€ y no hay NIF, podría ser F2
  if (invoice.total_amount <= 400) {
    return 'F2';
  }
  
  return 'F1';
}

/**
 * Determina clave de régimen IVA
 */
function determineClaveRegimen(invoice: InvoiceData): string {
  // 01: Operación de régimen general
  // Por defecto usamos 01
  return '01';
}

/**
 * Determina calificación de operación
 */
function determineCalificacionOperacion(invoice: InvoiceData): string {
  // S1: Sujeta y No exenta - Sin inversión sujeto pasivo
  // S2: Sujeta y No exenta - Con inversión sujeto pasivo
  // N1: No sujeta art. 7, 14, otros
  // N2: No sujeta por reglas de localización
  
  return 'S1'; // Por defecto operación nacional sujeta
}

/**
 * Construye número de factura con serie
 */
function buildInvoiceNumber(invoice: InvoiceData): string {
  if (invoice.series) {
    return `${invoice.series}${invoice.invoice_number}`;
  }
  return invoice.invoice_number;
}

/**
 * Agrupa líneas de factura por tipo de IVA
 */
function groupLinesByTax(lines: InvoiceData['invoice_lines']): Array<{
  taxRate: number;
  base: number;
  tax: number;
}> {
  if (!lines || lines.length === 0) {
    return [{ taxRate: 21, base: 0, tax: 0 }];
  }
  
  const groups = new Map<number, { base: number; tax: number }>();
  
  for (const line of lines) {
    const rate = line.tax_rate || 21;
    const existing = groups.get(rate) || { base: 0, tax: 0 };
    existing.base += line.quantity * line.unit_price;
    existing.tax += line.tax_amount || 0;
    groups.set(rate, existing);
  }
  
  return Array.from(groups.entries()).map(([taxRate, { base, tax }]) => ({
    taxRate,
    base,
    tax,
  }));
}

/**
 * Construye SistemaInformatico desde settings
 */
export function buildSistemaInformatico(settings: VerifactuSettings): SistemaInformatico {
  return {
    nifProducer: settings.producer_nif || settings.issuer_nif,
    nombreRazon: settings.producer_name || settings.issuer_name,
    idSistema: settings.software_code || 'SIMPLIFICA',
    nombreSistema: settings.software_name || 'Simplifica',
    version: settings.software_version || '1.0.0',
    numInstalacion: settings.installation_number || '001',
    tipoUsoPosible: 'S',  // Solo VeriFactu
    tipoUsoMultiOT: 'S',  // Multiusuario
  };
}

/**
 * Construye Cabecera del mensaje
 */
export function buildCabecera(
  settings: VerifactuSettings,
  incidenciaTecnica: boolean = false
): Cabecera {
  return {
    obligadoEmision: {
      nif: settings.issuer_nif,
      nombreRazon: settings.issuer_name,
    },
    sistema: buildSistemaInformatico(settings),
    incidenciaTecnica: incidenciaTecnica ? 'S' : 'N',
  };
}

/**
 * Transforma factura a RegistroAlta de VeriFactu
 */
export async function transformToRegistroAlta(
  invoice: InvoiceData,
  settings: VerifactuSettings,
  previousRecord?: PreviousRecord
): Promise<RegistroAlta> {
  const invoiceNumber = buildInvoiceNumber(invoice);
  const fechaExpedicion = formatDateAEAT(invoice.invoice_date);
  const tipoFactura = determineInvoiceType(invoice);
  const timestamp = generateTimestamp();
  
  // Ensure numeric values have defaults (invoice table may use different column names)
  const totalTax = invoice.total_tax ?? invoice.tax_amount ?? invoice.vat_amount ?? 0;
  const totalAmount = invoice.total_amount ?? invoice.total ?? invoice.total_with_tax ?? invoice.grand_total ?? 0;
  
  console.log('[transformToRegistroAlta] Invoice values:', JSON.stringify({
    id: invoice.id,
    total_tax: invoice.total_tax,
    tax_amount: invoice.tax_amount,
    vat_amount: invoice.vat_amount,
    total_amount: invoice.total_amount,
    total: invoice.total,
    total_with_tax: invoice.total_with_tax,
    grand_total: invoice.grand_total,
    computed: { totalTax, totalAmount }
  }));
  
  // Calcular huella
  const huella = await generateCanonicalHash(
    settings.issuer_nif,
    invoiceNumber,
    fechaExpedicion,
    tipoFactura,
    totalTax,
    totalAmount,
    previousRecord?.huella || null,
    timestamp
  );
  
  // Construir desglose por tipos de IVA
  const taxGroups = groupLinesByTax(invoice.invoice_lines);
  const desglose = taxGroups.map(group => ({
    tipoDesglose: 'D' as const,
    claveRegimen: determineClaveRegimen(invoice),
    calificacionOp: determineCalificacionOperacion(invoice),
    porcentaje: group.taxRate,
    baseImponibleOImporteNoSujeto: group.base,
    cuotaRepercutida: group.tax,
  }));
  
  // Construir descripción
  const descripcion = invoice.notes || 
    invoice.invoice_lines?.map(l => l.description).join(', ') || 
    'Servicios profesionales';
  
  const registro: RegistroAlta = {
    idFactura: {
      nifEmisor: settings.issuer_nif,
      numSerieFactura: invoiceNumber,
      fechaExpedicion: fechaExpedicion,
    },
    refExterna: invoice.id,
    nombreRazonEmisor: settings.issuer_name,
    tipoFactura: tipoFactura,
    descripcionOperacion: descripcion.substring(0, 500), // Máximo 500 chars
    desglose: desglose,
    cuotaTotal: totalTax,
    importeTotal: totalAmount,
    sistemaInformatico: buildSistemaInformatico(settings),
    fechaHoraHusoGenRegistro: timestamp,
    huella: huella,
    idVersion: '1.0',
  };
  
  // Añadir destinatario si hay datos
  if (invoice.client) {
    const clientNif = invoice.client.nif || invoice.client.tax_id;
    
    if (clientNif) {
      // Cliente con NIF español
      if (/^[A-Z]?\d{7,8}[A-Z]?$/i.test(clientNif)) {
        registro.destinatario = {
          nif: clientNif.toUpperCase(),
          nombreRazon: invoice.client.name,
        };
      } else {
        // Cliente extranjero
        registro.destinatario = {
          idOtro: {
            codigoPais: invoice.client.country || 'ES',
            idType: '02', // NIF-IVA
            id: clientNif,
          },
          nombreRazon: invoice.client.name,
        };
      }
    } else if (tipoFactura !== 'F2') {
      // Factura simplificada sin identificación
      registro.facturaSinId = 'S';
    }
  }
  
  // Añadir encadenamiento si hay registro anterior
  if (previousRecord) {
    registro.encadenamientoFacturaAnterior = {
      nifEmisorFacturaAnterior: previousRecord.nif_emisor,
      numSerieFacturaAnterior: previousRecord.numero_serie,
      fechaExpedicionFacturaAnterior: previousRecord.fecha_expedicion,
      huella: previousRecord.huella.substring(0, 64), // Primeros 64 chars
    };
  }
  
  return registro;
}

/**
 * Transforma factura a RegistroAnulacion de VeriFactu
 */
export async function transformToRegistroAnulacion(
  invoice: InvoiceData,
  settings: VerifactuSettings,
  previousRecord?: PreviousRecord
): Promise<RegistroAnulacion> {
  const invoiceNumber = buildInvoiceNumber(invoice);
  const fechaExpedicion = formatDateAEAT(invoice.invoice_date);
  const timestamp = generateTimestamp();
  
  // Calcular huella para anulación
  const huella = await generateAnulacionCanonicalHash(
    settings.issuer_nif,
    invoiceNumber,
    fechaExpedicion,
    previousRecord?.huella || null,
    timestamp
  );
  
  const registro: RegistroAnulacion = {
    idFactura: {
      nifEmisor: settings.issuer_nif,
      numSerieFactura: invoiceNumber,
      fechaExpedicion: fechaExpedicion,
    },
    refExterna: invoice.id,
    generadoPor: 'E', // Expedidor
    sistemaInformatico: buildSistemaInformatico(settings),
    fechaHoraHusoGenRegistro: timestamp,
    huella: huella,
    idVersion: '1.0',
  };
  
  // Añadir encadenamiento si hay registro anterior
  if (previousRecord) {
    registro.encadenamientoFacturaAnterior = {
      nifEmisorFacturaAnterior: previousRecord.nif_emisor,
      numSerieFacturaAnterior: previousRecord.numero_serie,
      fechaExpedicionFacturaAnterior: previousRecord.fecha_expedicion,
      huella: previousRecord.huella.substring(0, 64),
    };
  }
  
  return registro;
}

/**
 * Valida que la factura tiene los datos mínimos para VeriFactu
 */
export function validateInvoiceForVerifactu(invoice: InvoiceData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!invoice.invoice_number) {
    errors.push('Número de factura requerido');
  }
  
  if (!invoice.invoice_date) {
    errors.push('Fecha de factura requerida');
  }
  
  if (invoice.total_amount === undefined || invoice.total_amount === null) {
    errors.push('Importe total requerido');
  }
  
  if (!invoice.company?.nif) {
    errors.push('NIF del emisor requerido');
  }
  
  // Validar formato de fecha
  try {
    formatDateAEAT(invoice.invoice_date);
  } catch (e) {
    errors.push(`Formato de fecha inválido: ${invoice.invoice_date}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Obtiene el último registro para encadenamiento desde invoice_meta
 */
export async function getLastRecord(
  supabase: any,
  issuerNif: string
): Promise<PreviousRecord | null> {
  const { data, error } = await supabase
    .schema('verifactu')
    .from('invoice_meta')
    .select('*')
    .eq('issuer_nif', issuerNif)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  // Extraer datos del payload o de campos directos
  const payload = data.payload || {};
  
  return {
    nif_emisor: payload.issuer_nif || issuerNif,
    numero_serie: payload.invoice_number || data.invoice_id,
    fecha_expedicion: formatDateAEAT(payload.issue_date || data.created_at),
    huella: data.chain_hash || payload.chain_hash || '',
  };
}
