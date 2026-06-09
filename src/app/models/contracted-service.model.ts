/**
 * Contracted Service models
 * "Servicio Contratado" — un servicio que un cliente ha contratado,
 * con precio, estado y configuración de recurrencia opcional.
 */

// ── Enums ───────────────────────────────────────────────────────────────────

/** Estado del servicio contratado */
export enum ContractedServiceStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

/** Tipo de recurrencia para servicios periódicos */
export enum RecurrenceType {
  MONTHLY = 'monthly',
  WEEKLY = 'weekly',
  YEARLY = 'yearly',
}

// ── Core Interface ──────────────────────────────────────────────────────────

/** Representa un servicio contratado por un cliente */
export interface ContractedService {
  id: string;
  client_id: string;
  company_id: string;

  // Core fields
  name: string;
  description?: string;
  price: number;
  currency: string;
  start_date: string;          // ISO date (YYYY-MM-DD)
  status: ContractedServiceStatus;

  // Recurrence (optional — null if non-recurring)
  recurrence_type?: RecurrenceType | null;
  recurrence_day?: number | null;   // 1-31 (day of month/week encoding)
  recurrence_start?: string | null; // ISO date
  recurrence_end?: string | null;   // ISO date, null = indefinite

  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  deleted_at?: string | null;

  // Joined fields (for display)
  client_name?: string;
}

// ── Payloads ────────────────────────────────────────────────────────────────

/** Payload for creating a new contracted service */
export interface CreateContractedServicePayload {
  client_id: string;
  company_id: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  start_date?: string;
  status?: ContractedServiceStatus;
  recurrence_type?: RecurrenceType | null;
  recurrence_day?: number | null;
  recurrence_start?: string | null;
  recurrence_end?: string | null;
  created_by?: string;
}

/** Payload for updating an existing contracted service */
export interface UpdateContractedServicePayload {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  start_date?: string;
  status?: ContractedServiceStatus;
  recurrence_type?: RecurrenceType | null;
  recurrence_day?: number | null;
  recurrence_start?: string | null;
  recurrence_end?: string | null;
}

// ── Validators ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Mapping of recurrence type to valid day ranges */
const RECURRENCE_DAY_RANGES: Record<RecurrenceType, { min: number; max: number; label: string }> = {
  [RecurrenceType.MONTHLY]: { min: 1, max: 28, label: '1-28' },
  [RecurrenceType.WEEKLY]:  { min: 1, max: 7,  label: '1 (Lunes) - 7 (Domingo)' },
  [RecurrenceType.YEARLY]:  { min: 1, max: 365, label: '1-365 (día del año)' },
};

/**
 * Validate recurrence fields against business rules.
 *
 * Rules:
 *  - recurrence_type IS required IF any recurrence field is set
 *  - recurrence_day IS required IF recurrence_type is set
 *  - recurrence_start IS required IF recurrence_type is set
 *  - recurrence_end (if set) must be >= recurrence_start
 *  - recurrence_day must be within the valid range for the type
 */
export function validateRecurrence(payload: {
  recurrence_type?: RecurrenceType | null;
  recurrence_day?: number | null;
  recurrence_start?: string | null;
  recurrence_end?: string | null;
}): ValidationResult {
  const errors: string[] = [];
  const { recurrence_type, recurrence_day, recurrence_start, recurrence_end } = payload;

  // If nothing is set, that's fine — non-recurring service
  if (!recurrence_type && !recurrence_day && !recurrence_start && !recurrence_end) {
    return { valid: true, errors: [] };
  }

  // If some fields are set but not others
  if (recurrence_type && !recurrence_day) {
    errors.push('recurrence_day es obligatorio cuando recurrence_type está definido');
  }

  if (recurrence_type && !recurrence_start) {
    errors.push('recurrence_start (fecha de inicio) es obligatorio cuando recurrence_type está definido');
  }

  if (recurrence_day && !recurrence_type) {
    errors.push('recurrence_type es obligatorio cuando recurrence_day está definido');
  }

  if (recurrence_start && !recurrence_type) {
    errors.push('recurrence_type es obligatorio cuando recurrence_start está definido');
  }

  // Validate recurrence_day range
  if (recurrence_type && recurrence_day != null) {
    const range = RECURRENCE_DAY_RANGES[recurrence_type];
    if (range && (recurrence_day < range.min || recurrence_day > range.max)) {
      errors.push(
        `recurrence_day fuera de rango para ${recurrence_type}: debe estar entre ${range.label}`
      );
    }
  }

  // Validate recurrence_end >= recurrence_start
  if (recurrence_start && recurrence_end) {
    if (new Date(recurrence_end) < new Date(recurrence_start)) {
      errors.push('recurrence_end no puede ser anterior a recurrence_start');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a full contracted service payload (create or update).
 * Performs:
 *  - Price must be >= 0
 *  - Name must be non-empty
 *  - Client ID must be provided (on create)
 *  - Recurrence rules if recurrence fields present
 */
export function validateContractedService(
  payload: Partial<CreateContractedServicePayload>,
  isUpdate: boolean = false
): ValidationResult {
  const errors: string[] = [];

  // On create, certain fields are required
  if (!isUpdate) {
    if (!payload.client_id) {
      errors.push('client_id es obligatorio');
    }
    if (!payload.company_id) {
      errors.push('company_id es obligatorio');
    }
  }

  if (payload.name !== undefined) {
    if (!payload.name || payload.name.trim().length === 0) {
      errors.push('name no puede estar vacío');
    }
  }

  if (payload.price !== undefined) {
    if (payload.price < 0) {
      errors.push('price no puede ser negativo');
    }
  }

  // Validate status
  if (
    payload.status !== undefined &&
    !Object.values(ContractedServiceStatus).includes(payload.status)
  ) {
    errors.push(
      `status inválido: "${payload.status}". Valores permitidos: ${Object.values(ContractedServiceStatus).join(', ')}`
    );
  }

  // Validate recurrence
  const recurrenceResult = validateRecurrence({
    recurrence_type: payload.recurrence_type,
    recurrence_day: payload.recurrence_day,
    recurrence_start: payload.recurrence_start,
    recurrence_end: payload.recurrence_end,
  });
  errors.push(...recurrenceResult.errors);

  return { valid: errors.length === 0, errors };
}
