import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuditLoggerService } from './audit-logger.service';
import { AuthService } from './auth.service';
import { Observable, from, of, forkJoin } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

// =====================================================================
// Types
// =====================================================================

/** A row as resolved by the wizard after CSV mapping. */
export interface ResolvedClinicalRow {
  rowIndex: number;
  patientId: string | null;
  firstName: string | null;
  lastName: string | null;
  episodeId: string | null;
  appointmentId: string | null;
  sequence: number | null;
  date: string | null; // ISO date
  title: string | null;
  value: string; // The note body — kept only in-memory, never logged
  /** Optional: filled in by matchClients / resolution step */
  clientId?: string | null;
}

/** Status assigned by the dry-run match step. */
export type ClinicalMatchStatus =
  | 'matched'
  | 'ambiguous'
  | 'unresolved'
  | 'missing-episode'
  | 'skipped'
  | 'consent-not-granted';

export interface ClinicalCandidate {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  health_data_consent: boolean | null;
  company_id: string;
}

export interface MatchedClinicalRow extends ResolvedClinicalRow {
  status: ClinicalMatchStatus;
  clientId: string | null;
  candidates: ClinicalCandidate[];
}

export interface ImportChunkContext {
  companyId: string;
  userId: string;
}

export interface ImportRowResult {
  rowIndex: number;
  ok: boolean;
  deduped: boolean;
  noteId?: string;
  clientId?: string;
  errorCode?:
    | 'consent_not_granted'
    | 'rpc_error'
    | 'invalid_value'
    | 'no_client'
    | 'module_not_enabled'
    | 'access_denied';
  errorMessage?: string;
}

export interface ImportChunkResult {
  ok: ImportRowResult[];
  failed: ImportRowResult[];
  auditEntriesWritten: number;
}

// =====================================================================
// Service
// =====================================================================

@Injectable({ providedIn: 'root' })
export class ClinicalNotesImportService {
  private supabase = inject(SupabaseClientService).instance;
  private audit = inject(AuditLoggerService);
  private auth = inject(AuthService);

  // -----------------------------------------------------------------
  // Pure helpers
  // -----------------------------------------------------------------

  /**
   * Normalize a name for matching: trim, lowercase, NFD-decompose, strip
   * diacritics, collapse internal whitespace. Same shape used on the
   * client_id fingerprint to keep matching deterministic.
   */
  normalizeName(s: string | null | undefined): string {
    if (!s) return '';
    return String(s)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Derive a stable source_id for idempotency:
   * sha256(clientId || '|' || episodeId || '|' || sequence) → first 16 hex chars.
   * Both episodeId and sequence are optional; missing values become empty strings.
   */
  async deriveSourceId(
    clientId: string,
    episodeId: string | null,
    sequence: number | null
  ): Promise<string> {
    const material = `${clientId}|${episodeId ?? ''}|${sequence ?? ''}`;
    const enc = new TextEncoder().encode(material);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hex.slice(0, 16);
  }

  /**
   * SHA-256 hex of a string — used for audit logging (never logs plaintext).
   */
  async sha256Hex(s: string): Promise<string> {
    const enc = new TextEncoder().encode(s);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Sanitize a note's raw `value` cell before encryption+import.
   *
   * The legacy system exports notes with embedded HTML (e.g. "<div>foo<br/>bar</div>").
   * We strip ALL HTML tags, convert common block-level tags to newlines, decode
   * standard HTML entities, and collapse extra whitespace. The output is plain
   * text + newlines, which is what the clinical notes UI is designed to render.
   *
   * Conservative by design: no HTML, no markdown, no URLs preserved specially.
   * If the result is empty after sanitization, the caller should mark the row
   * as failed (invalid_value) rather than insert an empty note.
   *
   * SECURITY: This runs in the browser BEFORE the value reaches the RPC, so
   * it is defense-in-depth on top of the server-side encryption. The output
   * is always plain text — no HTML to inject later.
   */
  sanitizeNoteContent(raw: string | null | undefined): string {
    if (!raw) return '';
    let s = String(raw);

    // 1. Normalize line breaks to a sentinel so we don't lose them in tag stripping
    s = s.replace(/\r\n?/g, '\n');

    // 2. Convert block-level and line-break tags to newlines BEFORE stripping
    //    (so <br>, </p>, <div>, </div> all become a single \n)
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');

    // 3. Strip ALL remaining HTML tags (opening, closing, self-closing, with attrs)
    s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');

    // 4. Decode common HTML entities. Handle named entities first, then numeric.
    const namedEntities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&hellip;': '...',
      '&mdash;': '—',
      '&ndash;': '–',
      '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú',
      '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú',
      '&ntilde;': 'ñ', '&Ntilde;': 'Ñ'
    };
    s = s.replace(/&(nbsp|amp|lt|gt|quot|apos|hellip|mdash|ndash|[aeiouAEIOU]acute|ntilde|Ntilde);/g,
      (m) => namedEntities[m] ?? m);

    // Numeric entities: &#123; or &#x7B;
    s = s.replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
    s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });

