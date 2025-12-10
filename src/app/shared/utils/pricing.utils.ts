/**
 * =============================================================================
 * PRICING UTILITIES - Sistema unificado de cálculo de precios
 * =============================================================================
 * 
 * GLOSARIO:
 * - unit_price: El precio que introduce el usuario (siempre se almacena tal cual)
 * - subtotal: Base imponible (sin IVA, sin IRPF)
 * - tax_amount: Importe del IVA
 * - irpf_amount: Retención de IRPF
 * - total: Importe final a pagar (subtotal + IVA - IRPF)
 * 
 * CONFIGURACIONES:
 * - prices_include_tax (boolean): Si true, el unit_price YA incluye el IVA
 * - iva_enabled (boolean): Si se aplica IVA
 * - iva_rate (number): Porcentaje de IVA (0, 4, 10, 21)
 * - irpf_enabled (boolean): Si se aplica retención
 * - irpf_rate (number): Porcentaje de IRPF (7, 15)
 * 
 * REGLAS DE NEGOCIO:
 * 
 * 1. CUANDO prices_include_tax = TRUE:
 *    - El usuario introduce 150€ (precio final, IVA ya incluido)
 *    - subtotal = 150 / 1.21 = 123.97€ (base imponible extraída)
 *    - tax_amount = 150 - 123.97 = 26.03€ (IVA implícito)
 *    - total = 150€ (el precio que paga el cliente)
 *    - MOSTRAR: "Total: 150€" (el precio que introdujo)
 *    - En factura/presupuesto: Subtotal 123.97€ + IVA 26.03€ = Total 150€
 * 
 * 2. CUANDO prices_include_tax = FALSE:
 *    - El usuario introduce 150€ (precio neto, sin IVA)
 *    - subtotal = 150€
 *    - tax_amount = 150 * 0.21 = 31.50€
 *    - total = 150 + 31.50 = 181.50€
 *    - MOSTRAR: "Total: 181.50€"
 *    - En factura/presupuesto: Subtotal 150€ + IVA 31.50€ = Total 181.50€
 */

export interface TaxConfig {
  pricesIncludeTax: boolean;
  ivaEnabled: boolean;
  ivaRate: number;
  irpfEnabled: boolean;
  irpfRate: number;
}

export interface LineItemInput {
  quantity: number;
  unitPrice: number;       // El precio introducido por el usuario
  discountPercent?: number;
  taxRate?: number;        // Override del IVA para este item (opcional)
}

export interface LineItemCalculation {
  quantity: number;
  unitPrice: number;       // Precio tal como se introdujo
  
  // Base imponible
  baseAmount: number;      // quantity * unitPrice (antes de descuento)
  discountAmount: number;  // Descuento aplicado
  subtotal: number;        // Base imponible después de descuento
  
  // Impuestos
  taxRate: number;
  taxAmount: number;       // IVA calculado
  
  // Total
  total: number;           // subtotal + taxAmount (lo que paga el cliente)
  
  // Para mostrar en UI (según config)
  displayUnitPrice: number;
  displayTotal: number;
}

export interface DocumentCalculation {
  subtotal: number;        // Suma de subtotales (base imponible total)
  taxAmount: number;       // Suma de IVA
  irpfAmount: number;      // Retención IRPF (se resta del total)
  total: number;           // subtotal + taxAmount - irpfAmount
  
  // Lo que se muestra al usuario
  displayTotal: number;
}

/**
 * Calcula los valores de una línea/item
 */
