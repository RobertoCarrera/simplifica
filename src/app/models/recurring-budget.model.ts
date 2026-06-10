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

/** Estado de pago (independiente del estado comercial) */
export enum RecurringBudgetPaymentStatus {
  UNPAID = 'unpaid',
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

export const RECURRING_BUDGET_PAYMENT_STATUS_LABELS: Record<RecurringBudgetPaymentStatus, string> = {
  [RecurringBudgetPaymentStatus.UNPAID]: 'Pendiente de pago',
  [RecurringBudgetPaymentStatus.PENDING]: 'Pago en curso',
  [RecurringBudgetPaymentStatus.PAID]: 'Cobrado',
  [RecurringBudgetPaymentStatus.REFUNDED]: 'Devuelto',
  [RecurringBudgetPaymentStatus.FAILED]: 'Pago fallido',
};

/** Provider de pago soportado por el flujo de presupuestos */
export type RecurringBudgetPaymentProvider =
  | 'stripe'
  | 'paypal'
  | 'cash'
  | 'bank_transfer'
  | 'other'
  | null;

export const PAYMENT_PROVIDER_LABELS: Record<NonNullable<RecurringBudgetPaymentProvider>, string> = {
  stripe: 'Tarjeta (Stripe)',
  paypal: 'PayPal',
  cash: 'Efectivo',
  bank_transfer: 'Transferencia bancaria',
  other: 'Otro',
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
  /** Moneda (default 'EUR'). Coincide con la del cliente/company. */
  currency?: string;

  // Estado comercial + estado de pago
  status: RecurringBudgetStatus;
  payment_status?: RecurringBudgetPaymentStatus | string | null;
  payment_provider?: RecurringBudgetPaymentProvider;

  // Pago
  payment_link_token?: string | null;
  payment_link_expires_at?: string | null;
  paid_at?: string | null;
  paid_amount?: number | null;
  payment_reference?: string | null;

  // Recibo
  receipt_pdf_path?: string | null;
  receipt_generated_at?: string | null;

  // Notes
  notes?: string | null;

  // Metadata
  created_at: string;
  updated_at: string;

  // Joined fields (for display)
  client_name?: string;
  lines?: RecurringBudgetLine[];

  // Historial de pagos (joined — se carga bajo demanda con loadPaymentHistory)
  payments?: RecurringBudgetPayment[];
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

/** Pago individual sobre un presupuesto recurrente (append-only history) */
export interface RecurringBudgetPayment {
  id: string;
  budget_id: string;
  company_id: string;
  client_id: string;

  provider: NonNullable<RecurringBudgetPaymentProvider>;
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';

  amount: number;
  currency: string;
  fee?: number | null;
  net_amount?: number | null;

  provider_reference?: string | null;
  provider_metadata?: Record<string, any> | null;

  paid_at: string; // timestamptz
  notes?: string | null;

  receipt_pdf_path?: string | null;
  receipt_url?: string | null;

  created_at: string;
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

// ── Notification Settings ───────────────────────────────────────────────────

/** Locale soportado para las plantillas de email de presupuestos */
export type BudgetNotificationLocale = 'es' | 'ca' | 'en';

/**
 * Configuración de notificaciones de presupuestos recurrentes por
 * company. Define la cadencia de recordatorios antes del vencimiento
 * (reminder_days_before, array de enteros no-negativos) y después
 * (overdue_days_after), así como los switches maestro de canales
 * (in-app + email).
 *
 * Un solo registro por company (PRIMARY KEY company_id). Ver tabla
 * `budget_notification_settings` creada en la migración
 * 20260610000000_budget_notifications_config.sql.
 */
export interface BudgetNotificationSettings {
  company_id: string;

  /** Master switch — si false, no se envía email de ningún tipo */
  email_enabled: boolean;

  /** In-app (campana del portal cliente) */
  inapp_on_create: boolean;
  inapp_on_reminder: boolean;
  inapp_on_overdue: boolean;

  /** Email (plantilla branded vía send-branded-email) */
  email_on_create: boolean;
  email_on_reminder: boolean;
  email_on_overdue: boolean;

  /**
   * Días ANTES de due_date en los que enviar un recordatorio.
   * Array vacío = desactivado. Por defecto [3] (T-3).
   */
  reminder_days_before: number[];

  /**
   * Días DESPUÉS de due_date en los que enviar un aviso de vencimiento.
   * 0 = el mismo día. Por defecto [0, 3].
   */
  overdue_days_after: number[];

  /** Locale para los textos del email (es/ca/en) */
  locale: BudgetNotificationLocale;

  // ── Booking change notifications (migration 20260610000002) ──────────
  /** Master switch — si false, no se envía email por cambios en reservas. */
  booking_email_enabled: boolean;
  /** Master switch — si false, no se inserta notification in-app por cambios en reservas. */
  booking_inapp_enabled: boolean;
  /** Notificar al cliente cuando su reserva se crea/modifica/cancela/reagenda. */
  booking_notify_client: boolean;
  /** Notificar al profesional asignado cuando se modifica/cancela/reagenda una de sus reservas. */
  booking_notify_professional: boolean;
  /** Notificar a admins/owners/super_admins de la company. */
  booking_notify_admin: boolean;
  /** Si true, los admins reciben BCC de los emails a cliente/profesional. */
  booking_email_cc_admin: boolean;

  /**
   * Sincronizar cambios de reservas con Google Calendar (migration
   * 20260610000003). Si true, el frontend llama a `google-auth`
   * update-event/delete-event al modificar/cancelar una reserva y
   * Google envía notificaciones a los attendees (`sendUpdates=all`).
   * Si false, el frontend skipea esas llamadas para ahorrar cuota API
   * y evitar emails automáticos de Google. El email branded de
   * Simplifica sigue funcionando si `booking_email_enabled=true`.
   */
  booking_google_calendar_enabled: boolean;

  created_at: string;
  updated_at: string;
}

/** Payload para actualizar la configuración de recordatorios */
export interface UpdateBudgetNotificationSettingsPayload {
  email_enabled?: boolean;
  inapp_on_create?: boolean;
  inapp_on_reminder?: boolean;
  inapp_on_overdue?: boolean;
  email_on_create?: boolean;
  email_on_reminder?: boolean;
  email_on_overdue?: boolean;
  reminder_days_before?: number[];
  overdue_days_after?: number[];
  locale?: BudgetNotificationLocale;

  // Booking change notifications (migration 20260610000002).
  booking_email_enabled?: boolean;
  booking_inapp_enabled?: boolean;
  booking_notify_client?: boolean;
  booking_notify_professional?: boolean;
  booking_notify_admin?: boolean;
  booking_email_cc_admin?: boolean;
  // Google Calendar sync toggle (migration 20260610000003).
  booking_google_calendar_enabled?: boolean;
}

/** Tipo de cambio de reserva que dispara notificaciones. */
export type BookingChangeType =
  | 'created'
  | 'updated'
  | 'rescheduled'
  | 'cancelled'
  | 'deleted';

export const BOOKING_CHANGE_TYPE_LABELS: Record<BookingChangeType, string> = {
  created:     'Creada',
  updated:     'Modificada',
  rescheduled: 'Reagendada',
  cancelled:   'Cancelada',
  deleted:     'Eliminada',
};

/** Una fila de audit log de notificaciones de presupuesto */
export interface BudgetNotificationLogEntry {
  id: string;
  budget_id: string;
  company_id: string;
  kind: 'created' | 'reminder' | 'overdue';
  day_offset: number | null;
  sent_at: string;
  channels: {
    inapp?: boolean;
    email?: boolean;
  };
}

/** Fila del RPC list_company_budget_due_summary(company_id) */
export interface CompanyBudgetDueSummaryRow {
  budget_id: string;
  client_id: string;
  client_name: string | null;
  period: string;
  recurrence_type: string;
  total: number | string;
  currency: string;
  due_date: string;
  days_to_due: number;
  is_overdue: boolean;
  payment_status: string;
  status: string;
  last_reminder_sent_at: string | null;
  last_overdue_sent_at: string | null;
  last_created_sent_at: string | null;
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

// ── Payment helpers ────────────────────────────────────────────────────────

/**
 * Determina si un presupuesto admite el botón "Pagar ahora" en el portal.
 * Reglas: NO está pagado, NO está cancelado, NO está en estado DRAFT
 * (los borradores aún no están listos para cobrar), y su link de pago
 * — si existe — no está expirado.
 */
export function canPayRecurringBudget(budget: RecurringBudget): boolean {
  // Comercial: ya cobrado o cancelado → no
  if (
    budget.status === RecurringBudgetStatus.PAID
    || budget.status === RecurringBudgetStatus.CANCELLED
    || budget.status === RecurringBudgetStatus.DRAFT
  ) {
    return false;
  }
  // Pago: ya cobrado / devuelto → no
  const ps = (budget.payment_status as string) || '';
  if (ps === RecurringBudgetPaymentStatus.PAID
      || ps === RecurringBudgetPaymentStatus.REFUNDED) {
    return false;
  }
  // Si hay token, comprobar expiración
  if (budget.payment_link_expires_at) {
    const exp = new Date(budget.payment_link_expires_at);
    if (exp < new Date()) return false;
  }
  return true;
}

/**
 * Determina el estado derivado del presupuesto para mostrar en la UI.
 * Combina el estado comercial y el de pago.
 */
export function deriveBudgetPaymentState(budget: RecurringBudget): {
  key: 'paid' | 'unpaid' | 'overdue' | 'pending' | 'cancelled' | 'refunded';
  label: string;
  color: 'green' | 'red' | 'amber' | 'blue' | 'gray';
} {
  if (budget.status === RecurringBudgetStatus.CANCELLED) {
    return { key: 'cancelled', label: 'Cancelado', color: 'gray' };
  }
  const ps = (budget.payment_status as string) || 'unpaid';
  if (ps === RecurringBudgetPaymentStatus.PAID) {
    return { key: 'paid', label: 'Cobrado', color: 'green' };
  }
  if (ps === RecurringBudgetPaymentStatus.REFUNDED) {
    return { key: 'refunded', label: 'Devuelto', color: 'gray' };
  }
  if (ps === RecurringBudgetPaymentStatus.PENDING) {
    return { key: 'pending', label: 'Pago en curso', color: 'blue' };
  }
  // unpaid
  if (isBudgetOverdue(budget)) {
    return { key: 'overdue', label: 'Vencido', color: 'red' };
  }
  return { key: 'unpaid', label: 'Pendiente de pago', color: 'amber' };
}

/**
 * Suma el total cobrado de un historial de pagos (solo succeeded).
 */
export function sumSuccessfulPayments(payments: RecurringBudgetPayment[] | undefined | null): number {
  if (!payments || payments.length === 0) return 0;
  return payments
    .filter((p) => p.status === 'succeeded')
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);
}

/**
 * Decide si se puede generar / descargar el recibo en PDF.
 */
export function canDownloadReceipt(budget: RecurringBudget): boolean {
  return !!(
    budget.receipt_pdf_path
    || (budget.payment_status as string) === RecurringBudgetPaymentStatus.PAID
  );
}