    // 4.5 Strip stray CSS that legacy HTML exporters leave behind.
    //     Three shapes handled, each by a single global replace with a
    //     deletion-oriented replacement (empty string), NOT a callback
    //     that re-inserts the leading whitespace:
    //
    //       4.5a) { prop: val; prop: val }  → drop the whole rule block
    //       4.5b) "prop: val;" runs (one or more) on a line of plain text
    //       4.5c) style="..." / style='...' / style=... attribute syntax
    //
    //     4.5b is gated by a whitelist of CSS property names to avoid
    //     false positives on text like "color: rojo" in plain prose.

    // 4.5a: full CSS rule blocks between { ... }
    s = s.replace(/\{[^{}]*\}/g, ' ');

    // 4.5b: bare CSS declarations on a line, e.g. "caret-color: rgba(0,0,0,.75); color: rgba(...);"
    //       We match: optional leading whitespace, the property name, a colon,
    //       then any value that does not contain ; or newline, optionally ending in ;.
    //       Run the regex globally with NO callback — replacement is empty string.
    //       We then collapse the leftover extra whitespace in step 6.
    const cssProperties = [
      'caret-color', 'color', 'background', 'background-color', 'background-image',
      'font', 'font-size', 'font-family', 'font-weight', 'font-style', 'line-height',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'border', 'border-radius', 'border-color', 'border-width', 'border-style',
      'display', 'visibility', 'opacity', 'position', 'top', 'right', 'bottom', 'left',
      'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'text-align', 'text-decoration', 'text-transform', 'text-indent',
      'float', 'clear', 'overflow', 'overflow-x', 'overflow-y',
      'z-index', 'cursor', 'transition', 'transform', 'animation', 'box-shadow',
      'box-sizing', 'flex', 'flex-direction', 'justify-content', 'align-items',
      'grid', 'gap', 'white-space', 'word-break', 'word-spacing', 'letter-spacing',
      // -webkit- and -moz- vendor prefixes seen in real legacy exports
      '-webkit-tap-highlight-color', '-webkit-text-size-adjust', '-webkit-font-smoothing',
      '-moz-osx-font-smoothing', '-webkit-appearance', '-webkit-transform',
      '-webkit-transition', '-webkit-user-select', '-webkit-tap-highlight-color',
      '-webkit-overflow-scrolling'
    ];
    const cssPropAlt = cssProperties.map((p) => p.replace(/-/g, '\\-')).join('|');
    // Optional leading whitespace is consumed; the rest is dropped. We do NOT
    // re-insert the leading whitespace — the subsequent whitespace-collapse
    // step will clean up any double spaces.
    s = s.replace(
      new RegExp(`\\s*(?:${cssPropAlt})\\s*:[^;\\n]*;?`, 'gi'),
      ' '
    );
    // 4.5c: bare style="..." / style='...' / style=... attribute syntax
    s = s.replace(/\bstyle\s*=\s*(["'])[^"']*\1/g, ' ');
    s = s.replace(/\bstyle\s*=\s*[^\s>]+/g, ' ');

    // 5. Collapse 3+ consecutive newlines to 2, then trim each line
    s = s.replace(/\n{3,}/g, '\n\n');
    s = s.split('\n').map((l) => l.trim()).join('\n');

    // 6. Collapse internal whitespace within each line, but preserve newlines
    s = s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ')).join('\n');

    // 7. Trim the whole thing
    s = s.trim();

    return s;
  }

  // -----------------------------------------------------------------
  // Step 1: match clients
  // -----------------------------------------------------------------

  /**
   * For each row, look up candidate clients by normalized first+last name.
   * Classifies as:
   *   - matched         → exactly 1 candidate
   *   - ambiguous       → 2+ candidates
   *   - unresolved      → 0 candidates (user can create on the fly)
   * Episode/appointment check is left for the wizard UI (missing-episode is
   * not derivable without a booking lookup; the wizard can decide per row).
   */
  matchClients(
    rows: ResolvedClinicalRow[],
    companyId: string
  ): Observable<MatchedClinicalRow[]> {
    return from(
      (async (): Promise<MatchedClinicalRow[]> => {
        // Fetch all active clients for the company in ONE round-trip.
        // We do client-side matching instead of one query per row because:
        //  - Postgres ilike with the default collation is ACCENT-SENSITIVE,
        //    so "adrian" (no accent) does NOT match "Adrián" in the DB.
        //  - For 500-1500 client rows this is a sub-second operation in JS
        //    and avoids the need for the unaccent extension on the DB.
        //  - Includes inactive (is_active=false) clients too, because
        //    clinical history is historical data and should attach to any
        //    existing client record regardless of current active state.
        const { data: allClients, error } = await this.supabase
          .from('clients')
          .select('id, name, surname, email, health_data_consent, company_id')
          .eq('company_id', companyId)
          .is('deleted_at', null);

        if (error) {
          console.error('[ClinicalNotesImport] client fetch error:', error);
          throw error;
        }

        const clients = (allClients ?? []) as ClinicalCandidate[];

        // Build a normalized lookup: Map<"first|last", ClinicalCandidate[]>
        // normalized keys are accent-folded + lowercased on BOTH sides,
        // so DB "Adrián" and CSV "Adrian" map to the same bucket.
        const lookup = new Map<string, ClinicalCandidate[]>();
        for (const c of clients) {
          const key = `${this.normalizeName(c.name)}|${this.normalizeName(c.surname)}`;
          const existing = lookup.get(key);
          if (existing) {
            existing.push(c);
          } else {
            lookup.set(key, [c]);
          }
        }

        // For each CSV row, look up candidates by normalized name
        return rows.map((r) => {
          const first = this.normalizeName(r.firstName);
          const last = this.normalizeName(r.lastName);
          if (!first || !last) {
            return {
              ...r,
              status: 'unresolved' as const,
              clientId: null,
              candidates: [],
            };
          }
          const candidates = lookup.get(`${first}|${last}`) ?? [];
          if (candidates.length === 1) {
            return {
              ...r,
              status: 'matched' as const,
              clientId: candidates[0].id,
              candidates,
            };
          }
          if (candidates.length > 1) {
            return {
              ...r,
              status: 'ambiguous' as const,
              clientId: null,
              candidates,
            };
          }
          return {
            ...r,
            status: 'unresolved' as const,
            clientId: null,
            candidates: [],
          };
        });
      })()
    );
  }

  // -----------------------------------------------------------------
  // Step 2: on-the-fly client creation
  // -----------------------------------------------------------------

  /**
   * Create a minimal client record for an unresolved row. The new client
   * gets health_data_consent=false; the user will have to grant consent
   * out-of-band for the note to actually import later.
   */
  createClientFromImport(
    firstName: string,
    lastName: string,
    companyId: string,
    extras?: { email?: string; phone?: string }
  ): Observable<{ id: string }> {
    const payload: Record<string, any> = {
      name: firstName.trim(),
      surname: lastName.trim(),
      company_id: companyId,
      client_type: 'individual',
      is_active: true,
      health_data_consent: false,
      // Source markers for traceability
      source: 'csv-import',
    };
    if (extras?.email) payload['email'] = extras.email.trim().toLowerCase();
    if (extras?.phone) payload['phone'] = extras.phone.trim();

    return from(
      this.supabase.from('clients').insert(payload).select('id').single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return { id: (data as { id: string }).id };
      })
    );
  }