export function calculateLineItem(
  input: LineItemInput,
  config: TaxConfig
): LineItemCalculation {
  const qty = input.quantity || 0;
  const unitPrice = input.unitPrice || 0;
  const discountPercent = input.discountPercent || 0;
  const taxRate = config.ivaEnabled ? (input.taxRate ?? config.ivaRate) : 0;
  
  // Importe base (antes de descuentos)
  const baseAmount = qty * unitPrice;
  
  // Aplicar descuento
  const discountAmount = baseAmount * (discountPercent / 100);
  const afterDiscount = baseAmount - discountAmount;
  
  let subtotal: number;
  let taxAmount: number;
  let total: number;
  
  if (config.pricesIncludeTax && taxRate > 0) {
    // El precio introducido YA incluye IVA
    // afterDiscount = subtotal + IVA = subtotal * (1 + taxRate/100)
    // Entonces: subtotal = afterDiscount / (1 + taxRate/100)
    const divisor = 1 + taxRate / 100;
    subtotal = afterDiscount / divisor;
    taxAmount = afterDiscount - subtotal;
    total = afterDiscount; // El total es lo que el usuario introdujo
  } else {
    // El precio NO incluye IVA
    subtotal = afterDiscount;
    taxAmount = subtotal * (taxRate / 100);
    total = subtotal + taxAmount;
  }
  
  return {
    quantity: qty,
    unitPrice: unitPrice,
    baseAmount: round(baseAmount),
    discountAmount: round(discountAmount),
    subtotal: round(subtotal),
    taxRate: taxRate,
    taxAmount: round(taxAmount),
    total: round(total),
    // Para mostrar siempre mostramos el precio como se introdujo
    displayUnitPrice: round(unitPrice),
    displayTotal: round(total),
  };
}

/**
 * Calcula los totales de un documento (presupuesto/factura)
 */
export function calculateDocumentTotals(
  items: LineItemCalculation[],
  config: TaxConfig
): DocumentCalculation {
  let subtotal = 0;
  let taxAmount = 0;
  
  for (const item of items) {
    subtotal += item.subtotal;
    taxAmount += item.taxAmount;
  }
  
  // Calcular IRPF sobre la base imponible
  const irpfAmount = config.irpfEnabled 
    ? subtotal * (config.irpfRate / 100) 
    : 0;
  
  // Total = Base + IVA - IRPF
  const total = subtotal + taxAmount - irpfAmount;
  
  return {
    subtotal: round(subtotal),
    taxAmount: round(taxAmount),
    irpfAmount: round(irpfAmount),
    total: round(total),
    displayTotal: round(total),
  };
}

/**
 * Calcula todo desde los inputs crudos
 */
export function calculateFromInputs(
  items: LineItemInput[],
  config: TaxConfig
): { lines: LineItemCalculation[]; totals: DocumentCalculation } {
  const lines = items.map(item => calculateLineItem(item, config));
  const totals = calculateDocumentTotals(lines, config);
  return { lines, totals };
}

/**
 * Redondea a 2 decimales
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Formatea un número como moneda
 */
export function formatCurrency(value: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency,
  }).format(value);
}

// =============================================================================
// EJEMPLOS DE USO
// =============================================================================
/*
// Ejemplo 1: Precio CON IVA incluido (prices_include_tax = true)
const config1: TaxConfig = {
  pricesIncludeTax: true,
  ivaEnabled: true,
  ivaRate: 21,
  irpfEnabled: false,
  irpfRate: 0,
};

const result1 = calculateLineItem({ quantity: 1, unitPrice: 150 }, config1);
// result1 = {
//   unitPrice: 150,
//   subtotal: 123.97,      // 150 / 1.21
//   taxAmount: 26.03,      // 150 - 123.97
//   total: 150,            // El cliente paga 150€
//   displayTotal: 150,
// }

// Ejemplo 2: Precio SIN IVA incluido (prices_include_tax = false)
const config2: TaxConfig = {
  pricesIncludeTax: false,
  ivaEnabled: true,
  ivaRate: 21,
  irpfEnabled: false,
  irpfRate: 0,
};

const result2 = calculateLineItem({ quantity: 1, unitPrice: 150 }, config2);
// result2 = {
//   unitPrice: 150,
//   subtotal: 150,
//   taxAmount: 31.50,      // 150 * 0.21
//   total: 181.50,         // El cliente paga 181.50€
//   displayTotal: 181.50,
// }
*/
