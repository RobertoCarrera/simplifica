import { Component, OnInit, inject } from '@angular/core';
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
export class InvoiceSeriesSettingsComponent implements OnInit {
  private invoicesService = inject(SupabaseInvoicesService);

  series: InvoiceSeries[] = [];
  loading = false;
  error: string | null = null;

  creating = false;
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

  ngOnInit() {
    this.loadSeries();
  }

  loadSeries() {
    this.loading = true;
    this.error = null;
    this.invoicesService.getAllInvoiceSeries().subscribe({
      next: (rows) => {
        this.series = rows || [];
        this.loading = false;
      },
      error: (e: any) => {
        this.error = e?.message || 'No se pudieron cargar las series';
        this.loading = false;
      }
    });
  }

  startCreate() {
    this.creating = true;
  }

  cancelCreate() {
    this.creating = false;
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
    this.loading = true;
    this.invoicesService.createInvoiceSeries(this.newSeries).subscribe({
      next: () => {
        this.cancelCreate();
        this.loading = false;
        this.loadSeries();
      },
      error: (e: any) => {
        this.error = e?.message || 'Error creando serie';
        this.loading = false;
      }
    });
  }

  async toggleActive(s: InvoiceSeries) {
    this.loading = true;
    this.invoicesService.updateInvoiceSeries(s.id, { is_active: !s.is_active }).subscribe({
      next: () => {
        this.loading = false;
        this.loadSeries();
      },
      error: (e: any) => {
        this.error = e?.message || 'Error actualizando serie';
        this.loading = false;
      }
    });
  }

  async toggleDefault(s: InvoiceSeries) {
    this.loading = true;
    this.invoicesService.setDefaultInvoiceSeries(s.id).subscribe({
      next: () => {
        this.loading = false;
        this.loadSeries();
      },
      error: (e: any) => {
        this.error = e?.message || 'Error marcando serie por defecto';
        this.loading = false;
      }
    });
  }

  async toggleVerifactu(s: InvoiceSeries) {
    this.loading = true;
    this.invoicesService.updateInvoiceSeries(s.id, { verifactu_enabled: !s.verifactu_enabled }).subscribe({
      next: () => {
        this.loading = false;
        this.loadSeries();
      },
      error: (e: any) => {
        this.error = e?.message || 'Error actualizando VeriFactu';
        this.loading = false;
      }
    });
  }
}
