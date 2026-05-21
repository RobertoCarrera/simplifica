import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../../services/auth.service';
import { SimpleSupabaseService } from '../../../../../services/simple-supabase.service';
import { ToastService } from '../../../../../services/toast.service';
import { createClient } from '@supabase/supabase-js';

interface EmailPreferences {
  google_calendar_invite: boolean;
  booking_confirmation_client: boolean;
  booking_cancellation_client: boolean;
  booking_notification_owner: boolean;
  booking_notification_professional: boolean;
}

const DEFAULTS: EmailPreferences = {
  google_calendar_invite: true,
  booking_confirmation_client: true,
  booking_cancellation_client: true,
  booking_notification_owner: true,
  booking_notification_professional: true,
};

interface ToggleOption {
  key: keyof EmailPreferences;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-email-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
      <!-- Header -->
      <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
          <div class="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
            <i class="fas fa-bell text-lg"></i>
          </div>
          Preferencias de Notificaciones
        </h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 pl-[3.25rem]">
          Controla qué correos y notificaciones se envían automáticamente a tus clientes y profesionales.
        </p>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="flex items-center justify-center py-20">
          <svg class="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
        </div>
      }

      <!-- Toggles -->
      @if (!loading()) {
        <div class="p-6 space-y-1">
          @for (opt of toggles; track opt.key) {
            <div class="flex items-center justify-between py-4 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                 [class.border-b]="!$last"
                 [class.border-gray-100]="!$last"
                 [class.dark:border-gray-700]="!$last">
              <div class="flex items-start gap-4 flex-1 min-w-0">
                <div class="p-2.5 rounded-lg shrink-0"
                     [class.bg-blue-100]="prefs()[opt.key]"
                     [class.dark:bg-blue-900/30]="prefs()[opt.key]"
                     [class.text-blue-600]="prefs()[opt.key]"
                     [class.dark:text-blue-400]="prefs()[opt.key]"
                     [class.bg-gray-100]="!prefs()[opt.key]"
                     [class.dark:bg-gray-700]="!prefs()[opt.key]"
                     [class.text-gray-400]="!prefs()[opt.key]"
                     [class.dark:text-gray-500]="!prefs()[opt.key]">
                  <i class="fas {{ opt.icon }} text-lg"></i>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ opt.label }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ opt.description }}</p>
                </div>
              </div>
              <button
                (click)="toggle(opt.key)"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                [class.bg-indigo-600]="prefs()[opt.key]"
                [class.bg-gray-200]="!prefs()[opt.key]"
                [class.dark:bg-gray-600]="!prefs()[opt.key]"
                role="switch"
                [attr.aria-checked]="prefs()[opt.key]">
                <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
                      [class.translate-x-5]="prefs()[opt.key]"
                      [class.translate-x-0]="!prefs()[opt.key]">
                </span>
              </button>
            </div>
          }

          <!-- Save button -->
          <div class="pt-4">
            <button (click)="save()"
                    [disabled]="saving()"
                    class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              @if (saving()) {
                <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
              }
              {{ saving() ? 'Guardando...' : 'Guardar preferencias' }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class EmailPreferencesComponent implements OnInit {
  private authService = inject(AuthService);
  private simpleSupabase = inject(SimpleSupabaseService);
  private toast = inject(ToastService);

  loading = signal(true);
  saving = signal(false);
  prefs = signal<EmailPreferences>({ ...DEFAULTS });

  readonly toggles: ToggleOption[] = [
    {
      key: 'google_calendar_invite',
      label: 'Invitaciones de Google Calendar',
      description: 'Envía invitaciones de calendario a los clientes cuando se crea, modifica o cancela una reserva. Desactívalo durante importaciones masivas.',
      icon: 'fa-calendar-plus',
    },
    {
      key: 'booking_confirmation_client',
      label: 'Confirmación de reserva al cliente',
      description: 'Envía un correo de confirmación al cliente cuando completa una reserva desde la agenda pública.',
      icon: 'fa-envelope-circle-check',
    },
    {
      key: 'booking_cancellation_client',
      label: 'Cancelación de reserva al cliente',
      description: 'Envía un correo al cliente cuando su reserva es cancelada.',
      icon: 'fa-envelope',
    },
    {
      key: 'booking_notification_owner',
      label: 'Notificación al administrador',
      description: 'Notifica al owner/administrador de la empresa cuando se crea una nueva reserva.',
      icon: 'fa-user-tie',
    },
    {
      key: 'booking_notification_professional',
      label: 'Notificación al profesional',
      description: 'Notifica al profesional asignado cuando un cliente reserva con él.',
      icon: 'fa-user-doctor',
    },
  ];

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const companyId = this.authService.currentCompanyId();
      if (!companyId) { this.loading.set(false); return; }

      const supabase = this.simpleSupabase.getClient();
      const { data, error } = await supabase
        .from('company_settings')
        .select('email_preferences')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;

      const saved = data?.email_preferences || {};
      this.prefs.set({ ...DEFAULTS, ...saved });
    } catch (err: any) {
      this.toast.error('Error', 'No se pudieron cargar las preferencias.');
    } finally {
      this.loading.set(false);
    }
  }

  toggle(key: keyof EmailPreferences): void {
    this.prefs.update(p => ({ ...p, [key]: !p[key] }));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const companyId = this.authService.currentCompanyId();
      if (!companyId) { this.saving.set(false); return; }

      const supabase = this.simpleSupabase.getClient();
      const { error } = await supabase
        .from('company_settings')
        .upsert({ company_id: companyId, email_preferences: this.prefs() }, { onConflict: 'company_id' });

      if (error) throw error;

      this.toast.success('Guardado', 'Preferencias de notificaciones actualizadas.');
    } catch (err: any) {
      this.toast.error('Error', 'No se pudieron guardar las preferencias.');
    } finally {
      this.saving.set(false);
    }
  }
}
