import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { CompanyEmailService } from '../../../services/company-email.service';
import {
  CompanyEmailSetting,
  EmailType,
  EMAIL_TYPE_LABELS,
} from '../../../models/company-email.models';

/**
 * EmailTemplatesComponent
 *
 * Standalone settings page at /settings/email-templates. Lets the tenant owner/admin
 * edit the subject + body templates that send-branded-email uses for each
 * transactional email type. The custom_body_template supports {{key}} placeholders
 * that are interpolated from the data passed by the calling Edge Function (see
 * send-branded-email TemplateData for the full list). For the consent flow the
 * caller passes { link, consent_url, client_name, company_name } so the template
 * author can reference those flat keys.
 *
 * Editing happens through a single CompanyEmailSetting.updateTemplate() call
 * (already used by the existing EmailSettingsComponent embedded in the
 * Configuracion page). This component just exposes a focused UI for it.
 */
@Component({
  selector: 'app-email-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  template: `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-900/40 p-4 md:p-8">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <i class="fas fa-envelope-open-text text-blue-600"></i>
            {{ 'emailTemplates.title' | transloco }}
          </h1>
          <p class="text-gray-500 dark:text-gray-400 mt-1">
            {{ 'emailTemplates.subtitle' | transloco }}
          </p>
        </div>

        @if (loading()) {
          <div class="flex items-center justify-center py-16">
            <div class="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        } @else if (loadError()) {
          <div class="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            <i class="fas fa-exclamation-circle mr-1"></i>
            {{ loadError() }}
          </div>
        } @else {
          <!-- List of email types -->
          <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <ul class="divide-y divide-gray-200 dark:divide-gray-700">
              @for (type of emailTypes; track type) {
                <li class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  <div class="flex items-center justify-between gap-4">
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold text-gray-900 dark:text-white">
                        {{ getEmailTypeLabel(type) }}
                        @if (type === 'consent') {
                          <span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            <i class="fas fa-star mr-1"></i>
                            {{ 'emailTemplates.priority' | transloco }}
                          </span>
                        }
                      </p>
                      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        @if (getSettingForType(type); as setting) {
                          @if (setting.is_active) {
                            <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <i class="fas fa-circle text-[8px]"></i>
                              {{ 'emailTemplates.active' | transloco }}
                            </span>
                          } @else {
                            <span class="inline-flex items-center gap-1 text-gray-400">
                              <i class="fas fa-circle text-[8px]"></i>
                              {{ 'emailTemplates.inactive' | transloco }}
                            </span>
                          }
                          @if (setting.custom_subject_template) {
                            · {{ 'emailTemplates.customized' | transloco }}
                          } @else {
                            · {{ 'emailTemplates.defaultTemplate' | transloco }}
                          }
                        } @else {
                          <span class="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <i class="fas fa-exclamation-triangle"></i>
                            {{ 'emailTemplates.notConfigured' | transloco }}
                          </span>
                        }
                      </p>
                    </div>
                    <button
                      type="button"
                      (click)="openEditor(type)"
                      [disabled]="!getSettingForType(type)"
                      class="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                    >
                      <i class="fas fa-pen"></i>
                      {{ 'emailTemplates.edit' | transloco }}
                    </button>
                  </div>
                </li>
              }
            </ul>
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-400 mt-4">
            <i class="fas fa-info-circle mr-1"></i>
            {{ 'emailTemplates.variablesHint' | transloco }}
            <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{{ '{{link}}' }}</code>,
            <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{{ '{{consent_url}}' }}</code>,
            <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{{ '{{client_name}}' }}</code>,
            <code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">{{ '{{company_name}}' }}</code>
          </p>
        }
      </div>

      <!-- Editor modal -->
      @if (editingType()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeEditor()"
        >
          <div
            class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            (click)="$event.stopPropagation()"
          >
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
              <div>
                <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ 'emailTemplates.editorTitle' | transloco }} — {{ getEmailTypeLabel(editingType()!) }}
                </h2>
                @if (editingType() === 'consent') {
                  <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    {{ 'emailTemplates.consentHint' | transloco }}
                  </p>
                }
              </div>
              <button
                type="button"
                (click)="closeEditor()"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <i class="fas fa-times text-xl"></i>
              </button>
            </div>

            <div class="p-6 space-y-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {{ 'emailTemplates.subjectLabel' | transloco }}
                </label>
                <input
                  type="text"
                  [(ngModel)]="editorSubject"
                  [disabled]="saving()"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="{{ 'emailTemplates.subjectPlaceholder' | transloco }}"
                />
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {{ 'emailTemplates.bodyLabel' | transloco }}
                </label>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {{ 'emailTemplates.bodyHelp' | transloco }}
                </p>
                <textarea
                  [(ngModel)]="editorBody"
                  [disabled]="saving()"
                  rows="14"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="{{ 'emailTemplates.bodyPlaceholder' | transloco }}"
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  {{ 'emailTemplates.buttonTextLabel' | transloco }}
                </label>
                <input
                  type="text"
                  [(ngModel)]="editorButtonText"
                  [disabled]="saving()"
                  class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="{{ 'emailTemplates.buttonTextPlaceholder' | transloco }}"
                />
              </div>
            </div>

            <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 sticky bottom-0 bg-white dark:bg-gray-800">
              <button
                type="button"
                (click)="closeEditor()"
                [disabled]="saving()"
                class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {{ 'emailTemplates.cancel' | transloco }}
              </button>
              <button
                type="button"
                (click)="save()"
                [disabled]="saving()"
                class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium inline-flex items-center gap-2"
              >
                @if (saving()) {
                  <i class="fas fa-spinner fa-spin"></i>
                }
                {{ 'emailTemplates.save' | transloco }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class EmailTemplatesComponent implements OnInit {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private emailService = inject(CompanyEmailService);
  private transloco = inject(TranslocoService);

  // All email types the tenant can customize. Order = display order.
  // The consent type is intentionally listed first so it stands out.
  emailTypes: EmailType[] = [
    'consent',
    'booking_confirmation',
    'booking_reminder',
    'booking_cancellation',
    'invoice',
    'quote',
    'invite',
    'invite_owner',
    'invite_client',
    'waitlist',
    'inactive_notice',
    'welcome',
    'password_reset',
    'magic_link',
    'generic',
  ];

  settings: CompanyEmailSetting[] = [];
  loading = signal(false);
  loadError = signal<string | null>(null);
  saving = signal(false);

  // Editor state
  editingType = signal<EmailType | null>(null);
  editorSubject = '';
  editorBody = '';
  editorButtonText = '';
  private editingSettingId: string | null = null;

  async ngOnInit(): Promise<void> {
    const profile = await firstValueFrom(this.auth.userProfile$);
    const companyId = profile?.company_id;
    if (!companyId) {
      this.loadError.set('No se pudo determinar la empresa actual.');
      return;
    }
    await this.loadData(companyId);
  }

  async loadData(companyId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.settings = await firstValueFrom(this.emailService.getSettings(companyId));
    } catch (err: any) {
      this.loadError.set(err?.message || 'Error al cargar las plantillas.');
      console.error('[email-templates] load failed', err);
    } finally {
      this.loading.set(false);
    }
  }

  getSettingForType(type: EmailType): CompanyEmailSetting | undefined {
    return this.settings.find((s) => s.email_type === type);
  }

  getEmailTypeLabel(type: EmailType): string {
    return EMAIL_TYPE_LABELS[type] || type;
  }

  openEditor(type: EmailType): void {
    const setting = this.getSettingForType(type);
    if (!setting) return;
    this.editingSettingId = setting.id;
    this.editingType.set(type);
    this.editorSubject = setting.custom_subject_template || '';
    this.editorBody = setting.custom_body_template || '';
    this.editorButtonText = setting.custom_button_text || '';
  }

  closeEditor(): void {
    if (this.saving()) return;
    this.editingType.set(null);
    this.editingSettingId = null;
    this.editorSubject = '';
    this.editorBody = '';
    this.editorButtonText = '';
  }

  async save(): Promise<void> {
    if (!this.editingSettingId) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.emailService.updateTemplate(
          this.editingSettingId,
          this.editorSubject,
          this.editorBody,
          undefined,
          this.editorButtonText || undefined,
        ),
      );
      this.toast.success(
        this.transloco.translate('emailTemplates.toast.success'),
        this.transloco.translate('emailTemplates.toast.saved'),
      );
      // Refresh settings list
      const profile = await firstValueFrom(this.auth.userProfile$);
      if (profile?.company_id) {
        await this.loadData(profile.company_id);
      }
      this.closeEditor();
    } catch (err: any) {
      this.toast.error(
        this.transloco.translate('emailTemplates.toast.error'),
        err?.message || this.transloco.translate('emailTemplates.toast.saveError'),
      );
    } finally {
      this.saving.set(false);
    }
  }
}