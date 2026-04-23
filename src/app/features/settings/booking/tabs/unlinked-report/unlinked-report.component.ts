import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseBookingsService } from '../../../../../services/supabase-bookings.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

interface UnlinkedBooking {
  id: string;
  customer_name: string;
  start_time: string;
  service_name: string | null;
  status: string;
}

interface ProfessionalReport {
  professional_id: string;
  professional_name: string;
  bookings: UnlinkedBooking[];
}

@Component({
  selector: 'app-unlinked-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './unlinked-report.component.html',
  styleUrls: ['./unlinked-report.component.scss'],
})
export class UnlinkedReportComponent implements OnInit {
  private bookingsService = inject(SupabaseBookingsService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  report = signal<ProfessionalReport[]>([]);
  loading = signal(true);
  expandedProfessionals = signal<Set<string>>(new Set());

  // Pagination
  currentPage = signal(1);
  pageSize = 50;

  totalPages = computed(() => Math.ceil(this.report().length / this.pageSize));
  totalBookings = computed(() => this.report().reduce((sum, p) => sum + p.bookings.length, 0));
  totalProfessionals = computed(() => this.report().length);

  paginatedReport = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.report().slice(start, start + this.pageSize);
  });

  async ngOnInit() {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) {
      this.loading.set(false);
      return;
    }

    try {
      const data = await this.bookingsService.getUnlinkedBookingsReport(companyId);
      this.report.set(data);

      // Auto-expand first few professionals if they have bookings
      const initialExpanded = new Set<string>();
      const topProfessionals = data.slice(0, 3).map((p: { professional_id: string }) => p.professional_id);
      topProfessionals.forEach((id: string) => initialExpanded.add(id));
      this.expandedProfessionals.set(initialExpanded);
    } catch (err) {
      console.error('[UnlinkedReportComponent] Error loading:', err);
      this.toast.error('Error', 'No se pudo cargar el reporte de bookings sin sala');
    } finally {
      this.loading.set(false);
    }
  }

  toggleExpanded(professionalId: string) {
    const current = new Set(this.expandedProfessionals());
    if (current.has(professionalId)) {
      current.delete(professionalId);
    } else {
      current.add(professionalId);
    }
    this.expandedProfessionals.set(current);
  }

  isExpanded(professionalId: string): boolean {
    return this.expandedProfessionals().has(professionalId);
  }

  formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }
}
