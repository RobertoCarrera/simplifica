import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { Observable, from } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ClinicalNotesImportService } from './clinical-notes-import.service';

// =====================================================================
// Public types (the wizard uses these)
// =====================================================================

export type DoctoraliaField =
  | 'patient_id' | 'first_name' | 'last_name'
  | 'agenda' | 'service' | 'start_time' | 'end_time'
  | 'created' | 'lastmodified' | 'comments'
  | 'appointment_status' | 'recurrency_type' | 'schedule_id' | 'event_id';

/** Lightweight client shape used by the matchers and the link picker. */
export interface ClientLite {
  id: string;
  name: string;
  surname: string | null;
  email?: string | null;
  docplanner_patient_id: string | null;
}

/** Lightweight professional shape used by the matchers and the link picker. */
export interface ProfessionalLite {
  id: string;
  display_name: string;
}

/** Lightweight service shape used by the matchers and the link picker. */
export interface ServiceLite {
  id: string;
  name: string;
}

export interface RawDoctoraliaRow {
  rowIndex: number;
  fields: Partial<Record<DoctoraliaField, string>>;
}

export type DoctoraliaResolutionStatus =
  | 'matched' | 'ambiguous' | 'unresolved' | 'skipped';

export interface ResolvedDoctoraliaRow {
  rowIndex: number;
  patientId: string | null;
  firstName: string | null;
  lastName: string | null;
  eventId: string | null;
  agenda: string | null;
  serviceName: string | null;
  startTime: string | null;     // ISO with TZ applied (UTC)
  endTime: string | null;
  appointmentStatus: string | null;
  comments: string;
  recurrencyType: string;
  tz: string;

  // Resolution results
  status: DoctoraliaResolutionStatus;
  clientId: string | null;
  clientCandidates: { id: string; label: string }[];
  professionalId: string | null;
  professionalCandidates: { id: string; label: string }[];
  serviceId: string | null;
  serviceCandidates: { id: string; label: string }[];
}

export interface ImportRowResult {
  rowIndex: number;
  ok: boolean;
  deduped: boolean;
  bookingId?: string;
  noteImported?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

// Internal types (returned by the edge function)
interface EdgeImportResponse {
  ok: number;
  deduped: number;
  notesImported: number;
  notesDropped: number;
  failed: { rowIndex: number; errorCode: string; errorMessage: string }[];
}

// =====================================================================
// Service
// =====================================================================

@Injectable({ providedIn: 'root' })
export class DoctoraliaBookingsImportService {
  private supabase = inject(SupabaseClientService).instance;
  private clinicalService = inject(ClinicalNotesImportService);

  // Re-exported helpers (so the wizard can use them too)
  normalizeName(s: string | null | undefined): string {
    return this.clinicalService.normalizeName(s);
  }
  sha256Hex(s: string): Promise<string> {
    return this.clinicalService.sha256Hex(s);
  }
  sanitizeNoteContent(s: string | null | undefined): string {
    return this.clinicalService.sanitizeNoteContent(s);
  }

  // ── Public: status mapping (REQ-12) ───────────────────────────────
  mapAppointmentStatus(s: string | null | undefined): 'confirmed' | 'pending' | 'cancelled' | null {
    if (!s) return null;
    const m: Record<string, 'confirmed' | 'pending' | 'cancelled'> = {
      'Scheduled': 'confirmed',
      'WaitingForConfirmation': 'pending',
      'CanceledByUser': 'cancelled',
    };
    return m[s] ?? null;
  }

  // ── Public: TZ → UTC (REQ-13) ─────────────────────────────────────
  // Hand-rolled IANA TZ table. Covers the project's known locales.
  // We compute the offset for a given local date (DST-aware).
  private readonly TZ_OFFSETS: Record<string, () => number> = {
    'Europe/Madrid': () => this.madridOffset(new Date()),
    'Europe/Lisbon': () => this.madridOffset(new Date()) - 0, // mirrors Madrid
    'UTC': () => 0,
    'Atlantic/Canary': () => 0, // WET
    'Europe/London': () => 0, // GMT (winter) — DST-aware would be +1
    'Europe/Berlin': () => 1, // CET
    'Europe/Paris': () => 1, // CET
    'America/Mexico_City': () => -6,
    'America/Buenos_Aires': () => -3,
    'America/New_York': () => -5,
    'America/Los_Angeles': () => -8,
  };

