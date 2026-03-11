import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { InvoiceSeries } from '../../../models/invoice.model';

@Component({
  selector: 'app-invoice-series-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './invoice-series-settings.component.html'
})
export class InvoiceSeriesSettingsComponent {
  private invoicesService = inject(SupabaseInvoicesService);

  series: InvoiceSeries[] = [];
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

  constructor() {
    this.loadSeries();
  }

  async loadSeries() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await firstValueFrom(this.invoicesService.getAllInvoiceSeries());
      this.series = rows || [];
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
