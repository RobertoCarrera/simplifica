// =====================================================
// MODELOS DE FACTURACIÓN
// =====================================================

// Enums
export enum InvoiceStatus {
  DRAFT = 'draft',
  APPROVED = 'approved', // Aprobada (recién creada desde presupuesto)
  ISSUED = 'issued',     // Emitida a Veri*Factu
  SENT = 'sent',         // Enviada al cliente
  PAID = 'paid',
  PARTIAL = 'partial',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  RECTIFIED = 'rectified', // Rectificada por otra factura
  VOID = 'void'
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
  DIRECT_DEBIT = 'direct_debit',
  PAYPAL = 'paypal',
  OTHER = 'other'
}

export enum InvoiceType {
  NORMAL = 'normal',
  SIMPLIFIED = 'simplified',
  RECTIFICATIVE = 'rectificative',
  SUMMARY = 'summary'
}

// Interfaces
export interface InvoiceSeries {
  id: string;
  company_id: string;
  series_code: string;
  series_name: string;
  year: number;
  prefix: string;
  next_number: number;
  is_active: boolean;
  is_default: boolean;
  verifactu_enabled: boolean;
  last_verifactu_hash?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface Invoice {
  id: string;
  company_id: string;
  client_id: string;
  series_id: string;

  // Numeración
  invoice_number: string;
  invoice_series: string;
  full_invoice_number?: string; // Generated

  // Tipo y fechas
  invoice_type: InvoiceType;
  invoice_date: string;
  due_date: string;

  // Importes
  subtotal: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  currency: string;

  // Estado
  status: InvoiceStatus;
  payment_method?: PaymentMethod;

  // Notas
  notes?: string;
  internal_notes?: string;

  // Rectificativa
  rectifies_invoice_id?: string;
  rectification_reason?: string;

  // Veri*Factu
  verifactu_status?: string; // Computed column
  verifactu_hash?: string;
  verifactu_signature?: string;
  verifactu_timestamp?: string;
  verifactu_qr_code?: string;
  verifactu_xml?: string;
  verifactu_chain_position?: number;

  // GDPR
  anonymized_at?: string;
  retention_until?: string; // Generated
  gdpr_legal_basis: string;

  // Online Payment
  payment_status?: 'pending' | 'partial' | 'paid' | 'refunded' | 'cancelled';
  payment_link_token?: string;
  payment_link_expires_at?: string;
  payment_link_provider?: 'paypal' | 'stripe';

  // Auditoría
  created_at: string;
  updated_at: string;
  created_by?: string;
  deleted_at?: string;

  // Relaciones (para populate)
  client?: any;
  series?: InvoiceSeries;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  line_order: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate: number;
  tax_amount: number;
  subtotal: number;
  total: number;
  product_id?: string;
  service_id?: string;
  created_at: string;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference?: string;
  notes?: string;
  created_at: string;
  created_by?: string;
}

export interface InvoiceTemplate {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  html_template: string;
  css_styles?: string;
  show_company_logo: boolean;
  show_payment_info: boolean;
  show_tax_breakdown: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// DTOs para crear/actualizar
export interface CreateInvoiceDTO {
  client_id: string;
  series_id?: string; // Si no se proporciona, usa la serie por defecto
  invoice_type?: InvoiceType;
  invoice_date?: string;
  due_date?: string;
  payment_method?: PaymentMethod;
  notes?: string;
  internal_notes?: string;
  items: CreateInvoiceItemDTO[];
}

export interface CreateInvoiceItemDTO {
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_rate?: number;
  product_id?: string;
  service_id?: string;
}

export interface UpdateInvoiceDTO {
  client_id?: string;
  invoice_date?: string;
  due_date?: string;
  payment_method?: PaymentMethod;
  notes?: string;
  internal_notes?: string;
  status?: InvoiceStatus;
}

export interface CreateInvoicePaymentDTO {
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference?: string;
  notes?: string;
}

// Stats y Analytics
export interface InvoiceStats {
  total_invoices: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  overdue_amount: number;
  count_by_status: {
    [key in InvoiceStatus]: number;
  };
  monthly_revenue: {
    month: string;
    total: number;
    paid: number;
  }[];
}

// Filtros
export interface InvoiceFilters {
  status?: InvoiceStatus[];
  client_id?: string;
  date_from?: string;
  date_to?: string;
  invoice_number?: string;
  min_amount?: number;
  max_amount?: number;
}

// Helpers
export const InvoiceStatusLabels: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Borrador',
  [InvoiceStatus.APPROVED]: 'Aprobada',
  [InvoiceStatus.ISSUED]: 'Emitida',
  [InvoiceStatus.SENT]: 'Enviada',
  [InvoiceStatus.PAID]: 'Cobrada',
  [InvoiceStatus.PARTIAL]: 'Pago parcial',
  [InvoiceStatus.OVERDUE]: 'Vencida',
  [InvoiceStatus.CANCELLED]: 'Cancelada',
  [InvoiceStatus.RECTIFIED]: 'Rectificada',
  [InvoiceStatus.VOID]: 'Anulada'
};

export const PaymentMethodLabels: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Efectivo',
  [PaymentMethod.BANK_TRANSFER]: 'Transferencia',
  [PaymentMethod.CARD]: 'Tarjeta',
  [PaymentMethod.DIRECT_DEBIT]: 'Domiciliación',
  [PaymentMethod.PAYPAL]: 'PayPal',
  [PaymentMethod.OTHER]: 'Otro'
};

