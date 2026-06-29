// ──────────────────────────────────────────────────────────────────────
// Customer Import Wizard — shared types
// ──────────────────────────────────────────────────────────────────────
// These types are consumed by:
//   - SupabaseCustomersService (the service-layer entry points for the
//     wizard: classify, build, import).
//   - CustomerImportWizardComponent (the wizard shell).
//   - CustomerImportDryRunComponent (the resolution table).
//   - CustomerImportResolutionComponent (likely-duplicate resolution).
//   - CustomerImportSummaryComponent (final counts).
//
// Kept in a separate file so the wizard components don't have to reach
// into the service file for type-only imports.
// ──────────────────────────────────────────────────────────────────────

import { CustomerLite, CustomerMatchCandidate } from './customer-matcher';

/** A raw CSV row mapped into typed fields. */
export interface CustomerCsvRow {
  /** 0-based index in the parsed CSV (skips header). */
  rowIndex: number;
  firstName: string | null;
  surname: string | null;
  email: string | null;
  phone: string | null;
  cif: string | null;
  dni: string | null;
  /** 'individual' | 'business' | 'self_employed' | 'consumer' | null */
  clientType: string | null;
  businessName: string | null;
  tradeName: string | null;
  legalRepresentativeName: string | null;
  legalRepresentativeDni: string | null;
  /** Free-form address (legacy single string, e.g. "PLAZA PAU VILA, 08039 BARCELONA"). */
  address: string | null;
  /** Structured address components from CSV columns like bill_to:city, bill_to:state. */
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  /** Original raw fields for editing (so the dry-run can re-edit). */
  raw: Record<string, string>;
}

/**
 * Classification result for a single CSV row.
 *
 * `valid` — all required fields present, no likely duplicate. Will be
 *           inserted as a new client on import.
 * `likely_duplicate` — the matcher found 1+ candidates that match this row
 *           (by email exact, cif/dni exact, or fuzzy name + apellido anchor).
 *           The user must explicitly choose Vincular / Crear nuevo / Saltar
 *           in the resolution step before import.
 * `alreadyExists` — the row matches an existing CRM client by email or
 *           cif/dni exact (not by fuzzy name — those are `likely_duplicate`).
 *           Will be auto-skipped on import (no INSERT).
 * `invalid` — missing required fields or malformed data. The user can edit
 *           inline to fix. Still re-classified after edits.
 */
export type RowClassificationStatus =
  | 'valid'
  | 'likely_duplicate'
  | 'alreadyExists'
  | 'invalid';

/** A single CSV row after classification. Mutates through the wizard. */
export interface ClassifiedCustomerRow {
  /** The original CSV row (mutable for inline edits). */
  csv: CustomerCsvRow;
  status: RowClassificationStatus;
  /** Match candidates from the CRM, sorted by Jaccard descending. Empty for
   *  `valid` and `alreadyExists` rows (no ambiguity to resolve). */
  candidates: CustomerMatchCandidate[];
  /** Which field of the row caused `invalid` status (if applicable). */
  invalidFields: string[];
  /** User's resolution: if the user picked Vincular/Crear nuevo/Saltar
   *  in the resolution modal, this captures the decision. */
  resolution?: {
    /** 'link' = use the candidate's id, 'create' = force new, 'skip' = drop. */
    choice: 'link' | 'create' | 'skip';
    /** CRM client id if choice === 'link'. */
    linkedClientId?: string;
  };
}

/** Payload for INSERT (only includes resolved rows that should be created). */
export interface CustomerInsertPayload {
  /** Original CSV row index — used in the failure report. */
  csvRowIndex: number;
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
  dni: string | null;
  client_type: 'individual' | 'business' | 'self_employed' | 'consumer';
  business_name: string | null;
  cif_nif: string | null;
  trade_name: string | null;
  legal_representative_name: string | null;
  legal_representative_dni: string | null;
  /** Source tag for downstream analytics. */
  source: 'csv-wizard';
  metadata: Record<string, unknown>;
}

/** Progress event emitted by `importCustomersWizard`. */
export interface CustomerImportProgress {
  importedCount: number;
  alreadyExistsCount: number;
  skippedCount: number;
  failedCount: number;
  totalCount: number;
  /** Most recent error (if any). The full errors array is returned on
   *  completion via the Promise/Subject's terminal emission. */
  latestError?: { rowIndex: number; errorCode: string; errorMessage: string };
}

/** Re-export for convenience. */
export type { CustomerLite, CustomerMatchCandidate } from './customer-matcher';