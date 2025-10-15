/**
 * MODELOS DE PRESUPUESTOS (QUOTES)
 * 
 * Sistema completo de gestión de presupuestos con:
 * - Numeración automática
 * - Estados del ciclo de vida
 * - Conversión a facturas
 * - Seguimiento de cliente
 * - GDPR compliance
 */

// =====================================================
// ENUMS
// =====================================================

export enum QuoteStatus {
  DRAFT = 'draft',           // Borrador
  SENT = 'sent',              // Enviado al cliente
  VIEWED = 'viewed',          // Visto por el cliente
  ACCEPTED = 'accepted',      // Aceptado
  REJECTED = 'rejected',      // Rechazado
  EXPIRED = 'expired',        // Expirado
  INVOICED = 'invoiced',      // Convertido a factura
  CANCELLED = 'cancelled'     // Cancelado
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: 'Borrador',
  [QuoteStatus.SENT]: 'Enviado',
  [QuoteStatus.VIEWED]: 'Visto',
  [QuoteStatus.ACCEPTED]: 'Aceptado',
  [QuoteStatus.REJECTED]: 'Rechazado',
  [QuoteStatus.EXPIRED]: 'Expirado',
  [QuoteStatus.INVOICED]: 'Facturado',
  [QuoteStatus.CANCELLED]: 'Cancelado'
};

export const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: 'gray',
  [QuoteStatus.SENT]: 'blue',
  [QuoteStatus.VIEWED]: 'cyan',
  [QuoteStatus.ACCEPTED]: 'green',
  [QuoteStatus.REJECTED]: 'red',
  [QuoteStatus.EXPIRED]: 'orange',
  [QuoteStatus.INVOICED]: 'purple',
  [QuoteStatus.CANCELLED]: 'gray'
};

// =====================================================
// INTERFACES PRINCIPALES
// =====================================================

export interface Quote {
  // Identificación
  id: string;
  company_id: string;
  client_id: string;
  
  // Numeración
  quote_number: string;
  year: number;
  sequence_number: number;
  full_quote_number: string; // Generado: 2025-Q-00001
  
  // Estado y fechas
  status: QuoteStatus;
  quote_date: string; // ISO date
  valid_until: string; // ISO date
  accepted_at?: string | null;
  rejected_at?: string | null;
  invoiced_at?: string | null;
  
  // Referencia a factura
  invoice_id?: string | null;
  
  // Información
  title: string;
  description?: string | null;
  notes?: string | null;
  terms_conditions?: string | null;
  
  // Totales
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  discount_percent?: number;
  discount_amount?: number;
  
  // Adicional
  currency: string;
  language: string;
  
  // Seguimiento cliente
  client_viewed_at?: string | null;
  client_ip_address?: string | null;
  client_user_agent?: string | null;
  
  // PDF
  pdf_url?: string | null;
  pdf_generated_at?: string | null;
  
  // Firma digital
  digital_signature?: string | null;
  signature_timestamp?: string | null;
  
  // Auditoría
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  
  // GDPR
  is_anonymized: boolean;
  anonymized_at?: string | null;
  retention_until: string;
  
  // Relaciones (populated)
  client?: any; // Client interface
  invoice?: any; // Invoice interface
  items?: QuoteItem[];
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  company_id: string;
  
  // Ordenamiento
  line_number: number;
  
  // Información
  description: string;
  quantity: number;
  unit_price: number;
  
  // Impuestos
  tax_rate: number;
  tax_amount: number;
  
  // Descuento
  discount_percent?: number;
  discount_amount?: number;
  
  // Totales
  subtotal: number;
  total: number;
  
  // Adicional
  notes?: string | null;
  
  // Auditoría
  created_at: string;
  updated_at: string;
}

export interface QuoteTemplate {
  id: string;
  company_id: string;
  
  // Información
  name: string;
  description?: string | null;
  
  // Plantillas
  title_template?: string | null;
  description_template?: string | null;
  notes_template?: string | null;
  terms_conditions_template?: string | null;
  
  // Items predefinidos
  default_items?: QuoteTemplateItem[];
  
  // Configuración
  default_valid_days: number;
  default_tax_rate: number;
  
  // Uso
  is_active: boolean;
  usage_count: number;
  last_used_at?: string | null;
  
  // Auditoría
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteTemplateItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  notes?: string;
}

// =====================================================
// DTOs (Data Transfer Objects)
// =====================================================

export interface CreateQuoteDTO {
  client_id: string;
  title: string;
  description?: string;
  notes?: string;
  terms_conditions?: string;
  quote_date?: string; // ISO date, default: today
  valid_until?: string; // ISO date, default: +30 days
  currency?: string; // default: EUR
  language?: string; // default: es
  items: CreateQuoteItemDTO[];
  discount_percent?: number;
}

export interface CreateQuoteItemDTO {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number; // default: 21
  discount_percent?: number;
  notes?: string;
}