export const InvoiceTypeLabels: Record<InvoiceType, string> = {
  [InvoiceType.NORMAL]: 'Normal',
  [InvoiceType.SIMPLIFIED]: 'Simplificada',
  [InvoiceType.RECTIFICATIVE]: 'Rectificativa',
  [InvoiceType.SUMMARY]: 'Resumen'
};

// Utilidades
export function calculateItemSubtotal(
  quantity: number,
  unit_price: number,
  discount_percent: number = 0
): number {
  const base = quantity * unit_price;
  const discount = base * (discount_percent / 100);
  return base - discount;
}

export function calculateItemTax(
  subtotal: number,
  tax_rate: number
): number {
  return subtotal * (tax_rate / 100);
}

export function calculateItemTotal(
  quantity: number,
  unit_price: number,
  discount_percent: number = 0,
  tax_rate: number = 21
): { subtotal: number; tax_amount: number; total: number } {
  const subtotal = calculateItemSubtotal(quantity, unit_price, discount_percent);
  const tax_amount = calculateItemTax(subtotal, tax_rate);
  const total = subtotal + tax_amount;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax_amount: parseFloat(tax_amount.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
}

export function getInvoiceStatusColor(status: InvoiceStatus): string {
  const colors: Record<InvoiceStatus, string> = {
    [InvoiceStatus.DRAFT]: 'gray',
    [InvoiceStatus.APPROVED]: 'blue',
    [InvoiceStatus.ISSUED]: 'indigo',
    [InvoiceStatus.SENT]: 'cyan',
    [InvoiceStatus.PAID]: 'green',
    [InvoiceStatus.PARTIAL]: 'yellow',
    [InvoiceStatus.OVERDUE]: 'red',
    [InvoiceStatus.CANCELLED]: 'dark',
    [InvoiceStatus.RECTIFIED]: 'orange',
    [InvoiceStatus.VOID]: 'gray'
  };
  return colors[status];
}

export function isInvoiceEditable(invoice: Invoice): boolean {
  return invoice.status === InvoiceStatus.DRAFT && !invoice.deleted_at;
}

export function isInvoiceCancellable(invoice: Invoice): boolean {
  return invoice.status !== InvoiceStatus.CANCELLED &&
    invoice.status !== InvoiceStatus.PAID &&
    !invoice.deleted_at;
}

export function canAddPayment(invoice: Invoice): boolean {
  return invoice.status !== InvoiceStatus.CANCELLED &&
    invoice.status !== InvoiceStatus.PAID &&
    invoice.paid_amount < invoice.total &&
    !invoice.deleted_at;
}

export function getRemainingAmount(invoice: Invoice): number {
  return invoice.total - invoice.paid_amount;
}

export function isOverdue(invoice: Invoice): boolean {
  if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.CANCELLED) {
    return false;
  }
  const dueDate = new Date(invoice.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

// Normaliza la visualización de números de factura a prefijo "F"
// Acepta el objeto Invoice o un string ya construido y reemplaza cualquier serie central por "F".
export function formatInvoiceNumber(invoice: Invoice | string): string {
  let raw: string | undefined;
  if (typeof invoice === 'string') {
    raw = invoice;
  } else if (invoice) {
    raw = invoice.full_invoice_number ||
      (invoice.invoice_series && invoice.invoice_number ? `${invoice.invoice_series}-${invoice.invoice_number}` : undefined);
  }
  if (!raw) return '';
  // Reemplazar el segmento central de serie por F: YYYY-X-##### -> YYYY-F-#####
  return raw.replace(/-[A-Z]-/, '-F-');
}
