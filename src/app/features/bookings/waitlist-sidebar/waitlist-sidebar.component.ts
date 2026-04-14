import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe, Location } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  SupabaseWaitlistService,
  WaitlistEntry,
  ClaimWaitlistResult,
} from '../../../services/supabase-waitlist.service';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

interface PassiveService {
  service: Service;
  myEntry: WaitlistEntry | null;
  joining: boolean;
}

interface NotifiedEntry {
  entry: WaitlistEntry;
  service: Service | null;
  claiming: boolean;
  claimError: string | null;
}

/**
 * T13: Waitlist sidebar page — passive mode + claim flow.
 *
 * Shows:
 *  1. Services with passive mode enabled — client can subscribe/unsubscribe
 *  2. Active (notified) entries that the client can claim into a booking
 *
 * Route: /waitlist (added in T14, accessible via sidebar for clients)
 *
 * T15: All RPC errors (spot_taken, window_expired, already_booked) are handled
 *      here with user-facing messages.
 */
@Component({
  selector: 'app-waitlist-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-gray-50 dark:bg-gray-900 min-h-full">
      <div class="container mx-auto px-4 py-6 max-w-2xl space-y-8">
        <!-- Back button -->
        <button
          (click)="goBack()"
          class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors group"
        >
          <i class="fas fa-arrow-left text-xs group-hover:-translate-x-0.5 transition-transform"></i>
          Volver a Reservas
        </button>

        <!-- Header -->
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0"
          >
            <i class="fas fa-user-clock"></i>
          </div>
          <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">Lista de Espera</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Suscríbete a servicios para ser notificado cuando haya disponibilidad.
            </p>
          </div>
        </div>

        <!-- ─── SECTION: Pending Claims (notified entries) ─── -->
        @if (notifiedEntries().length > 0) {
          <section class="space-y-3">
            <div class="flex items-center gap-2">
              <h2
                class="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide"
              >
                Plazas disponibles para ti
              </h2>
              <span
                class="px-2 py-0.5 text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full animate-pulse"
              >
                {{ notifiedEntries().length }}
              </span>
            </div>
            <p
              class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2"
            >
              <i class="fas fa-clock mr-1"></i>
              Tienes una ventana de tiempo limitada para reclamar estas plazas. ¡No tardes!
            </p>

            @for (item of notifiedEntries(); track item.entry.id) {
              <div
                class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-emerald-200 dark:border-emerald-800 p-5 space-y-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-start gap-3">
                    <div
                      class="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                      [style.backgroundColor]="item.service?.booking_color || '#6366f1'"
                    >
                      <i class="fas fa-calendar-check"></i>
                    </div>
                    <div>
                      <p class="font-semibold text-gray-900 dark:text-white">
                        {{ item.service?.name || 'Servicio' }}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {{ item.entry.start_time | date: 'EEEE, d MMM' : '' : 'es-ES' | titlecase }}
                        · {{ item.entry.start_time | date: 'HH:mm' }} -
                        {{ item.entry.end_time | date: 'HH:mm' }}
                      </p>
                    </div>
                  </div>
                  <span
                    class="px-2 py-1 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full flex-shrink-0"
                  >
                    ¡Plaza libre!
                  </span>
                </div>

                @if (item.claimError) {
                  <div
                    class="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-fadeIn"
                  >
                    <i class="fas fa-exclamation-circle text-red-500 text-sm flex-shrink-0"></i>
                    <p class="text-sm text-red-700 dark:text-red-300">{{ item.claimError }}</p>
                  </div>
                }

                <button
                  (click)="claimSpot(item)"
                  [disabled]="item.claiming || !!item.claimError"
                  class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-200 dark:shadow-none transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  @if (item.claiming) {
                    <div
                      class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                    ></div>
                    Reservando...
                  } @else if (item.claimError) {
                    <i class="fas fa-times-circle"></i>
                    No disponible
                  } @else {
                    <i class="fas fa-check-circle"></i>
                    Reclamar plaza
                  }
                </button>
              </div>
            }
          </section>
        }

        <!-- ─── SECTION: Passive subscriptions ─── -->
        @if (tenantPassiveModeEnabled()) {
          <section class="space-y-4">
            <div>
              <h2
                class="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1"
              >
                Notifícame cuando haya disponibilidad
              </h2>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Suscríbete a estos servicios y recibirás un aviso cuando se libere un hueco.
              </p>
            </div>

            @if (loadingServices()) {
              <div class="space-y-3">
                @for (i of [1, 2, 3]; track i) {
                  <div
                    class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0"
                      ></div>
                      <div class="flex-1 space-y-2">
                        <div class="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                        <div class="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-2/3"></div>
                      </div>
                      <div class="w-20 h-9 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
                    </div>
                  </div>
                }
              </div>
            } @else if (passiveServices().length === 0) {
              <div
                class="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center"
              >
                <div
                  class="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3"
                >
                  <i class="fas fa-bell-slash text-xl text-gray-400"></i>
                </div>
                <h3 class="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Sin servicios disponibles
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Actualmente no hay servicios con lista de espera pasiva habilitada.
                </p>
              </div>
            } @else {
              <div class="space-y-3">
                @for (item of passiveServices(); track item.service.id) {
                  <div
                    class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border transition-all"
                    [class]="
                      item.myEntry
                        ? 'border-violet-200 dark:border-violet-800'
                        : 'border-gray-200 dark:border-gray-700'
                    "
                  >
                    <div class="flex items-center gap-3 p-4">
                      <div
                        class="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                        [style.backgroundColor]="item.service.booking_color || '#6366f1'"
                      >
                        <i class="fas fa-concierge-bell text-sm"></i>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="font-semibold text-gray-900 dark:text-white truncate">
                          {{ item.service.name }}
                        </p>
                        @if (item.service.description) {
                          <p
                            class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5"
                          >{{ item.service.description | slice: 0 : 80 }}</p>
                        }
                      </div>
                      <div class="flex-shrink-0">
                        @if (item.myEntry) {
                          <button
                            (click)="leavePassive(item)"
                            [disabled]="item.joining"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-all disabled:opacity-50"
                          >
                            @if (item.joining) {
                              <div
                                class="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"
                              ></div>
                            } @else {
                              <i class="fas fa-bell text-violet-500"></i>
                              Suscrito
                            }
                          </button>
                        } @else {
                          <button
                            (click)="joinPassive(item)"
                            [disabled]="item.joining"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                          >
                            @if (item.joining) {
                              <div
                                class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"
                              ></div>
                            } @else {
                              <i class="fas fa-bell-plus"></i>
                              Notificarme
                            }
                          </button>
                        }
                      </div>
                    </div>

                    @if (item.myEntry) {
                      <div class="px-4 pb-3">
                        <div
                          class="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg px-3 py-2 border border-violet-100 dark:border-violet-800/50"
                        >
                          <i class="fas fa-check-circle text-violet-500 text-xs"></i>
                          <span class="text-xs text-violet-700 dark:text-violet-300">
                            Apuntado desde
                            {{ item.myEntry.created_at | date: 'd MMM' : '' : 'es-ES' }}. Te
                            avisaremos cuando haya disponibilidad.
                          </span>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </section>
        }
        <!-- end @if tenantPassiveModeEnabled -->

        <!-- ─── SECTION: My active waitlist entries ─── -->
        @if (activeEntries().length > 0) {
          <section class="space-y-3">
            <h2 class="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Mis turnos activos
            </h2>
            <div class="space-y-2">
              @for (item of activeEntries(); track item.entry.id) {
                <div
                  class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-3"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <i class="fas fa-hourglass-half text-amber-500 flex-shrink-0"></i>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {{ item.service?.name || item.entry.service_id }}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ item.entry.start_time | date: 'd MMM · HH:mm' : '' : 'es-ES' }}
                      </p>
                    </div>
                  </div>
                  <button
                    (click)="leaveActive(item.entry)"
                    class="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0 transition-colors"
                    title="Abandonar turno"
                  >
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
})
export class WaitlistSidebarComponent implements OnInit {
  private waitlistService = inject(SupabaseWaitlistService);
  private servicesService = inject(SupabaseServicesService);
  private settingsService = inject(SupabaseSettingsService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  loadingServices = signal(true);
  passiveServices = signal<PassiveService[]>([]);
  notifiedEntries = signal<NotifiedEntry[]>([]);
  activeEntries = signal<{ entry: WaitlistEntry; service: Service | null }[]>([]);
  /** Whether the tenant has passive mode enabled — gates the entire passive subscription UI */
  tenantPassiveModeEnabled = signal(true);

  private get userId(): string | undefined {
    return this.authService.userProfile?.id;
  }

  private get companyId(): string | undefined {
    return this.authService.currentCompanyId() ?? undefined;
  }

  ngOnInit() {
    this.loadAll();
  }

  private async loadAll() {
    this.loadingServices.set(true);
    try {
      await Promise.all([this.loadPassiveServices(), this.loadMyEntries()]);
    } finally {
      this.loadingServices.set(false);
    }
  }

  private async loadPassiveServices() {
    const cid = this.companyId;
    if (!cid) return;

    try {
      // Check tenant-level passive mode setting first
      const settings = await this.settingsService.getCompanySettings(cid).toPromise();
      const tenantPassive = settings?.waitlist_passive_mode ?? true;
      this.tenantPassiveModeEnabled.set(tenantPassive);

      if (!tenantPassive) {
        // Tenant has disabled passive mode — show no services
        this.passiveServices.set([]);
        return;
      }

      const allServices = await this.servicesService.getServices(cid);
      // Only show services with passive waitlist enabled at service level
      const passiveEnabled = allServices.filter((s) => s.enable_waitlist && s.passive_mode_enabled);

      const myEntries = await this.waitlistService.getWaitlistByClient(this.userId ?? '');
      const myPassiveByService = new Map<string, WaitlistEntry>();
      myEntries
        .filter((e) => e.mode === 'passive' && e.status === 'pending')
        .forEach((e) => myPassiveByService.set(e.service_id, e));

      this.passiveServices.set(
        passiveEnabled.map((svc) => ({
          service: svc,
          myEntry: myPassiveByService.get(svc.id) ?? null,
          joining: false,
        })),
      );
    } catch (err) {
      console.error('WaitlistSidebarComponent: error loading passive services:', err);
    }
  }

  private async loadMyEntries() {
    const uid = this.userId;
    if (!uid) return;

    try {
      const entries = await this.waitlistService.getWaitlistByClient(uid);

      // Notified entries: can claim a spot
      const notified = entries.filter((e) => e.status === 'notified');
      // Active entries: pending slot-specific waitlist
      const active = entries.filter((e) => e.status === 'pending' && e.mode === 'active');

      // Resolve service names for both active and notified entries
      const cid = this.companyId;
      if (cid) {
        const allServices = await this.servicesService.getServices(cid);
        const serviceMap = new Map(allServices.map((s) => [s.id, s]));

        // Active entries with service
        this.activeEntries.set(
          active.map((entry) => ({
            entry,
            service: serviceMap.get(entry.service_id) ?? null,
          })),
        );

        // Notified entries with service
        this.notifiedEntries.set(
          notified.map((entry) => ({
            entry,
            service: serviceMap.get(entry.service_id) ?? null,
            claiming: false,
            claimError: null,
          })),
        );
      } else {
        // Fallback if no company ID
        this.activeEntries.set(active.map((entry) => ({ entry, service: null })));
        this.notifiedEntries.set(
          notified.map((entry) => ({
            entry,
            service: null,
            claiming: false,
            claimError: null,
          })),
        );
      }
    } catch (err) {
      console.error('WaitlistSidebarComponent: error loading my entries:', err);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // T15: Claim flow with full RPC error handling
  // ────────────────────────────────────────────────────────────────────────────

  async claimSpot(item: NotifiedEntry): Promise<void> {
    this.updateNotified(item.entry.id, { claiming: true, claimError: null });

    try {
      const result: ClaimWaitlistResult = await this.waitlistService.claimSpot(item.entry.id);

      if ('booking_id' in result) {
        // Success: remove from notified list
        this.notifiedEntries.update((list) => list.filter((i) => i.entry.id !== item.entry.id));
        this.toast.success(
          '¡Reserva confirmada!',
          'Tu plaza ha sido reservada correctamente. Revisa tu email para los detalles.',
        );
      } else {
        // T15: map RPC error codes to user-facing messages
        const errorMsg = this.mapClaimError(result.error);
        this.updateNotified(item.entry.id, { claiming: false, claimError: errorMsg });

        if (result.error === 'spot_taken') {
          this.toast.error('Plaza ocupada', errorMsg);
        } else if (result.error === 'window_expired') {
          this.toast.error('Tiempo agotado', errorMsg);
          // Remove from list since the window expired
          setTimeout(() => {
            this.notifiedEntries.update((list) => list.filter((i) => i.entry.id !== item.entry.id));
          }, 3000);
        } else if (result.error === 'already_booked') {
          this.toast.error('Ya estás reservado', errorMsg);
        } else {
          this.toast.error('Error', errorMsg);
        }
      }
    } catch (err: any) {
      console.error('WaitlistSidebarComponent: claimSpot error:', err);
      const msg = err?.message ?? 'Error al reclamar la plaza. Intenta de nuevo.';
      this.updateNotified(item.entry.id, { claiming: false, claimError: msg });
      this.toast.error('Error', msg);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Passive subscription
  // ────────────────────────────────────────────────────────────────────────────

  async joinPassive(item: PassiveService): Promise<void> {
    const uid = this.userId;
    const cid = this.companyId;
    if (!uid || !cid) {
      this.toast.error('Sesión requerida', 'Debes iniciar sesión para suscribirte.');
      return;
    }

    this.updatePassive(item.service.id, { joining: true });

    try {
      const entry = await this.waitlistService.joinPassiveWaitlist({
        company_id: cid,
        client_id: uid,
        service_id: item.service.id,
      });

      this.updatePassive(item.service.id, { myEntry: entry, joining: false });
      this.toast.success(
        '¡Suscrito!',
        `Te avisaremos cuando haya disponibilidad para "${item.service.name}".`,
      );
    } catch (err: any) {
      console.error('WaitlistSidebarComponent: joinPassive error:', err);
      this.updatePassive(item.service.id, { joining: false });
      this.toast.error('Error', err?.message ?? 'No se pudo suscribir. Intenta de nuevo.');
    }
  }

  async leavePassive(item: PassiveService): Promise<void> {
    if (!item.myEntry) return;
    this.updatePassive(item.service.id, { joining: true });

    try {
      await this.waitlistService.leaveWaitlist(item.myEntry.id);
      this.updatePassive(item.service.id, { myEntry: null, joining: false });
      this.toast.success('Cancelado', `Has cancelado tu suscripción a "${item.service.name}".`);
    } catch (err: any) {
      console.error('WaitlistSidebarComponent: leavePassive error:', err);
      this.updatePassive(item.service.id, { joining: false });
      this.toast.error('Error', 'No se pudo cancelar la suscripción.');
    }
  }

  async leaveActive(entry: WaitlistEntry): Promise<void> {
    try {
      await this.waitlistService.leaveWaitlist(entry.id);
      this.activeEntries.update((list) => list.filter((item) => item.entry.id !== entry.id));
      this.toast.success('Cancelado', 'Has salido del turno de espera.');
    } catch (err: any) {
      this.toast.error('Error', 'No se pudo cancelar el turno.');
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // T15: User-friendly error messages for claim_waitlist_spot RPC errors
  // ────────────────────────────────────────────────────────────────────────────

  private location = inject(Location);

  goBack(): void {
    this.location.back();
  }

  private mapClaimError(code: string): string {
    switch (code) {
      case 'spot_taken':
        return 'Alguien reclamó la plaza justo antes que tú. Lo sentimos, intenta con otro horario.';
      case 'window_expired':
        return 'Tu ventana de reclamación ha caducado. La plaza se liberó para el siguiente en la lista.';
      case 'already_booked':
        return 'Ya tienes una reserva para este servicio en ese horario.';
      case 'client_not_found':
        return 'No se encontró tu perfil de cliente. Contacta con soporte.';
      case 'invalid_status':
        return 'Esta entrada de lista de espera ya no está disponible para reclamar.';
      default:
        return `Error al reservar: ${code}. Intenta de nuevo.`;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers to update signal arrays immutably
  // ────────────────────────────────────────────────────────────────────────────

  private updatePassive(serviceId: string, patch: Partial<PassiveService>): void {
    this.passiveServices.update((list) =>
      list.map((item) => (item.service.id === serviceId ? { ...item, ...patch } : item)),
    );
  }

  private updateNotified(entryId: string, patch: Partial<NotifiedEntry>): void {
    this.notifiedEntries.update((list) =>
      list.map((item) => (item.entry.id === entryId ? { ...item, ...patch } : item)),
    );
  }
}