  // -----------------------------------------------------------------
  // Step 3: import a chunk
  // -----------------------------------------------------------------

  /**
   * Import a chunk of resolved rows. Each row:
   *  1. Verifies consent (RPC also checks, but pre-check gives clearer errors)
   *  2. Derives source_id
   *  3. Calls create_clinical_note RPC
   *  4. Writes audit entry (sha256 of value, never plaintext)
   * Returns per-row result. The caller (wizard) drives chunking + progress.
   */
  importChunk(
    rows: ResolvedClinicalRow[],
    ctx: ImportChunkContext
  ): Observable<ImportChunkResult> {
    return from(
      (async (): Promise<ImportChunkResult> => {
        const ok: ImportRowResult[] = [];
        const failed: ImportRowResult[] = [];
        let auditEntriesWritten = 0;

        for (const r of rows) {
          const result = await this.importOne(r, ctx);
          if (result.ok) {
            ok.push(result);
            auditEntriesWritten++;
          } else {
            failed.push(result);
          }
        }

        return { ok, failed, auditEntriesWritten };
      })()
    );
  }

  /**
   * Internal: import a single row.
   */
  private async importOne(
    r: ResolvedClinicalRow,
    ctx: ImportChunkContext
  ): Promise<ImportRowResult> {
    // 0. Skip rows with no client (should not happen if dry-run was respected)
    if (!r.clientId) {
      return {
        rowIndex: r.rowIndex,
        ok: false,
        deduped: false,
        errorCode: 'no_client',
        errorMessage: 'No client resolved for this row',
      };
    }

    // 1. Sanitize the note content (strip HTML, decode entities, collapse whitespace)
    //    The legacy system exports notes with embedded HTML; we normalize to
    //    plain text + newlines before encryption+import.
    const sanitizedValue = this.sanitizeNoteContent(r.value);
    if (sanitizedValue.length === 0) {
      return {
        rowIndex: r.rowIndex,
        ok: false,
        deduped: false,
        errorCode: 'invalid_value',
        errorMessage: 'Empty note content after sanitization',
      };
    }

    // 2. Pre-check consent (RPC also checks; this avoids a wasted RPC call
    //    and gives a clearer error to the wizard)
    const { data: clientRow, error: clientError } = await this.supabase
      .from('clients')
      .select('health_data_consent, company_id')
      .eq('id', r.clientId)
      .single();
    if (clientError || !clientRow) {
      return {
        rowIndex: r.rowIndex,
        ok: false,
        deduped: false,
        errorCode: 'rpc_error',
        errorMessage: `Could not read client: ${clientError?.message ?? 'not found'}`,
      };
    }
    if (clientRow.company_id !== ctx.companyId) {
      return {
        rowIndex: r.rowIndex,
        ok: false,
        deduped: false,
        errorCode: 'access_denied',
        errorMessage: 'Client belongs to a different company',
      };
    }
    if (clientRow.health_data_consent !== true) {
      return {
        rowIndex: r.rowIndex,
        ok: false,
        deduped: false,
        errorCode: 'consent_not_granted',
        errorMessage: 'Client has not consented to health-data processing',
      };
    }

    // 3. Derive idempotency key
    const sourceId = await this.deriveSourceId(
      r.clientId,
      r.episodeId,
      r.sequence
    );

    // 4. Call the RPC
    const rpcArgs: Record<string, any> = {
      p_client_id: r.clientId,
      p_content: sanitizedValue,
      p_source: 'csv-import',
      p_source_id: sourceId,
    };
    if (r.title) rpcArgs['p_title'] = r.title;
    if (r.sequence != null) rpcArgs['p_sequence_number'] = r.sequence;
    if (r.date) rpcArgs['p_event_date'] = r.date;

    const { data: rpcData, error: rpcError } = await this.supabase.rpc(
      'create_clinical_note',
      rpcArgs
    );
    if (rpcError) {
      const msg = rpcError.message ?? 'unknown';
      const code = this.classifyRpcError(msg);
      return {
        rowIndex: r.rowIndex,
        ok: false,
        deduped: false,
        errorCode: code,
        errorMessage: msg,
      };
    }

    const rpcResult = (rpcData ?? {}) as { id?: string; deduped?: boolean };
    const noteId = rpcResult.id;
    const deduped = rpcResult.deduped === true;

    // 5. Write audit (fire-and-forget; the logger itself is fire-and-forget)
    await this.writeAudit(r, ctx, sourceId, noteId, deduped);

    return {
      rowIndex: r.rowIndex,
      ok: true,
      deduped,
      noteId,
      clientId: r.clientId,
    };
  }

