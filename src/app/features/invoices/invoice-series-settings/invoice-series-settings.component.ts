import { Component, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { InvoiceSeries } from '../../../models/invoice.model';
import { TranslocoPipe } from '@jsverse/transloco';

interface SeriesStats {
  invoice_count: number;
  max_invoice_number: number | null;
}

interface NextNumberValidation {
  valid: boolean;
  error: string | null;
  warning: string | null;
}

@Component({
  selector: 'app-invoice-series-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslocoPipe],
  templateUrl: './invoice-series-settings.component.html'
})
export class InvoiceSeriesSettingsComponent {
  private invoicesService = inject(SupabaseInvoicesService);

  series: InvoiceSeries[] = [];
  /** Per-series stats (loaded once after series list). */
  stats = new Map<string, SeriesStats>();
  loading = signal(false);
  error = signal<string | null>(null);

  creating = signal(false);
  newSeries: Partial<InvoiceSeries> = {
    series_code: '',
    series_name: '',
    year: new Date().getFullYear(),
    prefix: '',
    next_number: 1,
    is_active: true,
    is_default: false,
    verifactu_enabled: false
  } as any;

  // Inline-edit state for the existing series table
  editingSeriesId = signal<string | null>(null);
  editingValue = signal<number | null>(null);
  inlineError = signal<string | null>(null);
  inlineWarning = signal<string | null>(null);

  // Inline-edit state for the prefix field. Parallel to the
  // next_number editor. We keep them separate to avoid coupling the
  // validation logic (next_number has range checks; prefix has
  // format checks) and to keep the templates simple.
  editingPrefix = signal<string | null>(null);
  prefixError = signal<string | null>(null);

  // Per-series computed validators (used in the template when editing)
  // `protected` so the template can read it; `private` would be blocked by
  // Angular's template type checker.
  protected currentStats = computed<SeriesStats | null>(() => {
    const id = this.editingSeriesId();
    if (!id) return null;
    return this.stats.get(id) ?? null;
  });

  currentValidation = computed<NextNumberValidation>(() => {
    const value = this.editingValue();
    const s = this.currentStats();
    if (value === null) {
      return { valid: false, error: null, warning: null };
    }
    if (!Number.isInteger(value) || value < 1) {
      return { valid: false, error: 'invoices.seriesSettings.errors.mustBePositive', warning: null };
    }
    if (s && s.max_invoice_number !== null && value <= s.max_invoice_number) {
      return {
        valid: false,
        error: 'invoices.seriesSettings.errors.wouldOverwrite',
        warning: null,
      };
    }
    if (s && s.max_invoice_number !== null && value > s.max_invoice_number + 1) {
      return {
        valid: true,
        error: null,
        warning: 'invoices.seriesSettings.warnings.gap',
      };
    }
    return { valid: true, error: null, warning: null };
  });

  constructor() {
    this.loadSeries();
  }

  async loadSeries() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await firstValueFrom(this.invoicesService.getAllInvoiceSeries());
      this.series = rows || [];
      // Load stats for each series in parallel
      const statsEntries = await Promise.all(
        this.series.map(async s => {
          try {
            const stat = await firstValueFrom(this.invoicesService.getSeriesStats(s.id));
            return [s.id, stat] as const;
          } catch {
            return [s.id, { invoice_count: 0, max_invoice_number: null }] as const;
          }
        })
      );
      this.stats = new Map(statsEntries);
    } catch (e: any) {
      this.error.set(e?.message || 'No se pudieron cargar las series');
    } finally {
      this.loading.set(false);
    }
  }

  startCreate() {
    this.creating.set(true);
  }

  cancelCreate() {
    this.creating.set(false);
    this.newSeries = {
      series_code: '',
      series_name: '',
      year: new Date().getFullYear(),
      prefix: '',
      next_number: 1,
      is_active: true,
      is_default: false,
      verifactu_enabled: false
    } as any;
  }

  async createSeries() {
    if (!this.newSeries.series_code || !this.newSeries.series_name) {
      return;
    }
    if (typeof this.newSeries.next_number !== 'number' || this.newSeries.next_number < 1) {
      this.error.set('El siguiente número debe ser un entero positivo.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.invoicesService.createInvoiceSeries(this.newSeries));
      this.cancelCreate();
      await this.loadSeries();
    } catch (e: any) {
      this.error.set(e?.message || 'Error creando serie');
    } finally {
      this.loading.set(false);
    }
  }

  startEditNextNumber(s: InvoiceSeries): void {
    this.editingSeriesId.set(s.id);
    this.editingValue.set(s.next_number);
    this.inlineError.set(null);
    this.inlineWarning.set(null);
  }

  cancelEditNextNumber(): void {
    this.editingSeriesId.set(null);
    this.editingValue.set(null);
    this.inlineError.set(null);
    this.inlineWarning.set(null);
  }

  onEditInputChange(value: string | number | null): void {
    if (value === null || value === '') {
      this.editingValue.set(null);
      return;
    }
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    this.editingValue.set(Number.isNaN(n) ? null : n);
  }

  async commitEditNextNumber(s: InvoiceSeries): Promise<void> {
    const validation = this.currentValidation();
    if (!validation.valid) {
      this.inlineError.set(validation.error);
      return;
    }
    const newValue = this.editingValue();
    if (newValue === null || newValue === s.next_number) {
      this.cancelEditNextNumber();
      return;
    }
    this.loading.set(true);
    this.inlineError.set(null);
    this.inlineWarning.set(null);
    try {
      await firstValueFrom(this.invoicesService.updateInvoiceSeries(s.id, { next_number: newValue }));
      await this.loadSeries();
      this.cancelEditNextNumber();
    } catch (e: any) {
      this.inlineError.set(e?.message || 'Error actualizando siguiente número');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Preview of the full_invoice_number the next invoice in this series
   * would get, assuming the new next_number was applied.
   */
  nextInvoicePreview(prefix: string, nextNumber: number): string {
    return `${prefix}${nextNumber}`;
  }

  /**
   * Prefix edit lifecycle. Mirrors the next_number pattern but with
   * format validation (non-empty, no whitespace, max length).
   * The prefix is purely cosmetic in the UI today: full_invoice_number
   * is a DB-generated column that does not use it. Changing the prefix
   * therefore does NOT renumber existing invoices. We surface a warning
   * when the series has existing invoices so the user knows.
   */
  startEditPrefix(s: InvoiceSeries): void {
    this.cancelEditNextNumber();
    this.editingPrefix.set(s.prefix);
    this.prefixError.set(null);
  }

  cancelEditPrefix(): void {
    this.editingPrefix.set(null);
    this.prefixError.set(null);
  }

  onPrefixInputChange(value: string): void {
    this.editingPrefix.set(value);
  }

  /**
   * Format checks for the prefix. We don't allow whitespace and cap
   * the length to keep generated invoice numbers readable.
   */
  private validatePrefix(value: string): { valid: boolean; error: string | null } {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: 'invoices.seriesSettings.errors.prefixEmpty' };
    }
    if (/\s/.test(value)) {
      return { valid: false, error: 'invoices.seriesSettings.errors.prefixWhitespace' };
    }
    if (value.length > 16) {
      return { valid: false, error: 'invoices.seriesSettings.errors.prefixTooLong' };
    }
    return { valid: true, error: null };
  }

  async commitEditPrefix(s: InvoiceSeries): Promise<void> {
    const newPrefix = this.editingPrefix();
    if (newPrefix === null) {
      this.cancelEditPrefix();
      return;
    }
    const validation = this.validatePrefix(newPrefix);
    if (!validation.valid) {
      this.prefixError.set(validation.error);
      return;
    }
    if (newPrefix === s.prefix) {
      this.cancelEditPrefix();
      return;
    }
    this.loading.set(true);
    this.prefixError.set(null);
    try {
      await firstValueFrom(this.invoicesService.updateInvoiceSeries(s.id, { prefix: newPrefix }));
      await this.loadSeries();
      this.cancelEditPrefix();
    } catch (e: any) {
      this.prefixError.set(e?.message || 'Error actualizando prefijo');
    } finally {
      this.loading.set(false);
    }
  }

  getStats(seriesId: string): SeriesStats | null {
    return this.stats.get(seriesId) ?? null;
  }

  async toggleActive(s: InvoiceSeries) {
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.invoicesService.updateInvoiceSeries(s.id, { is_active: !s.is_active }));
      await this.loadSeries();
    } catch (e: any) {
      this.error.set(e?.message || 'Error actualizando serie');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleDefault(s: InvoiceSeries) {
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.invoicesService.setDefaultInvoiceSeries(s.id));
      await this.loadSeries();
    } catch (e: any) {
      this.error.set(e?.message || 'Error marcando serie por defecto');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleVerifactu(s: InvoiceSeries) {
    this.loading.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.invoicesService.updateInvoiceSeries(s.id, { verifactu_enabled: !s.verifactu_enabled }));
      await this.loadSeries();
    } catch (e: any) {
      this.error.set(e?.message || 'Error actualizando VeriFactu');
    } finally {
      this.loading.set(false);
    }
  }
}
