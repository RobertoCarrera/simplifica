import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  SupabaseWaitlistService,
  WaitlistEntry,
} from '../../../services/supabase-waitlist.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

/**
 * CTA button for fully-booked events (T12).
 *
 * Shows "Apuntarse a lista de espera" when:
 *   - The service has waitlist enabled
 *   - Active mode is allowed for this service
 *   - The slot is fully booked
 *
 * Handles the full join + leave flow.
 *
 * Usage:
 *   <app-waitlist-button
 *     [serviceId]="event.serviceId"
 *     [companyId]="event.companyId"
 *     [startTime]="event.start"
 *     [endTime]="event.end"
 *     [enableWaitlist]="service.enable_waitlist"
 *     [activeModeEnabled]="service.active_mode_enabled"
 *   ></app-waitlist-button>
 */
@Component({
  selector: 'app-waitlist-button',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (enableWaitlist && activeModeEnabled) {
      @if (!entry()) {
        <!-- Join waitlist -->
        <button
          (click)="joinWaitlist()"
          [disabled]="loading()"
          class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          [class]="
            loading()
              ? 'bg-violet-100 text-violet-400 dark:bg-violet-900/20 dark:text-violet-500'
              : 'bg-violet-600 hover:bg-violet-700 text-white dark:bg-violet-700 dark:hover:bg-violet-600 shadow-violet-200 dark:shadow-none'
          "
        >
          @if (loading()) {
            <div
              class="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"
            ></div>
            Apuntando...
          } @else {
            <i class="fas fa-user-plus"></i>
            Apuntarse a lista de espera
          }
        </button>
      } @else {
        <!-- Already on waitlist -->
        <div class="space-y-2">
          <div
            class="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800"
          >
            <i class="fas fa-check-circle text-violet-500 text-sm"></i>
            <span class="text-sm font-medium text-violet-700 dark:text-violet-300"
              >En lista de espera</span
            >
            <span class="ml-auto text-xs text-violet-500 dark:text-violet-400">
              #{{ entryPosition() }}
            </span>
          </div>
          <button
            (click)="leaveWaitlist()"
            [disabled]="loading()"
            class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 transition-all disabled:opacity-50"
          >
            @if (loading()) {
              <div
                class="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"
              ></div>
            } @else {
              <i class="fas fa-times"></i>
            }
            Cancelar mi reserva en lista
          </button>
        </div>
      }
    }
  `,
})
export class WaitlistButtonComponent {
  @Input() serviceId = '';
  @Input() companyId = '';
  @Input() startTime = '';
  @Input() endTime = '';
  @Input() enableWaitlist = false;
  @Input() activeModeEnabled = true;

  // Optional: pre-existing entry (set by parent if known)
  @Input() set existingEntry(val: WaitlistEntry | null) {
    this.entry.set(val);
  }
  @Output() joined = new EventEmitter<WaitlistEntry>();
  @Output() left = new EventEmitter<void>();

  private waitlistService = inject(SupabaseWaitlistService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  loading = signal(false);
  entry = signal<WaitlistEntry | null>(null);
  entryPosition = signal<number>(1);

  async joinWaitlist(): Promise<void> {
    if (!this.serviceId || !this.startTime || !this.endTime) {
      this.toast.error(this.toast.t('toast.error'), this.toast.t('toast.waitlist.faltanDatos'));
      return;
    }

    const userId = this.authService.userProfile?.id;
    if (!userId) {
      this.toast.error(
        this.toast.t('toast.waitlist.sesionRequerida'),
        this.toast.t('toast.waitlist.debesiniciarSesion'),
      );
      return;
    }

    this.loading.set(true);
    try {
      const newEntry = await this.waitlistService.addToWaitlist({
        company_id: this.companyId,
        client_id: userId,
        service_id: this.serviceId,
        start_time: this.startTime,
        end_time: this.endTime,
        mode: 'active',
      });

      this.entry.set(newEntry);
      this.toast.success(
        this.toast.t('toast.waitlist.apuntado'),
        this.toast.t('toast.waitlist.unisteALista'),
      );
      this.joined.emit(newEntry);
    } catch (err: any) {
      console.error('WaitlistButtonComponent: joinWaitlist error:', err);
      const msg = err?.message ?? 'No se pudo unir a la lista. Intenta de nuevo.';
      this.toast.error(this.toast.t('toast.error'), msg);
    } finally {
      this.loading.set(false);
    }
  }

  async leaveWaitlist(): Promise<void> {
    const current = this.entry();
    if (!current) return;

    this.loading.set(true);
    try {
      await this.waitlistService.leaveWaitlist(current.id);
      this.entry.set(null);
      this.toast.success(this.toast.t('toast.waitlist.cancelado'), this.toast.t('toast.waitlist.hasSalidoLista'));
      this.left.emit();
    } catch (err: any) {
      console.error('WaitlistButtonComponent: leaveWaitlist error:', err);
      this.toast.error(this.toast.t('toast.error'), this.toast.t('toast.waitlist.errorCancelar'));
    } finally {
      this.loading.set(false);
    }
  }
}
