import {
  Component,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';
import {
  UnknownClientRow,
  UnknownClientsService,
} from '../../../services/unknown-clients.service';
import { ClaimClientModalComponent } from './claim-client-modal.component';

type StatusFilter = 'pending' | 'merged' | 'converted' | 'archived';

@Component({
  selector: 'app-unknown-clients-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DatePipe,
    TranslocoPipe,
    ConfirmModalComponent,
    ClaimClientModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-gray-50 dark:bg-gray-900 min-h-full">
      <div class="container mx-auto px-4 py-6 max-w-6xl space-y-6">

        <!-- Header -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-user-tag"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">
              {{ 'unknownClients.title' | transloco }}
            </h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ 'unknownClients.subtitle' | transloco }}
            </p>
          </div>
          <button
            type="button"
            (click)="reload()"
            [disabled]="loading()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                   bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                   text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
            <i class="fas" [class.fa-spinner]="loading()" [class.fa-spin]="loading()" [class.fa-sync-alt]="!loading()"></i>
            <span class="hidden sm:inline">{{ 'common.refresh' | transloco }}</span>
          </button>
        </div>

        <!-- Filter pills -->
        <div class="flex flex-wrap items-center gap-2">
          @for (p of pills; track p.id) {
            <button
              type="button"
              (click)="activePill.set(p.id)"
              [attr.aria-pressed]="activePill() === p.id"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border"
              [class.bg-amber-100]="activePill() === p.id"
              [class.border-amber-300]="activePill() === p.id"
              [class.text-amber-800]="activePill() === p.id"
              [class.dark:bg-amber-900]="activePill() === p.id"
              [class.dark:text-amber-100]="activePill() === p.id"
              [class.bg-white]="activePill() !== p.id"
              [class.border-gray-200]="activePill() !== p.id"
              [class.text-gray-700]="activePill() !== p.id"
              [class.dark:bg-gray-800]="activePill() !== p.id"
              [class.dark:border-gray-700]="activePill() !== p.id"
              [class.dark:text-gray-300]="activePill() !== p.id">
              <i class="fas" [class]="p.icon"></i>
              {{ p.labelKey | transloco }}
              <span class="text-xs opacity-70">({{ countFor(p.id) }})</span>
            </button>
          }
        </div>

        <!-- Empty / loading / table -->
        @if (loading() && rows().length === 0) {
          <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
            <i class="fas fa-spinner fa-spin mr-1"></i> {{ 'common.loading' | transloco }}
          </div>
        } @else if (filteredRows().length === 0) {
          <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-10 text-center">
            <div class="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-3">
              <i class="fas fa-check-circle text-2xl"></i>
            </div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">
              {{ 'unknownClients.empty.title' | transloco }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ 'unknownClients.empty.subtitle' | transloco }}
            </p>
          </div>
        } @else {
          <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                <thead class="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <tr>
                    <th class="px-4 py-3 text-left font-medium">{{ 'unknownClients.table.client' | transloco }}</th>
                    <th class="px-4 py-3 text-left font-medium">{{ 'unknownClients.table.contact' | transloco }}</th>
                    <th class="px-4 py-3 text-left font-medium">{{ 'unknownClients.table.professional' | transloco }}</th>
                    <th class="px-4 py-3 text-left font-medium">{{ 'unknownClients.table.booking' | transloco }}</th>
                    <th class="px-4 py-3 text-left font-medium">{{ 'unknownClients.table.days' | transloco }}</th>
                    <th class="px-4 py-3 text-left font-medium">{{ 'unknownClients.table.status' | transloco }}</th>
                    <th class="px-4 py-3 text-right font-medium">{{ 'unknownClients.table.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                  @for (row of filteredRows(); track row.client_id) {
                    <tr class="hover:bg-gray-50/60 dark:hover:bg-gray-900/30 transition-colors">
                      <td class="px-4 py-3 align-top">
                        <div class="flex items-center gap-2.5">
                          <span class="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {{ initialsOf(row.name) }}
                          </span>
                          <div class="min-w-0">
                            <div class="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                              {{ row.name }}
                            </div>
                            <div class="text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
                              {{ row.source || '—' }}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 align-top">
                        <div class="text-gray-900 dark:text-white">{{ row.email || '—' }}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">{{ row.phone || '—' }}</div>
                      </td>
                      <td class="px-4 py-3 align-top text-gray-900 dark:text-white">
                        {{ row.profesional || '—' }}
                      </td>
                      <td class="px-4 py-3 align-top">
                        @if (row.booking_start) {
                          <div class="text-gray-900 dark:text-white">
                            {{ row.booking_start | date: 'short' : '' : currentLang() }}
                          </div>
                          <div class="text-xs text-gray-500 dark:text-gray-400">
                            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                              [ngClass]="bookingStatusClass(row.booking_status)">
                              {{ row.booking_status || '—' }}
                            </span>
                          </div>
                        } @else {
                          <span class="text-gray-400 dark:text-gray-500 text-xs">—</span>
                        }
                      </td>
                      <td class="px-4 py-3 align-top whitespace-nowrap">
                        @if (row.dias_sin_reclamar > 30) {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                            <i class="fas fa-exclamation-circle"></i>
                            {{ row.dias_sin_reclamar }}d
                          </span>
                        } @else if (row.dias_sin_reclamar > 14) {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                            {{ row.dias_sin_reclamar }}d
                          </span>
                        } @else {
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {{ row.dias_sin_reclamar }}d
                          </span>
                        }
                      </td>
                      <td class="px-4 py-3 align-top">
                        @if (statusOf(row) === 'pending') {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                            <i class="fas fa-clock"></i>
                            {{ 'unknownClients.status.pending' | transloco }}
                          </span>
                        } @else if (statusOf(row) === 'archived') {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            <i class="fas fa-archive"></i>
                            {{ 'unknownClients.status.archived' | transloco }}
                          </span>
                        } @else if (statusOf(row) === 'merged') {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
                            <i class="fas fa-compress-arrows-alt"></i>
                            {{ 'unknownClients.status.merged' | transloco }}
                          </span>
                        } @else {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200">
                            <i class="fas fa-user-plus"></i>
                            {{ 'unknownClients.status.converted' | transloco }}
                          </span>
                        }
                      </td>
                      <td class="px-4 py-3 align-top text-right whitespace-nowrap">
                        @if (statusOf(row) === 'pending') {
                          <button type="button" (click)="openClaim(row)"
                            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors">
                            <i class="fas fa-hand-pointer"></i>
                            {{ 'unknownClients.actions.claim' | transloco }}
                          </button>
                          <button type="button" (click)="askMarkLost(row)"
                            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ml-1">
                            <i class="fas fa-times-circle"></i>
                            {{ 'unknownClients.actions.markLost' | transloco }}
                          </button>
                        } @else {
                          <span class="text-xs text-gray-400 dark:text-gray-500 italic">
                            {{ 'unknownClients.actions.done' | transloco }}
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- Claim modal -->
        @if (claimTarget()) {
          <app-claim-client-modal
            [unknown]="claimTarget()!"
            [open]="!!claimTarget()"
            (closed)="claimTarget.set(null); reload()"
            (claimed)="onClaimed($event)">
          </app-claim-client-modal>
        }

        <!-- Mark-lost confirm (imperative via ConfirmModalComponent.open()) -->
        <app-confirm-modal></app-confirm-modal>
      </div>
    </div>
  `,
})
export class UnknownClientsListComponent implements OnInit {
  private unknownClientsService = inject(UnknownClientsService);
  private authService = inject(AuthService);
  private translocoService = inject(TranslocoService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  loading = signal<boolean>(true);
  rows = signal<UnknownClientRow[]>([]);
  activePill = signal<'all' | StatusFilter>('pending');

  claimTarget = signal<UnknownClientRow | null>(null);
  markLostTarget = signal<UnknownClientRow | null>(null);

  @ViewChild(ConfirmModalComponent) markLostModal?: ConfirmModalComponent;

  currentLang = computed(() => {
    return this.translocoService.getActiveLang() || 'es';
  });

  pills = [
    {
      id: 'pending' as const,
      icon: 'fa-clock',
      labelKey: 'unknownClients.pills.pending',
    },
    {
      id: 'merged' as const,
      icon: 'fa-compress-arrows-alt',
      labelKey: 'unknownClients.pills.merged',
    },
    {
      id: 'converted' as const,
      icon: 'fa-user-plus',
      labelKey: 'unknownClients.pills.converted',
    },
    {
      id: 'archived' as const,
      icon: 'fa-archive',
      labelKey: 'unknownClients.pills.archived',
    },
    {
      id: 'all' as const,
      icon: 'fa-list',
      labelKey: 'unknownClients.pills.all',
    },
  ];

  // We attach a "count" function to each pill so the template can render
  // the per-pill total. Computed from rows() — re-derives on change.
  // Pills are static so we keep counts via a getter helper used by the template.
  countsByFilter = computed(() => {
    const all = this.rows();
    return {
      all: all.length,
      pending: all.filter((r) => this.statusOf(r) === 'pending').length,
      merged: all.filter((r) => this.statusOf(r) === 'merged').length,
      converted: all.filter((r) => this.statusOf(r) === 'converted').length,
      archived: all.filter((r) => this.statusOf(r) === 'archived').length,
    };
  });

  filteredRows = computed(() => {
    const all = this.rows();
    const f = this.activePill();
    if (f === 'all') return all;
    return all.filter((r) => this.statusOf(r) === f);
  });

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const companyId = this.authService.companyId();
      const data = await this.unknownClientsService.listPending(companyId);
      this.rows.set(data);
    } catch (err) {
      console.error('UnknownClientsList.reload', err);
      this.toast.error(this.translocoService.translate('unknownClients.toast.loadError'), '');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  countFor(id: 'all' | StatusFilter): number {
    const c = this.countsByFilter();
    return c[id];
  }

  statusOf(row: UnknownClientRow): StatusFilter {
    // Rows with deleted_at are filtered out by the view, but defensively
    // handle archived metadata too.
    if (row.archived_at) return 'archived';
    if (row.claimed_at && row.merged_with_client_id) return 'merged';
    if (row.claimed_at) return 'converted';
    return 'pending';
  }

  bookingStatusClass(status: string | null): string {
    switch (status) {
      case 'confirmed':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
      case 'pending':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      case 'completed':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'cancelled':
      case 'no_show':
      case 'anulada':
      case 'anulado':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
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

  openClaim(row: UnknownClientRow): void {
    this.claimTarget.set(row);
  }

  askMarkLost(row: UnknownClientRow): void {
    this.markLostTarget.set(row);
    if (!this.markLostModal) return;
    void this.markLostModal
      .open({
        title: this.translocoService.translate('unknownClients.markLost.title'),
        message: this.translocoService.translate('unknownClients.markLost.message'),
        confirmText: this.translocoService.translate('unknownClients.markLost.confirm'),
        cancelText: this.translocoService.translate('common.cancel'),
        icon: 'fa-archive',
        iconColor: 'amber',
      })
      .then((confirmed) => {
        if (confirmed) {
          void this.confirmMarkLost();
        } else {
          this.markLostTarget.set(null);
        }
      });
  }

  async confirmMarkLost(): Promise<void> {
    const target = this.markLostTarget();
    if (!target) return;
    // For now: re-use the RPC in convert mode with the existing data + an
    // archived note. This keeps the record and avoids data loss.
    try {
      await this.unknownClientsService.claim({
        p_unknown_client_id: target.client_id,
        p_real_name: target.name,
        p_real_email: target.email,
        p_real_phone: target.phone,
        p_notes: 'marked_lost: ' + (target.source || 'unknown'),
      });
      this.toast.success(this.translocoService.translate('unknownClients.toast.markedLost'), '');
      this.markLostTarget.set(null);
      void this.reload();
    } catch (err) {
      console.error('confirmMarkLost', err);
      this.toast.error(this.translocoService.translate('unknownClients.toast.error'), '');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClaimed(_result: { mode: 'merge' | 'convert'; finalClientId: string }): void {
    this.claimTarget.set(null);
    void this.reload();
  }
}