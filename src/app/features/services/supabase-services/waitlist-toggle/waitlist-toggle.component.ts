import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface WaitlistToggleState {
  enable_waitlist: boolean;
  active_mode_enabled: boolean;
  passive_mode_enabled: boolean;
}

/**
 * Standalone component: service-level waitlist toggles.
 *
 * Emitted whenever any toggle changes — parent should debounce and persist.
 *
 * Usage:
 *   <app-waitlist-toggle
 *     [state]="{ enable_waitlist, active_mode_enabled, passive_mode_enabled }"
 *     [saving]="savingWaitlist"
 *     (stateChange)="onWaitlistToggle($event)"
 *   ></app-waitlist-toggle>
 */
@Component({
  selector: 'app-waitlist-toggle',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-3">
      <!-- Enable waitlist -->
      <div
        class="flex items-start justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
      >
        <div class="flex items-start gap-2.5">
          <div
            class="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0 mt-0.5"
          >
            <i class="fas fa-user-clock text-xs"></i>
          </div>
          <div>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">Lista de espera</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
              Activa para permitir que los clientes se unan cuando el servicio está completo.
            </p>
          </div>
        </div>
        <label class="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
          <input
            type="checkbox"
            class="sr-only peer"
            [checked]="localState().enable_waitlist"
            (change)="toggle('enable_waitlist', $any($event.target).checked)"
            [disabled]="saving"
          />
          <div
            class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-violet-600 disabled:opacity-50"
          ></div>
        </label>
      </div>

      @if (localState().enable_waitlist) {
        <div
          class="ml-3 pl-3 border-l-2 border-violet-200 dark:border-violet-800 space-y-2 animate-fadeIn"
        >
          <!-- Active mode -->
          <div
            class="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800"
          >
            <div class="flex items-center gap-2">
              <i class="fas fa-bolt text-blue-500 text-xs w-3.5 text-center"></i>
              <div>
                <p class="text-xs font-medium text-gray-800 dark:text-gray-200">Modo Activo</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                  Reserva para un horario específico
                </p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                class="sr-only peer"
                [checked]="localState().active_mode_enabled"
                (change)="toggle('active_mode_enabled', $any($event.target).checked)"
                [disabled]="saving"
              />
              <div
                class="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500 disabled:opacity-50"
              ></div>
            </label>
          </div>

          <!-- Passive mode -->
          <div
            class="flex items-center justify-between p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800"
          >
            <div class="flex items-center gap-2">
              <i class="fas fa-bell text-purple-500 text-xs w-3.5 text-center"></i>
              <div>
                <p class="text-xs font-medium text-gray-800 dark:text-gray-200">Modo Pasivo</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                  Notificación cuando haya disponibilidad
                </p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                class="sr-only peer"
                [checked]="localState().passive_mode_enabled"
                (change)="toggle('passive_mode_enabled', $any($event.target).checked)"
                [disabled]="saving"
              />
              <div
                class="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-500 disabled:opacity-50"
              ></div>
            </label>
          </div>

          @if (!localState().active_mode_enabled && !localState().passive_mode_enabled) {
            <p
              class="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg px-3 py-2 animate-fadeIn"
            >
              <i class="fas fa-exclamation-triangle mr-1"></i>
              Activa al menos un modo para que la lista de espera funcione.
            </p>
          }
        </div>
      }
    </div>
  `,
})
export class WaitlistToggleComponent implements OnChanges {
  @Input() state: WaitlistToggleState = {
    enable_waitlist: false,
    active_mode_enabled: true,
    passive_mode_enabled: true,
  };
  @Input() saving = false;
  @Output() stateChange = new EventEmitter<WaitlistToggleState>();

  // Local reactive state to support optimistic updates
  localState = signal<WaitlistToggleState>({
    enable_waitlist: false,
    active_mode_enabled: true,
    passive_mode_enabled: true,
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['state'] && changes['state'].currentValue) {
      this.localState.set({ ...changes['state'].currentValue });
    }
  }

  toggle(key: keyof WaitlistToggleState, value: boolean): void {
    const updated = { ...this.localState(), [key]: value };
    this.localState.set(updated);
    this.stateChange.emit(updated);
  }
}
