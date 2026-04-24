import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CompanyEmailService } from '../../../services/company-email.service';
import { ToastService } from '../../../services/toast.service';
import {
  CompanyEmailLog,
  EmailLogFilters,
  EmailType,
} from '../../../models/company-email.models';

@Component({
  selector: 'app-email-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './email-logs.component.html',
  styleUrls: ['./email-logs.component.scss'],
})
export class EmailLogsComponent implements OnInit {
  @Input() companyId: string | null = null;

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);
  private translocoService = inject(TranslocoService);

  logs: CompanyEmailLog[] = [];
  loading = signal(false);

  // Filters
  filters: EmailLogFilters = {
    page: 1,
    page_size: 20,
  };

  // Filter options
  statusOptions: Array<{ value: string; label: string }> = [];
  emailTypeOptions: Array<{ value: string; label: string }> = [];

  // Pagination
  totalPages = signal(1);
  currentPage = signal(1);

  async ngOnInit() {
    this.statusOptions = [
      { value: '', label: this.translocoService.translate('emailAccounts.logs.all') },
      { value: 'sent', label: this.translocoService.translate('emailAccounts.logs.sent') },
      { value: 'failed', label: this.translocoService.translate('emailAccounts.logs.failed') },
      { value: 'bounced', label: this.translocoService.translate('emailAccounts.logs.bounced') },
      { value: 'complained', label: this.translocoService.translate('emailAccounts.logs.complained') },
    ];
    this.emailTypeOptions = [
      { value: '', label: this.translocoService.translate('emailAccounts.logs.all') },
      { value: 'booking_confirmation', label: this.translocoService.translate('emailAccounts.logs.bookingConfirmation') },
      { value: 'invoice', label: this.translocoService.translate('emailAccounts.logs.invoice') },
      { value: 'quote', label: this.translocoService.translate('emailAccounts.logs.quote') },
      { value: 'consent', label: this.translocoService.translate('emailAccounts.logs.consent') },
      { value: 'invite', label: this.translocoService.translate('emailAccounts.logs.invite') },
      { value: 'waitlist', label: this.translocoService.translate('emailAccounts.logs.waitlist') },
      { value: 'inactive_notice', label: this.translocoService.translate('emailAccounts.logs.inactiveNotice') },
      { value: 'generic', label: this.translocoService.translate('emailAccounts.logs.generic') },
    ];
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
      this.toast.error(this.translocoService.translate('emailAccounts.toast.errorLoadingLogs'), this.translocoService.translate('emailAccounts.toast.errorLoadingLogsMsg'));
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
    const emailTypeLabels: Record<string, string> = {
      booking_confirmation: this.translocoService.translate('emailAccounts.logs.bookingConfirmation'),
      invoice: this.translocoService.translate('emailAccounts.logs.invoice'),
      quote: this.translocoService.translate('emailAccounts.logs.quote'),
      consent: this.translocoService.translate('emailAccounts.logs.consent'),
      invite: this.translocoService.translate('emailAccounts.logs.invite'),
      waitlist: this.translocoService.translate('emailAccounts.logs.waitlist'),
      inactive_notice: this.translocoService.translate('emailAccounts.logs.inactiveNotice'),
      generic: this.translocoService.translate('emailAccounts.logs.generic'),
    };
    return emailTypeLabels[type as EmailType] || type;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const locale = this.translocoService.getActiveLang() || 'es-ES';
    return date.toLocaleString(locale, {
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