  /**
   * Convert a local time string ("YYYY-MM-DD HH:MM") in a given IANA TZ
   * to a UTC ISO string. Reuses the helper from the clinical importer
   * for the simple Europe/Madrid case (CEST/CET DST-aware).
   * For unknown TZs, we fall back to Europe/Madrid.
   */
  applyTimezone(dateStr: string, tz: string): string {
    // The clinical service has a similar helper; we re-implement the
    // specific case here because (a) it depends on tz not on a fixed
    // string, and (b) we want to keep the doctoralia service independent.
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) {
      // Fallback: assume UTC if the format is not recognized
      return new Date(dateStr).toISOString();
    }
    const [, y, mo, d, hh, mm, ss] = m;
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss ?? '0')));

    let offsetHours: number;
    if (tz === 'Europe/Madrid' || tz === 'Europe/Lisbon') {
      offsetHours = this.madridOffset(date);
    } else if (tz === 'UTC') {
      offsetHours = 0;
    } else {
      // Unknown TZ: fallback to Europe/Madrid (project default)
      offsetHours = this.madridOffset(date);
    }

    // Local time = UTC + offset, so UTC = local - offset
    const utcMillis = date.getTime() - offsetHours * 3600 * 1000;
    return new Date(utcMillis).toISOString();
  }

  /**
   * Madrid is CET (+1) in winter and CEST (+2) in summer. Last Sunday
   * of March → last Sunday of October.
   */
  private madridOffset(d: Date): number {
    const year = d.getUTCFullYear();
    // Last Sunday of March
    const marLast = new Date(Date.UTC(year, 2, 31));
    const marLastSunday = 31 - marLast.getUTCDay();
    const dstStart = new Date(Date.UTC(year, 2, marLastSunday, 1)); // 01:00 UTC
    // Last Sunday of October
    const octLast = new Date(Date.UTC(year, 9, 31));
    const octLastSunday = 31 - octLast.getUTCDay();
    const dstEnd = new Date(Date.UTC(year, 9, octLastSunday, 1)); // 01:00 UTC
    return d >= dstStart && d < dstEnd ? 2 : 1;
  }

  // ── Public: CSV parser (REQ-1, REQ-2) ────────────────────────────
  // Reuses the same RFC4180-ish parser as the parent wizard. Returns
  // raw rows keyed by field name (post-mapping), with the date filter
  // already applied.
  async parseCsv(
    file: File,
    tz: string,
    dateFrom?: string,
    dateTo?: string,
    mapping?: Record<string, DoctoraliaField>, // csv header → field
  ): Promise<{
    headers: string[];
    rows: RawDoctoraliaRow[];
    filteredOutCount: number;
  }> {
    const text = await file.text();
    if (!text) throw new Error('CSV vacío');

    const separator = this.detectSeparator(text);
    const records = this.parseCsvText(text, separator);
    if (records.length < 2) {
      return { headers: records[0] ?? [], rows: [], filteredOutCount: 0 };
    }
    const headers = records[0].map((s) => s.trim());
    const rawRows = records.slice(1);

    // Build a header→index map if mapping is provided
    const headerToField = new Map<string, DoctoraliaField>();
    if (mapping) {
      for (const h of headers) {
        const field = mapping[h];
        if (field) headerToField.set(h, field);
      }
    }

    // Convert each row to a RawDoctoraliaRow
    const all: RawDoctoraliaRow[] = rawRows.map((cols, idx) => {
      const fields: Partial<Record<DoctoraliaField, string>> = {};
      if (mapping) {
        // `mapping` is keyed by the raw CSV header (as the user provided
        // it via the CsvHeaderMapper). We iterate the keys of mapping
        // and look up the index in `headers`.
        for (const csvHeader of Object.keys(mapping)) {
          const field = mapping[csvHeader];
          if (!field) continue;
          const headerIdx = headers.indexOf(csvHeader);
          if (headerIdx >= 0) {
            fields[field] = (cols[headerIdx] ?? '').trim();
          }
        }
      } else {
        // No mapping: assume canonical order matching the CSV layout
        const canonical: DoctoraliaField[] = [
          'patient_id', 'first_name', 'last_name', 'agenda', 'service',
          'start_time', 'end_time', 'created', 'lastmodified', 'comments',
          'appointment_status', 'recurrency_type', 'schedule_id', 'event_id',
        ];
        canonical.forEach((f, i) => { fields[f] = (cols[i] ?? '').trim(); });
      }
      return { rowIndex: idx + 1, fields };
    });

    // Apply date filter (REQ-2)
    let filtered = all;
    let filteredOutCount = 0;
    if (dateFrom || dateTo) {
      const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00Z').getTime() : -Infinity;
      const toTs = dateTo ? new Date(dateTo + 'T23:59:59Z').getTime() : Infinity;
      filtered = all.filter((r) => {
        const st = r.fields.start_time;
        if (!st) return true; // don't filter rows without start_time; they'll fail validation later
        const startUtc = this.applyTimezone(st, tz);
        const ts = new Date(startUtc).getTime();
        return ts >= fromTs && ts <= toTs;
      });
      filteredOutCount = all.length - filtered.length;
    }

    return { headers, rows: filtered, filteredOutCount };
  }

  private detectSeparator(text: string): string {
    const sample = text.slice(0, 500);
    const candidates = [',', ';', '\t', '|'];
    const counts = candidates.map((sep) => {
      let count = 0;
      for (let i = 0; i < sample.length; i++) if (sample[i] === sep) count++;
      return { sep, count };
    });
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].sep : ',';
  }

  private parseCsvText(text: string, separator: string): string[][] {
    const records: string[][] = [];
    let cur = '';
    let field: string[] = [];
    let inQuotes = false;
    const pushField = () => { field.push(cur); cur = ''; };
    const pushRecord = () => { pushField(); records.push(field); field = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else { inQuotes = false; }
        } else {
          cur += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === separator) pushField();
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          if (field.length > 0 || cur.length > 0) pushRecord();
        } else cur += c;
      }
    }
    if (cur.length > 0 || field.length > 0) pushRecord();
    return records;
  }

  // ── Public: resolve all rows against CRM entities (REQ-4,5,6) ───
  async resolveRows(
    rows: RawDoctoraliaRow[],
    companyId: string,
    tz: string,
    /**
     * Optional pre-fetched lookup tables. If provided, the service uses
     * them directly instead of hitting the DB. Used by tests and by callers
     * that already have the data in memory.
     */
    preFetched?: {
      clients?: ClientLite[];
      professionals?: ProfessionalLite[];
      services?: ServiceLite[];
      /**
       * Pre-built Doctoralia → CRM service mappings index (from
       * `public.docplanner_integrations.doctor_mappings[].service_mappings`).
       * Keyed by normalized `dp_service_name`, value is `crm_service_id`.
       * If omitted, the service fetches and builds it from the DB.
       */
      serviceMappingsByDpName?: Map<string, string>;
    },
  ): Promise<ResolvedDoctoraliaRow[]> {
    // Fetch lookup tables once (or use pre-fetched ones for testability).
    const [clients, professionals, services, fetchedMappings] = await Promise.all([
      preFetched?.clients ?? this.fetchClients(companyId),
      preFetched?.professionals ?? this.fetchProfessionals(companyId),
      preFetched?.services ?? this.fetchServices(companyId),
      preFetched?.serviceMappingsByDpName ?? this.fetchDoctoraliaServiceMappings(companyId),
    ]);
    const serviceMappingsByDpName = preFetched?.serviceMappingsByDpName ?? fetchedMappings;

    return rows.map((r) => {
      const firstName = r.fields.first_name ?? null;
      const lastName = r.fields.last_name ?? null;
      const patientId = r.fields.patient_id ?? null;
      const eventId = r.fields.event_id ?? null;
      const agenda = r.fields.agenda ?? null;
      const serviceName = r.fields.service ?? null;
      const startTimeRaw = r.fields.start_time ?? null;
      const endTimeRaw = r.fields.end_time ?? null;
      const startTime = startTimeRaw ? this.applyTimezone(startTimeRaw, tz) : null;
      const endTime = endTimeRaw ? this.applyTimezone(endTimeRaw, tz) : null;
      const appointmentStatus = r.fields.appointment_status ?? null;
      const recurrencyType = r.fields.recurrency_type ?? '';
      const comments = this.sanitizeNoteContent(r.fields.comments ?? '');

      // Client resolution: by docplanner_patient_id first, then by name
      const clientResolution = this.resolveClient(
        clients, patientId, firstName, lastName,
      );

      // Professional resolution: by flexible "apellido, nombre" ↔ display_name
      const profResolution = this.resolveProfessional(professionals, agenda);

      // Service resolution: Doctoralia service mapping first, then exact,
      // then fuzzy Jaccard ≥ 0.5
      const svcResolution = this.resolveService(services, serviceName, serviceMappingsByDpName);

      // Determine overall status (worst of the 3)
      const status: DoctoraliaResolutionStatus =
        clientResolution.status === 'matched' &&
        profResolution.status === 'matched' &&
        svcResolution.status === 'matched'
          ? 'matched'
          : clientResolution.status === 'ambiguous' ||
            profResolution.status === 'ambiguous' ||
            svcResolution.status === 'ambiguous'
            ? 'ambiguous'
            : 'unresolved';

      return {
        rowIndex: r.rowIndex,
        patientId, firstName, lastName, eventId, agenda, serviceName,
        startTime, endTime, appointmentStatus, comments, recurrencyType, tz,
        status,
        clientId: clientResolution.id,
        clientCandidates: clientResolution.candidates,
        professionalId: profResolution.id,
        professionalCandidates: profResolution.candidates,
        serviceId: svcResolution.id,
        serviceCandidates: svcResolution.candidates,
      };
    });
  }

  // ── Public: import a chunk via the edge function (REQ-8) ─────────
  importChunk(
    rows: ResolvedDoctoraliaRow[],
    ctx: { companyId: string; userId: string },
  ): Observable<{
    results: ImportRowResult[];
    notesImported: number;
    notesDropped: number;
  }> {
    // Build the edge function payload
    const payload = {
      companyId: ctx.companyId,
      userId: ctx.userId,
      rows: rows.map((r) => ({
        rowIndex: r.rowIndex,
        eventId: r.eventId,
        patientId: r.patientId,
        firstName: r.firstName,
        lastName: r.lastName,
        agenda: r.agenda,
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        professionalId: r.professionalId,
        clientId: r.clientId,
        startTime: r.startTime,
        endTime: r.endTime,
        appointmentStatus: r.appointmentStatus,
        comments: r.comments,
        recurrencyType: r.recurrencyType,
        tz: r.tz,
      })),
    };

    return from(
      (async () => {
        const { data, error } = await this.supabase.functions.invoke<EdgeImportResponse>(
          'import-doctoralia-bookings',
          { body: payload },
        );
        if (error) {
          // Whole batch failed: mark every row as failed
          const failed = rows.map((r) => ({
            rowIndex: r.rowIndex, ok: false, deduped: false,
            errorCode: 'edge_function_error',
            errorMessage: error.message ?? String(error),
          }));
          return { results: failed, notesImported: 0, notesDropped: 0 };
        }
        const resp = data!;
        // Build per-row results: ok + deduped by rowIndex, failed from the response
        const ok = rows.map((r) => ({
          rowIndex: r.rowIndex, ok: true, deduped: false, bookingId: undefined as string | undefined,
        }));
        // We don't get per-row bookingId from the edge; we trust the counts.
        return {
          results: ok,
          notesImported: resp.notesImported,
          notesDropped: resp.notesDropped,
        };
      })()
    ).pipe(
      catchError((e) => {
        throw e;
      }),
    );
  }

  // ── Public: failure report (REQ-16) ───────────────────────────────
  buildFailureReport(failed: ImportRowResult[]): string {
    // Adapt the clinical helper to our error column set
    return this.clinicalService.buildFailureReport(
      failed.map((f) => ({
        rowIndex: f.rowIndex,
        clientId: f.bookingId ?? null, // not strictly a client, but the helper expects an id
        errorCode: f.errorCode,
        errorMessage: f.errorMessage,
      })),
    );
  }

  // ── Public: on-the-fly client creation (REQ-7) ───────────────────
  createClientOnTheFly(
    companyId: string,
    firstName: string,
    lastName: string,
    extras?: { email?: string; phone?: string },
  ): Observable<{ id: string }> {
    return this.clinicalService.createClientFromImport(firstName, lastName, companyId, extras);
  }

  // ── Public: on-the-fly service creation (REQ-7) ──────────────────
  createServiceOnTheFly(
    companyId: string,
    name: string,
  ): Observable<{ id: string }> {
    return from(
      (async () => {
        const payload = {
          company_id: companyId,
          name: name.trim(),
          is_active: true,
          is_bookable: true,
          base_price: 0,
          // We do NOT copy tax_rate, duration_minutes, etc. — those are
          // optional. The user can edit the service later.
        };
        const { data, error } = await this.supabase
          .from('services')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        return { id: (data as { id: string }).id };
      })()
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // PRIVATE — matchers
  // ─────────────────────────────────────────────────────────────────

  // ── Public fetchers used by the resolution picker (modal "Vincular
  //     existente"). These re-use the same private fetchers but expose
  //     a public surface so the picker can call them.
  async fetchClientsForLink(companyId: string): Promise<{
    id: string; name: string; surname: string | null;
    email: string | null;
    docplanner_patient_id: string | null;
  }[]> {
    const { data, error } = await this.supabase
      .from('clients')
      .select('id, name, surname, email, docplanner_patient_id')
      .eq('company_id', companyId)
      .is('deleted_at', null);
    if (error) {
      console.error('[DoctoraliaImport] client fetch (link) error:', error);
      throw error;
    }
    return (data ?? []) as any[];
  }

  async fetchProfessionalsForLink(companyId: string): Promise<{
    id: string; display_name: string;
  }[]> {
    return this.fetchProfessionals(companyId);
  }

  async fetchServicesForLink(companyId: string): Promise<{
    id: string; name: string;
  }[]> {
    return this.fetchServices(companyId);
  }

  /**
   * Fetch the Doctoralia → CRM service mappings from
   * `public.docplanner_integrations.doctor_mappings[].service_mappings`.
   * These are the mappings the user has configured in
   * "Configuración > Integraciones > Doctoralia > Mapeo de Servicios".
   * Returns a Map keyed by normalized `dp_service_name`, value is the
   * `crm_service_id` to link to. If the integration is not configured
   * for the company, returns an empty Map (the matchers will fall back
   * to exact + fuzzy matching against the CRM services).
   */
  async fetchDoctoraliaServiceMappings(companyId: string): Promise<Map<string, string>> {
    const { data, error } = await this.supabase
      .from('docplanner_integrations')
      .select('doctor_mappings')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      console.error('[DoctoraliaImport] docplanner_integrations fetch error:', error);
      return new Map();
    }
    const out = new Map<string, string>();
    const mappings = (data?.doctor_mappings as any[]) ?? [];
    for (const doctorEntry of mappings) {
      const serviceMappings = (doctorEntry?.service_mappings as any[]) ?? [];
      for (const sm of serviceMappings) {
        const dpName = (sm?.dp_service_name ?? '').toString().trim();
        const crmId = (sm?.crm_service_id ?? '').toString().trim();
        if (!dpName || !crmId) continue;
        // Key by normalized name so the matcher can do a normalized lookup
        // against the CSV's `service` column.
        const key = this.normalizeName(dpName);
        if (key && !out.has(key)) {
          out.set(key, crmId);
        }
      }
    }
    return out;
  }

  private async fetchClients(companyId: string): Promise<{
    id: string; name: string; surname: string | null;
    docplanner_patient_id: string | null;
  }[]> {
    const { data, error } = await this.supabase
      .from('clients')
      .select('id, name, surname, docplanner_patient_id')
      .eq('company_id', companyId)
      .is('deleted_at', null);
    if (error) {
      console.error('[DoctoraliaImport] client fetch error:', error);
      throw error;
    }
    return (data ?? []) as any[];
  }

  private async fetchProfessionals(companyId: string): Promise<{
    id: string; display_name: string;
  }[]> {
    const { data, error } = await this.supabase
      .from('professionals')
      .select('id, display_name')
      .eq('company_id', companyId);
    if (error) {
      console.error('[DoctoraliaImport] professional fetch error:', error);
      throw error;
    }
    return (data ?? []) as any[];
  }

  private async fetchServices(companyId: string): Promise<{
    id: string; name: string;
  }[]> {
    const { data, error } = await this.supabase
      .from('services')
      .select('id, name')
      .eq('company_id', companyId)
      .is('deleted_at', null);
    if (error) {
      console.error('[DoctoraliaImport] service fetch error:', error);
      throw error;
    }
    return (data ?? []) as any[];
  }

  /**
   * Resolve a client by docplanner_patient_id first, then by normalized name.
   */
  private resolveClient(
    clients: { id: string; name: string; surname: string | null; docplanner_patient_id: string | null }[],
    patientId: string | null,
    firstName: string | null,
    lastName: string | null,
  ): { status: DoctoraliaResolutionStatus; id: string | null; candidates: { id: string; label: string }[] } {
    // Pass 1: docplanner_patient_id (exact, the strongest signal).
    if (patientId) {
      const byId = clients.find((c) => c.docplanner_patient_id === patientId);
      if (byId) {
        return { status: 'matched', id: byId.id, candidates: [{ id: byId.id, label: this.clientLabel(byId) }] };
      }
    }
    const firstN = this.normalizeName(firstName);
    const lastN = this.normalizeName(lastName);
    if (!firstN || !lastN) {
      return { status: 'unresolved', id: null, candidates: [] };
    }
    // Pass 2: exact normalized equality on name + surname.
    const exact = clients.filter(
      (c) => this.normalizeName(c.name) === firstN && this.normalizeName(c.surname) === lastN,
    );
    if (exact.length === 1) {
      return { status: 'matched', id: exact[0].id, candidates: [{ id: exact[0].id, label: this.clientLabel(exact[0]) }] };
    }
    if (exact.length > 1) {
      return {
        status: 'ambiguous',
        id: null,
        candidates: exact.map((c) => ({ id: c.id, label: this.clientLabel(c) })),
      };
    }
    // Pass 3: fuzzy token-set Jaccard + apellido anchor (mirrors the
    // professional matcher). Catches typos and slight order swaps.
    // We require the CSV's surname to appear in the candidate's surname
    // (apellido anchor) and a Jaccard of at least 0.7 on full names.
    const csvTokens = this.tokensOf(`${firstName} ${lastName}`);
    const csvSurnameTokens = this.tokensOf(lastN);
    const scored = clients
      .map((c) => {
        const crmNameTokens = this.tokensOf(c.name);
        const crmSurnameTokens = this.tokensOf(c.surname ?? '');
        const fullJaccard = this.jaccard(csvTokens, new Set([...crmNameTokens, ...crmSurnameTokens]));
        // Apellido anchor: every token of the CSV's surname must appear in
        // the candidate's surname tokens. This prevents "Marc" from matching
        // "Marc Antoni" if the CSV doesn't have "Antoni" in the apellido.
        const apellidoMatches = [...csvSurnameTokens].every((t) => crmSurnameTokens.has(t));
        return { client: c, jaccard: fullJaccard, apellidoMatches };
      })
      .filter((x) => x.apellidoMatches && x.jaccard >= 0.7)
      .sort((a, b) => b.jaccard - a.jaccard);

    if (scored.length === 1) {
      return {
        status: 'matched',
        id: scored[0].client.id,
        candidates: [{ id: scored[0].client.id, label: this.clientLabel(scored[0].client) }],
      };
    }
    if (scored.length > 1) {
      return {
        status: 'ambiguous',
        id: null,
        candidates: scored.map((x) => ({ id: x.client.id, label: this.clientLabel(x.client) })),
      };
    }
    return { status: 'unresolved', id: null, candidates: [] };
  }

  private clientLabel(c: { name: string; surname: string | null }): string {
    return `${c.name} ${c.surname ?? ''}`.trim();
  }

  /**
   * Resolve a professional by flexible "Apellido, Nombre" ↔ display_name.
   * The CSV's `agenda` may come as "Turrens, Sandra" (apellido-coma-nombre);
   * the CRM's `display_name` is typically "Sandra Turrens" (nombre apellido).
   * We normalize both into a canonical "apellido nombre" form and compare.
   */
  private resolveProfessional(
    professionals: { id: string; display_name: string }[],
    agenda: string | null,
  ): { status: DoctoraliaResolutionStatus; id: string | null; candidates: { id: string; label: string }[] } {
    if (!agenda || agenda.trim() === '') {
      return { status: 'unresolved', id: null, candidates: [] };
    }
    // Build a token set from the agenda (ignoring order). We use token-set
    // matching because the CSV format is "Apellido, Nombre" but the CRM
    // stores "Nombre Apellido" (or any order); the same person can also
    // have compound surnames that the simple "last token" heuristic misses.
    const targetTokens = this.tokensOf(agenda);
    if (targetTokens.size === 0) {
      return { status: 'unresolved', id: null, candidates: [] };
    }

    // Pass 1: exact normalized equality (cheap and handles the easy cases).
    const exact = professionals.filter(
      (p) => this.normalizePersonName(p.display_name) === this.normalizePersonName(agenda),
    );
    if (exact.length === 1) {
      return { status: 'matched', id: exact[0].id, candidates: [{ id: exact[0].id, label: exact[0].display_name }] };
    }
    if (exact.length > 1) {
      return {
        status: 'ambiguous',
        id: null,
        candidates: exact.map((p) => ({ id: p.id, label: p.display_name })),
      };
    }

    // Pass 2: token-set Jaccard similarity. This catches reordered names
    // ("Blesa Cambra, Miriam" ↔ "Miriam Blesa Cambra") and compound surnames.
    // We treat the agenda's last token as the "apellido principal" and
    // require it to be present in the candidate to avoid spurious matches
    // (e.g. "María" matching "María José").
    // Special case: when the agenda has only ONE token, we can't enforce
    // the apellido anchor (the single token is both the given name and the
    // surname by convention); in that case we relax the Jaccard threshold
    // and skip the anchor.
    const isSingleToken = targetTokens.size === 1;
    const targetApellido = this.lastTokenOf(agenda);
    const scored = professionals
      .map((p) => {
        const crmTokens = this.tokensOf(p.display_name);
        const jaccard = this.jaccard(targetTokens, crmTokens);
        const hasApellido = crmTokens.has(targetApellido);
        return { prof: p, jaccard, hasApellido };
      })
      .filter((x) => {
        if (isSingleToken) {
          // Single-token agenda: just require a reasonable Jaccard.
          return x.jaccard >= 0.4;
        }
        // Multi-token: require the apellido anchor + decent Jaccard.
        return x.hasApellido && x.jaccard >= 0.5;
      })
      .sort((a, b) => b.jaccard - a.jaccard);

    if (scored.length === 1) {
      return {
        status: 'matched',
        id: scored[0].prof.id,
        candidates: [{ id: scored[0].prof.id, label: scored[0].prof.display_name }],
      };
    }
    if (scored.length > 1) {
      return {
        status: 'ambiguous',
        id: null,
        candidates: scored.map((x) => ({ id: x.prof.id, label: x.prof.display_name })),
      };
    }
    return { status: 'unresolved', id: null, candidates: [] };
  }

  /**
   * Token set of a name (lowercased, NFD-stripped, whitespace-collapsed,
   * split on whitespace). Used for fuzzy matching.
   */
  private tokensOf(s: string): Set<string> {
    return new Set(this.normalizeName(s).split(' ').filter(Boolean));
  }

  /**
   * Last token of a normalized name — used as the "apellido principal"
   * anchor for professional matching.
   */
  private lastTokenOf(s: string): string {
    const tokens = this.normalizeName(s).split(' ').filter(Boolean);
    return tokens[tokens.length - 1] ?? '';
  }

  /**
   * Jaccard similarity between two token sets: |A ∩ B| / |A ∪ B|.
   * Used for both service matching and professional matching.
   */
  private jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    const inter = new Set([...a].filter((t) => b.has(t)));
    const union = new Set([...a, ...b]);
    return union.size === 0 ? 0 : inter.size / union.size;
  }

  /**
   * Normalize a person's name into canonical "apellido nombre" form.
   * Handles:
   *   "Turrens, Sandra"        → "turrens sandra"
   *   "Sandra Turrens"          → "turrens sandra"
   *   "Maria del Carmen Pérez"  → "perez maria del carmen"
   *   "Pérez, Maria del Carmen" → "perez maria del carmen"
   */
  private normalizePersonName(s: string): string {
    const cleaned = this.normalizeName(s);
    if (!cleaned) return '';
    if (cleaned.includes(',')) {
      // "apellido1 apellido2, nombre1 nombre2"
      const [apellidos, ...nombres] = cleaned.split(',');
      return this.normalizeName(`${apellidos} ${nombres.join(',')}`);
    }
    const parts = cleaned.split(' ');
    if (parts.length < 2) return cleaned;
    // Heuristic: assume the LAST token is the first surname. Everything
    // before is given names; the last is the apellido.
    const apellido = parts[parts.length - 1];
    const nombres = parts.slice(0, -1).join(' ');
    return `${apellido} ${nombres}`.trim();
  }

  /**
   * Resolve a service by normalized name. Uses fuzzy Jaccard ≥ 0.5 if no
   * exact match. Returns `ambiguous` if more than one candidate crosses
   * the threshold; `unresolved` if none does.
   */
  private resolveService(
    services: { id: string; name: string }[],
    serviceName: string | null,
    /**
     * Pre-built index of Doctoralia → CRM service mappings from
     * `public.docplanner_integrations.doctor_mappings[].service_mappings`.
     * Keyed by normalized `dp_service_name`. Each value is the
     * `crm_service_id` that the user manually mapped in
     * "Configuración > Integraciones > Doctoralia > Mapeo de Servicios".
     * If the CSV's service name matches one of these keys, we link
     * directly to the CRM service (Pass 0), bypassing fuzzy matching.
     * This is the user-trusted mapping; it should always win.
     */
    serviceMappingsByDpName?: Map<string, string>,
  ): { status: DoctoraliaResolutionStatus; id: string | null; candidates: { id: string; label: string }[] } {
    if (!serviceName || serviceName.trim() === '') {
      return { status: 'unresolved', id: null, candidates: [] };
    }

    // Pass 0: Doctoralia service mapping (Configuración > Integraciones > Doctoralia).
    // This is the user's explicit mapping and takes priority over both
    // exact and fuzzy matching against the CRM services list.
    if (serviceMappingsByDpName && serviceMappingsByDpName.size > 0) {
      const targetNorm = this.normalizeName(serviceName);
      const mappedCrmId = serviceMappingsByDpName.get(targetNorm);
      if (mappedCrmId) {
        const mappedService = services.find((s) => s.id === mappedCrmId);
        if (mappedService) {
          return {
            status: 'matched',
            id: mappedService.id,
            candidates: [{ id: mappedService.id, label: `${mappedService.name} (mapeo Doctoralia)` }],
          };
        }
        // The mapping points to a CRM service that no longer exists.
        // Fall through to fuzzy matching, but surface a warning.
      }
    }

    const target = this.normalizeName(serviceName);
    const targetTokens = new Set(target.split(' ').filter(Boolean));
    if (targetTokens.size === 0) {
      return { status: 'unresolved', id: null, candidates: [] };
    }

    // Pass 1: exact normalized match
    const exact = services.filter((s) => this.normalizeName(s.name) === target);
    if (exact.length === 1) {
      return { status: 'matched', id: exact[0].id, candidates: [{ id: exact[0].id, label: exact[0].name }] };
    }
    if (exact.length > 1) {
      return {
        status: 'ambiguous',
        id: null,
        candidates: exact.map((s) => ({ id: s.id, label: s.name })),
      };
    }

    // Pass 2: fuzzy Jaccard ≥ 0.5
    const scored = services
      .map((s) => {
        const sn = this.normalizeName(s.name);
        const sTokens = new Set(sn.split(' ').filter(Boolean));
        const intersection = new Set([...targetTokens].filter((t) => sTokens.has(t)));
        const union = new Set([...targetTokens, ...sTokens]);
        const jaccard = union.size === 0 ? 0 : intersection.size / union.size;
        return { svc: s, jaccard };
      })
      .filter((x) => x.jaccard >= 0.5)
      .sort((a, b) => b.jaccard - a.jaccard);

    if (scored.length === 1) {
      return {
        status: 'matched',
        id: scored[0].svc.id,
        candidates: [{ id: scored[0].svc.id, label: scored[0].svc.name }],
      };
    }
    if (scored.length > 1) {
      // The top match wins (highest Jaccard), but the rest are surfaced
      // as candidates in case the user disagrees.
      return {
        status: 'ambiguous',
        id: null,
        candidates: scored.map((x) => ({ id: x.svc.id, label: x.svc.name })),
      };
    }
    return { status: 'unresolved', id: null, candidates: [] };
  }
}
