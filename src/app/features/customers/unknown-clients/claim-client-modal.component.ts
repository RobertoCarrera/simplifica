import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { UnknownClientRow, UnknownClientsService } from '../../../services/unknown-clients.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

type Mode = 'merge' | 'convert';

interface MatchedClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

@Component({
  selector: 'app-claim-client-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-[100000] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'claim-title'"
        (click)="onBackdrop($event)">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Panel -->
        <div
          class="relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-gray-900 ring-1 ring-white/10 max-h-[90vh] flex flex-col"
          (click)="$event.stopPropagation()">

          <!-- Top accent bar (orange: this is about a warning state) -->
          <div class="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-500"></div>

          <!-- Header -->
          <div class="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <i class="fas fa-user-tag"></i>
              </div>
              <div class="flex-1 min-w-0">
                <h2 id="claim-title" class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ 'unknownClients.claimTitle' | transloco }}
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ 'unknownClients.claimSubtitle' | transloco }}
                </p>
              </div>
              <button
                type="button"
                (click)="close()"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 -mr-1 -mt-1 p-1">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="px-6 py-5 overflow-y-auto flex-1 space-y-5">

            <!-- Original Desconocido context -->
            <section class="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-2">
                {{ 'unknownClients.originalClient' | transloco }}
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{{ 'unknownClients.field.name' | transloco }}</span>
                  <span class="block font-medium text-gray-900 dark:text-white break-words">{{ unknown.name }}</span>
                </div>
                <div>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{{ 'unknownClients.field.email' | transloco }}</span>
                  <span class="block font-medium text-gray-900 dark:text-white break-words">{{ unknown.email || '—' }}</span>
                </div>
                <div>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{{ 'unknownClients.field.phone' | transloco }}</span>
                  <span class="block font-medium text-gray-900 dark:text-white">{{ unknown.phone || '—' }}</span>
                </div>
                <div>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">{{ 'unknownClients.field.source' | transloco }}</span>
                  <span class="block font-mono text-xs text-gray-700 dark:text-gray-300 break-all">{{ unknown.source || '—' }}</span>
                </div>
                @if (unknown.booking_start) {
                  <div class="sm:col-span-2">
                    <span class="block text-xs text-gray-500 dark:text-gray-400">{{ 'unknownClients.field.relatedBooking' | transloco }}</span>
                    <span class="block text-gray-900 dark:text-white">
                      {{ unknown.booking_start | date: 'short' : '' : currentLang() }}
                      <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        · {{ unknown.booking_status }} · {{ unknown.profesional || '—' }}
                      </span>
                    </span>
                  </div>
                }
              </div>
            </section>

            <!-- Mode toggle -->
            <section>
              <p class="text-sm font-medium text-gray-900 dark:text-white mb-2">
                {{ 'unknownClients.chooseMode' | transloco }}
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" (click)="setMode('merge')"
                  class="text-left rounded-xl border-2 p-3 transition-colors"
                  [class.border-blue-500]="mode() === 'merge'"
                  [class.bg-blue-50]="mode() === 'merge'"
                  [class.dark:bg-blue-900]="mode() === 'merge' && true"
                  [class.border-gray-200]="mode() !== 'merge'"
                  [class.dark:border-gray-700]="mode() !== 'merge'">
                  <div class="flex items-center gap-2 mb-1">
                    <i class="fas fa-compress-arrows-alt text-blue-600 dark:text-blue-400"></i>
                    <span class="font-medium text-gray-900 dark:text-white">{{ 'unknownClients.mode.merge' | transloco }}</span>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ 'unknownClients.mode.mergeDesc' | transloco }}
                  </p>
                </button>
                <button type="button" (click)="setMode('convert')"
                  class="text-left rounded-xl border-2 p-3 transition-colors"
                  [class.border-emerald-500]="mode() === 'convert'"
                  [class.bg-emerald-50]="mode() === 'convert'"
                  [class.dark:bg-emerald-900]="mode() === 'convert' && true"
                  [class.border-gray-200]="mode() !== 'convert'"
                  [class.dark:border-gray-700]="mode() !== 'convert'">
                  <div class="flex items-center gap-2 mb-1">
                    <i class="fas fa-user-plus text-emerald-600 dark:text-emerald-400"></i>
                    <span class="font-medium text-gray-900 dark:text-white">{{ 'unknownClients.mode.convert' | transloco }}</span>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ 'unknownClients.mode.convertDesc' | transloco }}
                  </p>
                </button>
              </div>
            </section>

            <!-- MERGE form -->
            @if (mode() === 'merge') {
              <section class="space-y-3">
                <label class="block text-sm font-medium text-gray-900 dark:text-white">
                  {{ 'unknownClients.merge.searchLabel' | transloco }}
                </label>
                <input
                  type="text"
                  [ngModel]="searchTerm()"
                  (ngModelChange)="onSearchChange($event)"
                  [placeholder]="'unknownClients.merge.searchPlaceholder' | transloco"
                  class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autocomplete="off">

                @if (searching()) {
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    <i class="fas fa-spinner fa-spin mr-1"></i> {{ 'unknownClients.merge.searching' | transloco }}
                  </p>
                }
                @if (!searching() && searched() && matches().length === 0) {
                  <p class="text-sm text-amber-700 dark:text-amber-300">
                    <i class="fas fa-info-circle mr-1"></i> {{ 'unknownClients.merge.noMatches' | transloco }}
                  </p>
                }
                @if (matches().length > 0) {
                  <ul class="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    @for (m of matches(); track m.id) {
                      <li>
                        <button type="button" (click)="selectMatch(m)"
                          class="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-start gap-3"
                          [class.bg-blue-50]="selected()?.id === m.id"
                          [class.dark:bg-blue-900]="selected()?.id === m.id && true">
                          <span class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                            {{ initialsOf(m.name) }}
                          </span>
                          <span class="flex-1 min-w-0">
                            <span class="block font-medium text-gray-900 dark:text-white truncate">{{ m.name }}</span>
                            <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">
                              {{ m.email || '—' }} · {{ m.phone || '—' }}
                            </span>
                          </span>
                          @if (selected()?.id === m.id) {
                            <i class="fas fa-check-circle text-blue-600 dark:text-blue-400 mt-1"></i>
                          }
                        </button>
                      </li>
                    }
                  </ul>
                }

                @if (selected(); as s) {
                  <div class="rounded-lg bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <span class="text-blue-900 dark:text-blue-100">
                      <i class="fas fa-check mr-1"></i>
                      {{ 'unknownClients.merge.selectedHint' | transloco }}
                      <span class="font-medium">{{ s.name }}</span>
                    </span>
                    <button type="button" (click)="selectMatch(s); clearSelection()" class="text-xs text-blue-700 dark:text-blue-300 hover:underline">
                      {{ 'common.cancel' | transloco }}
                    </button>
                  </div>
                }
              </section>
            }

            <!-- CONVERT form -->
            @if (mode() === 'convert') {
              <section class="space-y-3">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ 'unknownClients.convert.intro' | transloco }}
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label class="block">
                    <span class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'unknownClients.field.name' | transloco }}</span>
                    <input type="text" [(ngModel)]="convertName"
                      class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                  </label>
                  <label class="block">
                    <span class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'unknownClients.field.email' | transloco }}</span>
                    <input type="email" [(ngModel)]="convertEmail"
                      class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'unknownClients.field.phone' | transloco }}</span>
                    <input type="tel" [(ngModel)]="convertPhone"
                      class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                  </label>
                </div>
              </section>
            }

            <!-- Notes (shared) -->
            <section>
              <label class="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                {{ 'unknownClients.notes.label' | transloco }}
                <span class="text-xs font-normal text-gray-500 dark:text-gray-400">({{ 'common.optional' | transloco }})</span>
              </label>
              <textarea [(ngModel)]="notes" rows="2"
                [placeholder]="'unknownClients.notes.placeholder' | transloco"
                class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"></textarea>
            </section>

            @if (error()) {
              <div class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                <i class="fas fa-exclamation-triangle mr-1"></i> {{ error() }}
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60 flex items-center justify-end gap-2">
            <button type="button" (click)="close()"
              class="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              {{ 'common.cancel' | transloco }}
            </button>
            <button type="button" (click)="confirm()"
              [disabled]="!canConfirm() || submitting()"
              class="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              [class.bg-blue-600]="mode() === 'merge'"
              [class.hover:bg-blue-700]="mode() === 'merge'"
              [class.bg-emerald-600]="mode() === 'convert'"
              [class.hover:bg-emerald-700]="mode() === 'convert'">
              @if (submitting()) {
                <i class="fas fa-spinner fa-spin"></i>
              } @else {
                <i class="fas" [class.fa-compress-arrows-alt]="mode() === 'merge'" [class.fa-user-plus]="mode() === 'convert'"></i>
              }
              {{ (mode() === 'merge' ? 'unknownClients.actions.confirmMerge' : 'unknownClients.actions.confirmConvert') | transloco }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClaimClientModalComponent {
  private unknownClientsService = inject(UnknownClientsService);
  private authService = inject(AuthService);
  private translocoService = inject(TranslocoService);
  private toast = inject(ToastService);

  @Input({ required: true }) unknown!: UnknownClientRow;
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() claimed = new EventEmitter<{ mode: Mode; finalClientId: string }>();

  mode = signal<Mode>('merge');
  searchTerm = signal<string>('');
  matches = signal<MatchedClient[]>([]);
  selected = signal<MatchedClient | null>(null);
  searching = signal<boolean>(false);
  searched = signal<boolean>(false);
  submitting = signal<boolean>(false);
  error = signal<string | null>(null);

  convertName = '';
  convertEmail = '';
  convertPhone = '';
  notes = '';

  currentLang = computed(() => {
    return this.translocoService.getActiveLang() || 'es';
  });

  canConfirm = computed(() => {
    if (this.mode() === 'merge') {
      return !!this.selected();
    }
    return (
      this.convertName.trim().length > 0 ||
      this.convertEmail.trim().length > 0 ||
      this.convertPhone.trim().length > 0
    );
  });

  private searchToken = 0;

  constructor() {
    // Prefill convert form with the Desconocido's data on each open.
    effect(() => {
      if (this.open && this.unknown) {
        this.convertName = this.unknown.name || '';
        this.convertEmail = this.unknown.email || '';
        this.convertPhone = this.unknown.phone || '';
      }
    });
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    this.error.set(null);
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.selected.set(null);

    const token = ++this.searchToken;
    if (term.trim().length < 2) {
      this.matches.set([]);
      this.searched.set(false);
      return;
    }

    this.searching.set(true);
    // debounce lite
    setTimeout(async () => {
      if (token !== this.searchToken) return; // stale
      try {
        const results = await this.unknownClientsService.searchRealClients(
          term,
          this.unknown.client_id,
          10,
        );
        if (token !== this.searchToken) return;
        this.matches.set(results);
        this.searched.set(true);
      } catch {
        this.matches.set([]);
      } finally {
        if (token === this.searchToken) this.searching.set(false);
      }
    }, 200);
  }

  selectMatch(m: MatchedClient): void {
    this.selected.set(m);
  }

  clearSelection(): void {
    this.selected.set(null);
  }

  onBackdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  async confirm(): Promise<void> {
    if (!this.canConfirm() || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);

    try {
      const finalClientId = await this.unknownClientsService.claim({
        p_unknown_client_id: this.unknown.client_id,
        p_real_client_id: this.mode() === 'merge' ? this.selected()?.id ?? null : null,
        p_real_name: this.mode() === 'convert' ? this.convertName : null,
        p_real_email: this.mode() === 'convert' ? this.convertEmail : null,
        p_real_phone: this.mode() === 'convert' ? this.convertPhone : null,
        p_notes: this.notes || null,
      });

      this.toast.success(
        this.mode() === 'merge'
          ? this.translocoService.translate('unknownClients.toast.merged')
          : this.translocoService.translate('unknownClients.toast.converted'),
        '',
      );
      this.claimed.emit({ mode: this.mode(), finalClientId });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'unknownClients.toast.error' in (err as Record<string, unknown>)
            ? String((err as Record<string, unknown>)['error'])
            : String(err);
      this.error.set(message);
      this.toast.error(this.translocoService.translate('unknownClients.toast.error'), message);
    } finally {
      this.submitting.set(false);
    }
  }

  initialsOf(name: string): string {
    return (name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('');
  }
}