  private classifyRpcError(msg: string): ImportRowResult['errorCode'] {
    const m = msg.toLowerCase();
    if (m.includes('consent not granted')) return 'consent_not_granted';
    if (m.includes('module not enabled')) return 'module_not_enabled';
    if (m.includes('access denied')) return 'access_denied';
    return 'rpc_error';
  }

  // -----------------------------------------------------------------
  // Step 4: audit (no plaintext)
  // -----------------------------------------------------------------

  private async writeAudit(
    r: ResolvedClinicalRow,
    ctx: ImportChunkContext,
    sourceId: string,
    noteId: string | undefined,
    deduped: boolean
  ): Promise<void> {
    // Hash plaintext content for audit. NEVER pass plaintext to logAction.
    const contentHash = await this.sha256Hex(r.value);

    await this.audit.logAction(
      'import-clinical-note',
      'client_clinical_notes',
      noteId,
      {
        source: 'csv-import',
        target_client_id: r.clientId,
        row_index: r.rowIndex,
        content_sha256: contentHash,
        source_id: sourceId,
        patient_id: r.patientId,
        episode_id: r.episodeId,
        appointment_id: r.appointmentId,
        sequence: r.sequence,
        deduped,
        // title is metadata, not sensitive content — safe to log
        title: r.title ?? null,
      }
    );
  }

  // -----------------------------------------------------------------
  // Step 5: failure report CSV
  // -----------------------------------------------------------------

  /**
   * Build a failure-report CSV (no plaintext value column). One row per
   * failed import. Downloadable from the wizard's summary modal.
   * Accepts ImportRowResult[] or a structural subset (e.g. the wizard's
   * ImportResult['failed'] which carries only the failure-relevant fields).
   */
  buildFailureReport(
    failed: Array<{
      rowIndex: number;
      clientId?: string | null;
      errorCode?: string;
      errorMessage?: string;
    }>
  ): string {
    const header = 'row_index,client_id,status,reason\n';
    const lines = failed.map((f) => {
      const cid = f.clientId ?? '';
      const reason = (f.errorMessage ?? f.errorCode ?? 'unknown')
        .replace(/[\r\n,"]/g, ' '); // strip CSV-busting chars
      return `${f.rowIndex},${cid},${f.errorCode ?? 'error'},"${reason}"`;
    });
    return header + lines.join('\n');
  }
}