export interface UpdateQuoteDTO {
  title?: string;
  description?: string;
  notes?: string;
  terms_conditions?: string;
  valid_until?: string;
  status?: QuoteStatus;
  discount_percent?: number;
}

export interface UpdateQuoteItemDTO {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax_rate?: number;
  discount_percent?: number;
  notes?: string;
}

export interface QuoteFilters {
  client_id?: string;
  status?: QuoteStatus | QuoteStatus[];
  from_date?: string;
  to_date?: string;
  search?: string; // Buscar en título, número, descripción
  is_expired?: boolean;
  has_invoice?: boolean;
}

export interface QuoteSortOptions {
  field: 'quote_date' | 'valid_until' | 'total_amount' | 'status' | 'full_quote_number';
  direction: 'asc' | 'desc';
}

// =====================================================
// RESPUESTAS DE FUNCIONES
// =====================================================

export interface ConvertQuoteToInvoiceResponse {
  invoice_id: string;
  success: boolean;
  message: string;
}

export interface QuoteClientView {
  quote: Quote;
  company: {
    name: string;
    logo_url?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  client: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  items: QuoteItem[];
  can_accept: boolean; // true si no está expirado y status = sent/viewed
  days_remaining: number; // días hasta expiración
}

export interface QuoteStats {
  total_quotes: number;
  total_amount: number;
  by_status: {
    status: QuoteStatus;
    count: number;
    total_amount: number;
  }[];
  acceptance_rate: number; // % de aceptados vs enviados
  average_amount: number;
  conversion_rate: number; // % de convertidos a factura
}

// =====================================================
// UTILIDADES
// =====================================================

/**
 * Calcula el total de un item de presupuesto
 */
export function calculateQuoteItemTotal(item: CreateQuoteItemDTO | QuoteItem): {
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
} {
  const quantity = item.quantity;
  const unitPrice = item.unit_price;
  const taxRate = ('tax_rate' in item && item.tax_rate !== undefined) ? item.tax_rate : 21;
  const discountPercent = item.discount_percent || 0;
  
  // Subtotal antes de descuento
  let subtotal = quantity * unitPrice;
  
  // Descuento
  const discountAmount = subtotal * (discountPercent / 100);
  subtotal -= discountAmount;
  
  // Impuesto
  const taxAmount = subtotal * (taxRate / 100);
  
  // Total
  const total = subtotal + taxAmount;
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount_amount: Math.round(discountAmount * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

/**
 * Calcula los totales de un presupuesto
 */
export function calculateQuoteTotals(items: (CreateQuoteItemDTO | QuoteItem)[]): {
  subtotal: number;
  tax_amount: number;
  total_amount: number;
} {
  let subtotal = 0;
  let taxAmount = 0;
  
  items.forEach(item => {
    const itemTotal = calculateQuoteItemTotal(item);
    subtotal += itemTotal.subtotal;
    taxAmount += itemTotal.tax_amount;
  });
  
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    total_amount: Math.round((subtotal + taxAmount) * 100) / 100
  };
}

/**
 * Valida si un presupuesto está expirado
 */
export function isQuoteExpired(quote: Quote): boolean {
  return new Date(quote.valid_until) < new Date() && 
         ![QuoteStatus.ACCEPTED, QuoteStatus.REJECTED, QuoteStatus.INVOICED, QuoteStatus.CANCELLED].includes(quote.status);
}

/**
 * Calcula días restantes hasta expiración
 */
export function getDaysUntilExpiration(quote: Quote): number {
  const today = new Date();
  const validUntil = new Date(quote.valid_until);
  const diffTime = validUntil.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Verifica si el presupuesto puede ser aceptado
 */
export function canAcceptQuote(quote: Quote): boolean {
  return [QuoteStatus.SENT, QuoteStatus.VIEWED].includes(quote.status) && 
         !isQuoteExpired(quote);
}

/**
 * Verifica si el presupuesto puede ser editado
 */
export function canEditQuote(quote: Quote): boolean {
  return [QuoteStatus.DRAFT].includes(quote.status);
}

/**
 * Verifica si el presupuesto puede ser convertido a factura
 */
export function canConvertToInvoice(quote: Quote): boolean {
  return quote.status === QuoteStatus.ACCEPTED && !quote.invoice_id;
}

/**
 * Genera fecha de validez por defecto (+30 días)
 */
export function getDefaultValidUntil(fromDate: Date = new Date()): string {
  const validUntil = new Date(fromDate);
  validUntil.setDate(validUntil.getDate() + 30);
  return validUntil.toISOString().split('T')[0];
}

/**
 * Formatea número de presupuesto para mostrar
 */
export function formatQuoteNumber(quote: Quote): string {
  return quote.full_quote_number || `${quote.year}-Q-${String(quote.sequence_number).padStart(5, '0')}`;
}
