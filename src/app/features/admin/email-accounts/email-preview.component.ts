import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { CompanyEmailService } from '../../../services/company-email.service';
import { ToastService } from '../../../services/toast.service';
import { EmailType, EMAIL_TYPE_LABELS } from '../../../models/company-email.models';

@Component({
  selector: 'app-email-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-preview.component.html',
  styleUrls: ['./email-preview.component.scss'],
})
export class EmailPreviewComponent implements OnInit {
  @Input() companyId: string | null = null;
  @Input() emailType: EmailType | null = null;
  @Output() close = new EventEmitter<void>();

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);

  htmlContent = signal<string>('');
  loading = signal(true);

  get emailTypeLabel(): string {
    return this.emailType ? EMAIL_TYPE_LABELS[this.emailType] || this.emailType : '';
  }

  async ngOnInit() {
    if (this.companyId && this.emailType) {
      await this.loadPreview();
    }
  }

  async loadPreview() {
    if (!this.companyId || !this.emailType) return;

    this.loading.set(true);
    try {
      const html = await firstValueFrom(
        this.emailService.getEmailTemplatePreview(this.companyId, this.emailType)
      );
      this.htmlContent.set(html);
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo cargar la vista previa');
      this.htmlContent.set('<p class="text-red-500">Error al cargar la previsualización</p>');
    } finally {
      this.loading.set(false);
    }
  }

  onClose() {
    this.close.emit();
  }
}
