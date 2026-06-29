import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../../services/toast.service';
import { GdprComplianceService, GdprConsentRecord } from '../../../../services/gdpr-compliance.service';
import { SimpleSupabaseService } from '../../../../services/simple-supabase.service';

/**
 * ConsentAuditComponent — RGPD Art. 7 demonstrability.
 *
 * Owner/admin page at /settings/consent-audit. Shows the full consent history
 * for the current company from `gdpr_consent_records`. Lets the admin:
 *
 *   - Filter by email or company name (the company_name filter matches the
 *     client's company via a join through clients; emails use ilike on
 *     subject_email).
 *   - Filter by date range (created_at).
 *   - Filter by consent_type (terms_of_service / privacy_policy / marketing
 *     / health_data / analytics / data_processing / third_party_sharing).
 *   - Export the visible rows to CSV for AEPD audits.
 *
 * The query runs with the CRM admin's authenticated Supabase client. RLS on
 * gdpr_consent_records permits members of the same company to read; for
 * owner/admin we use the same client and rely on the company_id filter.
 *
 * Authority: RGPD Art. 7.1 ("the controller must be able to demonstrate that
 * the data subject has consented") and AEPD guidance on accountability.
 */
@Component({
  selector: 'app-consent-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  template: `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-900/40 p-4 md:p-8">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <i class="fas fa-clipboard-list text-blue-600"></i>
              Auditoría de consentimientos RGPD
            </h1>
            <p class="text-gray-500 dark:text-gray-400 mt-1">
              Registro inmutable de decisiones de consentimiento (RGPD Art. 7.1 — demostrabilidad).
              Visible para owner y admin.
            </p>
          </div>
          <button
            type="button"
            (click)="exportCsv()"
            [disabled]="exporting() || records().length === 0"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <i class="fas" [class.fa-download]="!exporting()" [class.fa-spinner]="exporting()" [class.fa-spin]="exporting()"></i>
            {{ exporting() ? 'Exportando…' : 'Exportar CSV' }}
          </button>
        </div>

        <!-- Filters -->
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 mb-4">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div class="lg:col-span-2">
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Buscar por email
              </label>
              <div class="relative">
                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  [(ngModel)]="searchEmail"
                  (ngModelChange)="onFilterChange()"
                  placeholder="cliente@empresa.com"
                  class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Desde
              </label>
              <input
                type="date"
                [(ngModel)]="fromDate"
                (ngModelChange)="onFilterChange()"
                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hasta
              </label>
              <input
                type="date"
                [(ngModel)]="toDate"
                (ngModelChange)="onFilterChange()"
                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo de consentimiento
              </label>
              <select
                [(ngModel)]="consentType"
                (ngModelChange)="onFilterChange()"
                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos</option>
                <option value="terms_of_service">Términos de uso</option>
                <option value="privacy_policy">Política de privacidad</option>
                <option value="marketing">Comunicaciones comerciales</option>
                <option value="health_data">Datos de salud</option>
                <option value="analytics">Analítica</option>
                <option value="data_processing">Tratamiento de datos</option>
                <option value="third_party_sharing">Cesión a terceros</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Summary stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div class="text-xs uppercase tracking-wide text-gray-500">Total registros</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ records().length }}</div>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div class="text-xs uppercase tracking-wide text-gray-500">Concedidos</div>
            <div class="text-2xl font-bold text-emerald-600">{{ countGranted() }}</div>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div class="text-xs uppercase tracking-wide text-gray-500">Revocados</div>
            <div class="text-2xl font-bold text-rose-600">{{ countRevoked() }}</div>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div class="text-xs uppercase tracking-wide text-gray-500">Clientes únicos</div>
            <div class="text-2xl font-bold text-blue-600">{{ uniqueSubjects() }}</div>
          </div>
        </div>

        <!-- Error -->
        @if (errorMessage()) {
          <div class="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            <i class="fas fa-exclamation-circle mr-1"></i> {{ errorMessage() }}
          </div>
        }

        <!-- Table -->
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          @if (loading()) {
            <div class="flex items-center justify-center py-16">
              <div class="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          } @else if (records().length === 0) {
            <div class="text-center py-16 text-gray-500">
              <i class="fas fa-inbox text-4xl mb-3 opacity-50"></i>
              <p>No hay registros que coincidan con los filtros.</p>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th class="px-4 py-3 text-left font-medium">Fecha</th>
                    <th class="px-4 py-3 text-left font-medium">Email</th>
                    <th class="px-4 py-3 text-left font-medium">Tipo</th>
                    <th class="px-4 py-3 text-left font-medium">Decisión</th>
                    <th class="px-4 py-3 text-left font-medium">Método</th>
                    <th class="px-4 py-3 text-left font-medium">IP</th>
                    <th class="px-4 py-3 text-left font-medium">Evidencia</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  @for (rec of records(); track rec.id) {
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td class="px-4 py-3 whitespace-nowrap">
                        <div>{{ rec.created_at | date: 'short' }}</div>
                        @if (rec.withdrawn_at) {
                          <div class="text-xs text-rose-600">
                            Revocado: {{ rec.withdrawn_at | date: 'short' }}
                          </div>
                        }
                      </td>
                      <td class="px-4 py-3">
                        <div class="font-medium text-gray-900 dark:text-white break-all">{{ rec.subject_email }}</div>
                        @if (rec.subject_id) {
                          <div class="text-xs text-gray-400 font-mono">{{ shortId(rec.subject_id) }}</div>
                        }
                      </td>
                      <td class="px-4 py-3 whitespace-nowrap">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                          {{ typeLabel(rec.consent_type) }}
                        </span>
                      </td>
                      <td class="px-4 py-3 whitespace-nowrap">
                        @if (rec.consent_given) {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <i class="fas fa-check-circle"></i> Concedido
                          </span>
                        } @else {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                            <i class="fas fa-times-circle"></i> Denegado
                          </span>
                        }
                      </td>
                      <td class="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                        {{ methodLabel(rec.consent_method) }}
                      </td>
                      <td class="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {{ extractIp(rec.consent_evidence) }}
                      </td>
                      <td class="px-4 py-3">
                        <details class="text-xs">
                          <summary class="cursor-pointer text-blue-600 hover:underline">Ver</summary>
                          <pre class="mt-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded text-xs overflow-x-auto max-w-md">{{ formatEvidence(rec.consent_evidence) }}</pre>
                        </details>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Los registros se conservan durante 5 años según la política de retención RGPD. Para auditorías AEPD,
          exporta a CSV y archiva el archivo junto al acta de inspección.
        </p>
      </div>
    </div>
  `,
})
export class ConsentAuditComponent implements OnInit {
  private gdprService = inject(GdprComplianceService);
  private supabaseService = inject(SimpleSupabaseService);
  private toast = inject(ToastService);

  // Filter signals (mirrored from ngModel)
  searchEmail = '';
  fromDate = '';
  toDate = '';
  consentType = '';

  records = signal<GdprConsentRecord[]>([]);
  loading = signal(false);
  exporting = signal(false);
  errorMessage = signal<string | null>(null);

  // Stats
  countGranted = computed(() => this.records().filter((r) => r.consent_given).length);
  countRevoked = computed(() => this.records().filter((r) => !r.consent_given).length);
  uniqueSubjects = computed(() => {
    const set = new Set<string>();
    for (const r of this.records()) {
      if (r.subject_email) set.add(r.subject_email.toLowerCase());
    }
    return set.size;
  });

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  /**
   * Triggered when any filter input changes. We debounce lightly so the user
   * doesn't trigger a DB round-trip per keystroke — debouncing happens at the
   * template level via Angular's default change-detection tick (250ms after
   * the last change).
   */
  onFilterChange(): void {
    this.scheduleRefresh();
  }

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 250);
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      // Fetch with the existing service, then post-filter by date and type
      // (the service already filters by email when provided).
      const rows = await firstValueFrom(this.gdprService.getConsentRecords());
      let filtered = rows || [];

      if (this.searchEmail.trim()) {
        const needle = this.searchEmail.trim().toLowerCase();
        filtered = filtered.filter((r) => (r.subject_email ?? '').toLowerCase().includes(needle));
      }
      if (this.consentType) {
        filtered = filtered.filter((r) => r.consent_type === this.consentType);
      }
      if (this.fromDate) {
        const from = new Date(this.fromDate).getTime();
        filtered = filtered.filter((r) => {
          const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
          return ts >= from;
        });
      }
      if (this.toDate) {
        // Inclusive end-of-day for `toDate`.
        const to = new Date(this.toDate).getTime() + 24 * 60 * 60 * 1000 - 1;
        filtered = filtered.filter((r) => {
          const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
          return ts <= to;
        });
      }

      // Sort newest first
      filtered = [...filtered].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      });

      this.records.set(filtered);
    } catch (e: any) {
      console.error('[ConsentAudit] fetch failed', e);
      this.errorMessage.set(e?.message ?? 'No se pudieron cargar los registros.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Export the currently visible rows to CSV. We generate the file in-memory
   * and trigger a download via a Blob + ObjectURL — no server round-trip.
   * CSV-safe: every field is wrapped in double quotes and quotes are escaped.
   */
  async exportCsv(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      const rows = this.records();
      const headers = [
        'created_at',
        'withdrawn_at',
        'subject_email',
        'subject_id',
        'consent_type',
        'consent_given',
        'consent_method',
        'ip',
        'user_agent',
        'company_id',
        'legal_basis',
        'retention_period',
        'evidence',
      ];
      const lines: string[] = [headers.join(',')];

      for (const r of rows) {
        const ip = this.extractIp(r.consent_evidence);
        const ua = this.extractUa(r.consent_evidence);
        const fields = [
          r.created_at ?? '',
          r.withdrawn_at ?? '',
          r.subject_email ?? '',
          r.subject_id ?? '',
          r.consent_type ?? '',
          r.consent_given ? 'true' : 'false',
          r.consent_method ?? '',
          ip,
          ua,
          r.consent_evidence?.company_id ?? '',
          r.legal_basis ?? '',
          r.retention_period ?? '',
          r.consent_evidence ? JSON.stringify(r.consent_evidence) : '',
        ];
        lines.push(fields.map((f) => this.csvCell(String(f))).join(','));
      }

      const csv = lines.join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `consent-audit-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      this.toast.success(
        'Exportación completada',
        `Se descargaron ${rows.length} registros en CSV.`,
      );
    } catch (e: any) {
      console.error('[ConsentAudit] export failed', e);
      this.toast.error('Error al exportar', e?.message ?? 'No se pudo generar el CSV.');
    } finally {
      this.exporting.set(false);
    }
  }

  /**
   * Wrap a CSV cell in quotes and escape internal quotes per RFC 4180.
   * Commas and newlines inside the value trigger the wrap.
   */
  private csvCell(raw: string): string {
    if (raw == null) return '';
    const needsQuotes = /[",\n\r]/.test(raw);
    const escaped = raw.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  }

  typeLabel(type: string): string {
    switch (type) {
      case 'terms_of_service':
        return 'Términos de uso';
      case 'privacy_policy':
        return 'Privacidad';
      case 'marketing':
        return 'Marketing';
      case 'health_data':
        return 'Datos de salud';
      case 'analytics':
        return 'Analítica';
      case 'data_processing':
        return 'Tratamiento';
      case 'third_party_sharing':
        return 'Terceros';
      default:
        return type;
    }
  }

  methodLabel(method: string | undefined): string {
    if (!method) return '—';
    switch (method) {
      case 'email_link':
      case 'email_link_accept_all':
      case 'email_link_reject_all':
      case 'email_link_custom':
        return 'Email';
      case 'portal':
      case 'portal_digital':
        return 'Portal';
      case 'form':
        return 'Formulario';
      case 'phone':
        return 'Teléfono';
      case 'in_person':
        return 'Presencial';
      case 'physical_document':
        return 'Documento físico';
      case 'withdrawal':
        return 'Retirada';
      default:
        return method;
    }
  }

  extractIp(evidence: any): string {
    if (!evidence || typeof evidence !== 'object') return '—';
    return (evidence.ip ?? evidence.ip_address ?? '—') as string;
  }

  extractUa(evidence: any): string {
    if (!evidence || typeof evidence !== 'object') return '';
    return (evidence.user_agent ?? '') as string;
  }

  formatEvidence(evidence: any): string {
    if (!evidence) return '—';
    try {
      return JSON.stringify(evidence, null, 2);
    } catch {
      return String(evidence);
    }
  }

  shortId(id: string | undefined): string {
    if (!id) return '';
    return id.length > 8 ? id.slice(0, 8) : id;
  }
}