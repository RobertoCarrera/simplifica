import { Component, OnInit, inject, signal, ChangeDetectionStrategy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SupabaseSettingsService,
  CompanySettings,
} from '../../../../../services/supabase-settings.service';
import { ToastService } from '../../../../../services/toast.service';
import { AuthService } from '../../../../../services/auth.service';

@Component({
  selector: 'app-booking-waitlist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="animate-fadeIn py-6 max-w-3xl space-y-6">
      <div class="flex items-center gap-3 mb-2">
        <button
          (click)="goBack.emit()"
          class="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex-shrink-0"
          title="Volver a Reservas"
        >
          <i class="fas fa-arrow-left"></i>
        </button>
        <div
          class="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0"
        >
          <i class="fas fa-user-clock"></i>
        </div>
        <div>
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">Lista de Espera</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Configura cómo gestionar la lista de espera para tus servicios reservables.
          </p>
        </div>
      </div>

      @if (loading()) {
        <div class="space-y-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div
              class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 animate-pulse"
            >
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3"></div>
              <div class="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-2/3"></div>
            </div>
          }
        </div>
      } @else {
        <!-- Modo Activo -->
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div
                class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5"
              >
                <i class="fas fa-bolt text-sm"></i>
              </div>
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Modo Activo</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  Permite a los clientes unirse a la lista de espera para un horario específico
                  completamente reservado. Cuando se cancela una reserva, el sistema notifica
                  automáticamente al siguiente cliente de la lista.
                </p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                class="sr-only peer"
                [checked]="settings().waitlist_active_mode ?? true"
                (change)="saveSetting('waitlist_active_mode', $any($event.target).checked)"
                [disabled]="saving()"
              />
              <div
                class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 disabled:opacity-50"
              ></div>
            </label>
          </div>

          @if (settings().waitlist_active_mode ?? true) {
            <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
              <!-- Auto-promover -->
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-2.5">
                  <i class="fas fa-magic text-blue-400 mt-0.5 text-xs"></i>
                  <div>
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                      Promoción automática
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Al cancelarse una reserva, el sistema convierte automáticamente la entrada de
                      lista de espera en reserva confirmada, sin que el cliente tenga que hacer
                      nada.
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    [checked]="settings().waitlist_auto_promote ?? true"
                    (change)="saveSetting('waitlist_auto_promote', $any($event.target).checked)"
                    [disabled]="saving()"
                  />
                  <div
                    class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 disabled:opacity-50"
                  ></div>
                </label>
              </div>

              @if (!(settings().waitlist_auto_promote ?? true)) {
                <!-- Ventana de notificación (solo cuando auto-promote está OFF) -->
                <div
                  class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 animate-fadeIn"
                >
                  <div class="flex items-center gap-2 mb-3">
                    <i class="fas fa-clock text-amber-500 text-sm"></i>
                    <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Ventana de reclamación
                    </p>
                  </div>
                  <p class="text-xs text-amber-700 dark:text-amber-300 mb-3">
                    Con promoción automática desactivada, el cliente recibe una notificación y tiene
                    este tiempo para confirmar su reserva antes de que la plaza se libere para el
                    siguiente.
                  </p>
                  <div class="flex items-center gap-3">
                    <select
                      class="text-sm border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-amber-900 dark:text-amber-100 focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50"
                      [ngModel]="settings().waitlist_notification_window ?? 15"
                      (ngModelChange)="saveSetting('waitlist_notification_window', $event)"
                      [disabled]="saving()"
                    >
                      <option [value]="10">10 minutos</option>
                      <option [value]="15">15 minutos</option>
                      <option [value]="30">30 minutos</option>
                      <option [value]="60">1 hora</option>
                      <option [value]="120">2 horas</option>
                      <option [value]="240">4 horas</option>
                      <option [value]="1440">24 horas</option>
                    </select>
                    <span class="text-xs text-amber-600 dark:text-amber-400"
                      >para reclamar el turno</span
                    >
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Modo Pasivo -->
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div
                class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0 mt-0.5"
              >
                <i class="fas fa-bell text-sm"></i>
              </div>
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Modo Pasivo</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  Permite a los clientes suscribirse para ser notificados cuando haya disponibilidad
                  en un servicio, sin reservar un horario específico. Ideal para servicios con alta
                  demanda.
                </p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                class="sr-only peer"
                [checked]="settings().waitlist_passive_mode ?? true"
                (change)="saveSetting('waitlist_passive_mode', $any($event.target).checked)"
                [disabled]="saving()"
              />
              <div
                class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600 disabled:opacity-50"
              ></div>
            </label>
          </div>

          @if (settings().waitlist_passive_mode ?? true) {
            <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div
                class="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex items-start gap-2"
              >
                <i class="fas fa-info-circle text-purple-500 text-xs mt-0.5"></i>
                <p class="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                  Con el modo pasivo activado, los clientes verán una página "Lista de espera" en su
                  portal donde podrán suscribirse a los servicios que les interesen. Cuando se
                  cancele cualquier reserva de ese servicio, recibirán una notificación por email e
                  in-app (máximo 1 por servicio cada 24 horas).
                </p>
              </div>
            </div>
          }
        </div>

        <!-- Info card sobre limitación de frecuencia -->
        <div
          class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-5"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center flex-shrink-0"
            >
              <i class="fas fa-shield-alt text-sm"></i>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Protección anti-spam
              </h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                El sistema limita automáticamente las notificaciones pasivas a
                <strong class="text-gray-700 dark:text-gray-300"
                  >1 por cliente por servicio cada 24 horas</strong
                >, independientemente de cuántas reservas se cancelen en ese periodo. Esto evita
                saturar a los clientes con notificaciones repetitivas.
              </p>
            </div>
          </div>
        </div>

        @if (saving()) {
          <div
            class="fixed bottom-6 right-6 bg-gray-900 dark:bg-gray-700 text-white px-4 py-2.5 rounded-xl shadow-xl text-sm flex items-center gap-2 animate-fadeIn z-50"
          >
            <div
              class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
            ></div>
            Guardando ajustes...
          </div>
        }
      }
    </div>
  `,
})
export class BookingWaitlistComponent implements OnInit {
  private settingsService = inject(SupabaseSettingsService);
  private toast = inject(ToastService);
  private authService = inject(AuthService);

  @Output() goBack = new EventEmitter<void>();

  loading = signal(true);
  saving = signal(false);
  settings = signal<Partial<CompanySettings>>({
    waitlist_active_mode: true,
    waitlist_passive_mode: true,
    waitlist_auto_promote: true,
    waitlist_notification_window: 15,
  });

  ngOnInit() {
    this.loadSettings();
  }

  private loadSettings() {
    this.loading.set(true);
    this.settingsService.getCompanySettings().subscribe({
      next: (data) => {
        if (data) {
          this.settings.update((prev) => ({
            ...prev,
            waitlist_active_mode: data.waitlist_active_mode ?? true,
            waitlist_passive_mode: data.waitlist_passive_mode ?? true,
            waitlist_auto_promote: data.waitlist_auto_promote ?? true,
            waitlist_notification_window: data.waitlist_notification_window ?? 15,
          }));
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('BookingWaitlistComponent: error loading settings', err);
        this.loading.set(false);
      },
    });
  }

  saveSetting(key: keyof CompanySettings, value: boolean | number) {
    // Optimistic update
    this.settings.update((prev) => ({ ...prev, [key]: value }));
    this.saving.set(true);
    const companyId = this.authService.currentCompanyId();

    this.settingsService
      .upsertCompanySettings({ [key]: value } as Partial<CompanySettings>, companyId ?? undefined)
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.settings.set(result);
        },
        error: (err) => {
          console.error('BookingWaitlistComponent: error saving setting', err);
          this.toast.error('Error', 'No se pudo guardar la configuración');
          this.loadSettings();
          this.saving.set(false);
        },
      });
  }
}
