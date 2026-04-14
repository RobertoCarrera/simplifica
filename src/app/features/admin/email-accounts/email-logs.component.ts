import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CompanyEmailService } from '../../../services/company-email.service';
import { ToastService } from '../../../services/toast.service';
import {
  CompanyEmailLog,
  EmailLogFilters,
  EmailType,
  EMAIL_TYPE_LABELS,
} from '../../../models/company-email.models';

@Component({
  selector: 'app-email-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './email-logs.component.html',
  styleUrls: ['./email-logs.component.scss'],
})
export class EmailLogsComponent implements OnInit {
  @Input() companyId: string | null = null;

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);

  logs: CompanyEmailLog[] = [];
  loading = signal(false);

  // Filters
  filters: EmailLogFilters = {
    page: 1,
    page_size: 20,
  };

  // Filter options
  statusOptions: Array<{ value: string; label: string }> = [
    { value: '', label: 'Todos' },
    { value: 'sent', label: 'Enviado' },
    { value: 'failed', label: 'Fallido' },
    { value: 'bounced', label: 'Rebotado' },
    { value: 'complained', label: 'Quejado' },
  ];

  emailTypeOptions: Array<{ value: string; label: string }> = [
    { value: '', label: 'Todos' },
    { value: 'booking_confirmation', label: 'Confirmación de reserva' },
    { value: 'invoice', label: 'Factura' },
    { value: 'quote', label: 'Presupuesto' },
    { value: 'consent', label: 'Consentimiento' },
    { value: 'invite', label: 'Invitación' },
    { value: 'waitlist', label: 'Lista de espera' },
    { value: 'inactive_notice', label: 'Aviso de inactividad' },
    { value: 'generic', label: 'Genérico' },
  ];

  // Pagination
  totalPages = signal(1);
  currentPage = signal(1);

  async ngOnInit() {
    if (this.companyId) {
      await this.loadLogs();
    }
  }

  async loadLogs() {
    if (!this.companyId) return;

    this.loading.set(true);
    try {
      this.logs = await firstValueFrom(
        this.emailService.getLogs(this.companyId, this.filters)
      );
    } catch (err: any) {
      this.toast.error('Error', 'No se pudieron cargar los logs');
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  async applyFilters() {
    this.filters.page = 1;
    this.currentPage.set(1);
    await this.loadLogs();
  }

  async clearFilters() {
    this.filters = {
      page: 1,
      page_size: 20,
    };
    this.currentPage.set(1);
    await this.loadLogs();
  }

  async goToPage(page: number) {
    if (page < 1 || page > this.totalPages()) return;
    this.filters.page = page;
    this.currentPage.set(page);
    await this.loadLogs();
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'sent':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      case 'bounced':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
      case 'complained':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
  }

  getStatusLabel(status: string): string {
    const option = this.statusOptions.find((o) => o.value === status);
    return option?.label || status;
  }

  getEmailTypeLabel(type: string): string {
    return EMAIL_TYPE_LABELS[type as EmailType] || type;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByLogId(index: number, log: CompanyEmailLog): string {
    return log.id;
  }
}
