/**
 * Recurring Budget models
 * "Presupuesto Recurrente" — generado automáticamente desde servicios
 * contratados con recurrencia configurada.
 */

// ── Enums ───────────────────────────────────────────────────────────────────

/** Estado del presupuesto recurrente */
export enum RecurringBudgetStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

/** Etiquetas en español */
export const RECURRING_BUDGET_STATUS_LABELS: Record<RecurringBudgetStatus, string> = {
  [RecurringBudgetStatus.DRAFT]: 'Borrador',
  [RecurringBudgetStatus.SENT]: 'Enviado',
  [RecurringBudgetStatus.PAID]: 'Cobrado',
  [RecurringBudgetStatus.CANCELLED]: 'Cancelado',
};

/** Tipo de recurrencia (coincide con contracted_services.recurrence_type) */
export enum RecurrenceType {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

// ── Core Interfaces ─────────────────────────────────────────────────────────

/** Presupuesto generado automáticamente desde servicios contratados */
export interface RecurringBudget {
  id: string;
  client_id: string;
  company_id: string;

  /** Periodo: "YYYY-Www" | "YYYY-MM" | "YYYY" */
  period: string;
  recurrence_type: RecurrenceType;

  /** Fecha de emisión */
  issue_date: string; // ISO date (YYYY-MM-DD)
  /** Fecha de vencimiento (default issue_date + 30 días) */
  due_date: string;   // ISO date (YYYY-MM-DD)

  // Financials
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;

  status: RecurringBudgetStatus;
  notes?: string | null;

  // Metadata
  created_at: string;
  updated_at: string;

  // Joined fields (for display)
  client_name?: string;
  lines?: RecurringBudgetLine[];
}

/** Línea de un presupuesto recurrente */
export interface RecurringBudgetLine {
  id: string;
  budget_id: string;
  contracted_service_id: string;

  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;

  sort_order: number;
  created_at: string;

  // Joined fields
  contracted_service_name?: string;
}

// ── Generation Result ───────────────────────────────────────────────────────

/** Resultado de una ejecución de generate_recurring_budgets() */
export interface GenerationResult {
  budget_id: string | null;
  client_id: string;
  period: string;
  lines_count: number;
  action: 'created' | 'skipped' | 'dry_run';
}

// ── Payloads ────────────────────────────────────────────────────────────────

export interface UpdateRecurringBudgetPayload {
  status?: RecurringBudgetStatus;
  notes?: string;
  due_date?: string;
}

// ── Validators ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Valida un payload de actualización de presupuesto recurrente.
 */
export function validateRecurringBudgetUpdate(
  payload: UpdateRecurringBudgetPayload
): ValidationResult {
  const errors: string[] = [];

  if (
    payload.status !== undefined &&
    !Object.values(RecurringBudgetStatus).includes(payload.status)
  ) {
    errors.push(
      `status inválido: "${payload.status}". Valores permitidos: ${Object.values(RecurringBudgetStatus).join(', ')}`
    );
  }

  if (payload.due_date !== undefined) {
    const d = new Date(payload.due_date);
    if (isNaN(d.getTime())) {
      errors.push('due_date no es una fecha válida');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** IVA por defecto (España) */
export const DEFAULT_TAX_RATE = 21.0;

/** Días por defecto para la fecha de vencimiento */
export const DEFAULT_DUE_DAYS = 30;

/**
 * Calcula el periodo para una fecha y tipo de recurrencia (frontend helper).
 * Replica la lógica de calculate_recurrence_period() en SQL.
 */
export function calculatePeriodLabel(date: Date, type: RecurrenceType): string {
  const yyyy = date.getFullYear();

  switch (type) {
    case RecurrenceType.WEEKLY: {
      // ISO week number
      const startOfYear = new Date(yyyy, 0, 1);
      const days = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
      const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      // Handle edge case: last days of December may belong to week 1 of next year
      if (date.getMonth() === 11 && week === 1) {
        return `${yyyy + 1}-W${String(week).padStart(2, '0')}`;
      }
      return `${yyyy}-W${String(week).padStart(2, '0')}`;
    }

    case RecurrenceType.MONTHLY: {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}`;
    }

    case RecurrenceType.YEARLY:
      return `${yyyy}`;

    default:
      return date.toISOString().split('T')[0];
  }
}

/**
 * Determina si una fecha coincide con el día de recurrencia configurado.
 */
export function isRecurrenceDayMatch(
  date: Date,
  type: RecurrenceType,
  day: number
): boolean {
  switch (type) {
    case RecurrenceType.WEEKLY: {
      // JS getDay(): 0=Sun, 1=Mon, …, 6=Sat
      // Our encoding: 1=Mon, 7=Sun
      let dow = date.getDay();
      if (dow === 0) dow = 7;
      return dow === day;
    }

    case RecurrenceType.MONTHLY:
      return date.getDate() === day;

    case RecurrenceType.YEARLY: {
      // Day of year (1-365)
      const startOfYear = new Date(date.getFullYear(), 0, 0);
      const doy = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
      return doy === day;
    }

    default:
      return false;
  }
}

/**
 * Calcula los totales del presupuesto a partir de sus líneas.
 */
export function calculateBudgetTotals(
  lines: Array<{ unit_price: number; tax_rate: number }>
): { subtotal: number; tax_amount: number; total: number } {
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price, 0);
  // Tax is calculated on the full subtotal (not per-line average)
  const taxRate = lines.length > 0 ? lines[0].tax_rate : DEFAULT_TAX_RATE;
  const taxAmount = Math.round(subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Verifica si un presupuesto puede ser editado.
 */
export function canEditRecurringBudget(budget: RecurringBudget): boolean {
  return budget.status === RecurringBudgetStatus.DRAFT;
}

/**
 * Verifica si un presupuesto puede ser cancelado.
 */
export function canCancelRecurringBudget(budget: RecurringBudget): boolean {
  return budget.status !== RecurringBudgetStatus.PAID
    && budget.status !== RecurringBudgetStatus.CANCELLED;
}

/**
 * Verifica si un presupuesto está vencido.
 */
export function isBudgetOverdue(budget: RecurringBudget): boolean {
  if (
    budget.status === RecurringBudgetStatus.PAID
    || budget.status === RecurringBudgetStatus.CANCELLED
  ) {
    return false;
  }
  return new Date(budget.due_date) < new Date();
}
