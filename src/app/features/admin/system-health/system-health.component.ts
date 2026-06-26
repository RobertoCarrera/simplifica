import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { environment } from '../../../../environments/environment';

type CheckStatus = 'ok' | 'degraded' | 'down' | 'pending';

interface CheckResult {
  status: CheckStatus;
  latency_ms: number;
  detail?: string;
}

interface HealthPayload {
  function: string;
  timestamp: string;
  overall: 'ok' | 'degraded' | 'down';
  checks: {
    database: CheckResult;
    postgrest: CheckResult;
    auth_gateway: CheckResult;
    edge_function: CheckResult;
  };
}

/**
 * One row of the global kill-switch matrix.
 * Each entry corresponds to a boolean column on public.system_settings,
 * read at the top of its target EF. Toggling is independent per switch.
 */
interface KillSwitch {
  /** Stable id used in templates and persistence. */
  key: 'process_reminders' | 'notify_inactive_clients' | 'marketing_automation' | 'budget_reminders';
  /** Column name on public.system_settings holding the paused flag. */
  flag: string;
  /** Column name holding the paused_at timestamp. */
  pausedAtCol: string;
  /** Column name holding the paused_by user uuid. */
  pausedByCol: string;
  /** Spanish title shown on the card. */
  label: string;
  /** Multi-line description (qué, cuándo, a quién) — preserves whitespace. */
  description: string;
  paused: boolean;
  pausedAt: Date | null;
  pausedBy: string | null;
  loading: boolean;
  saving: boolean;
}

@Component({
  selector: 'app-system-health',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-1">
        <h1 class="text-2xl font-semibold">
          <i class="fas fa-heart-pulse text-blue-600 mr-2"></i>
          Estado del sistema
        </h1>
        <button
          (click)="refresh()"
          [disabled]="loading()"
          class="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          <i class="fas fa-rotate mr-1"></i>
          Refrescar
        </button>
      </div>
      <p class="text-sm text-gray-500 mb-6">
        Monitor de salud del backend. Solo super_admin. Polling cada 30s.
      </p>

      <!-- Overall status banner -->
      <div
        class="rounded-lg p-4 mb-6 border-l-4 flex items-center justify-between"
        [ngClass]="bannerClasses()"
      >
        <div class="flex items-center gap-3">
          <i class="text-3xl" [ngClass]="bannerIcon()"></i>
          <div>
            <div class="font-semibold text-lg">{{ bannerTitle() }}</div>
            <div class="text-sm opacity-90">
              Última comprobación: {{ lastChecked() | date: 'medium' }}
            </div>
          </div>
        </div>
        @if (lastPayload(); as p) {
          <div class="text-sm opacity-75 text-right">
            <div>{{ p.checks.database.latency_ms }}ms DB</div>
            <div>{{ p.checks.postgrest.latency_ms }}ms API</div>
          </div>
        }
      </div>

      <!-- Individual checks -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        @for (check of checkCards(); track check.key) {
          <div class="bg-white border rounded-lg p-4 shadow-sm">
            <div class="flex items-start justify-between mb-2">
              <div>
                <h3 class="font-semibold flex items-center gap-2">
                  <i [ngClass]="check.icon" [style.color]="check.iconColor"></i>
                  {{ check.label }}
                </h3>
                <p class="text-xs text-gray-500">{{ check.description }}</p>
              </div>
              <span
                class="px-2 py-1 rounded-full text-xs font-medium"
                [ngClass]="check.badgeClasses"
              >
                {{ check.statusLabel }}
              </span>
            </div>
            <div class="text-sm text-gray-600 mt-3">
              <span class="font-mono">{{ check.latencyMs }}ms</span>
              @if (check.detail) {
                <div class="text-xs text-red-600 mt-1 break-all">
                  {{ check.detail }}
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Global controls (kill switches) -->
      <div class="mt-6 bg-white border rounded-lg shadow-sm">
        <div class="px-4 py-3 border-b flex items-center justify-between">
          <h2 class="font-semibold flex items-center gap-2">
            <i class="fas fa-sliders text-blue-600"></i>
            Controles Globales (kill switches)
          </h2>
          <span class="text-xs text-gray-500">
            3 interruptores independientes · solo super_admin
          </span>
        </div>

        <div class="divide-y">
          @for (ks of killSwitches(); track ks.key) {
            <div class="p-4 flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm">{{ ks.label }}</div>
                <!-- Multi-line description with whitespace preserved.
                     CSS: whitespace-pre-line + break-words so bullets & newlines render,
                     long URLs wrap without overflowing the card. -->
                <p
                  class="text-xs text-gray-600 mt-1 whitespace-pre-line break-words"
                >{{ ks.description }}</p>

                @if (ks.loading) {
                  <div class="mt-2 text-xs text-gray-500">
                    <i class="fas fa-spinner fa-spin mr-1"></i>
                    Cargando estado...
                  </div>
                } @else if (ks.paused) {
                  <div class="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 inline-block">
                    <i class="fas fa-circle-info mr-1"></i>
                    Pausado
                    @if (ks.pausedAt; as at) {
                      el {{ at | date: 'short' }}
                    }
                    @if (ks.pausedBy; as by) {
                      por
                      @if (by === currentUserId()) {
                        ti
                      } @else {
                        otro super_admin ({{ shortId(by) }})
                      }
                    }
                  </div>
                } @else {
                  <div class="mt-2 text-xs text-green-700">
                    <i class="fas fa-circle-check mr-1"></i>
                    Activo: el cron envía emails con normalidad.
                  </div>
                }
              </div>

              <label class="inline-flex items-center cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  [checked]="ks.paused"
                  [disabled]="ks.loading || ks.saving || readOnly()"
                  (change)="onToggleKillSwitch(ks, $event)"
                />
                <div
                  class="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-orange-500
                         peer-disabled:opacity-50 relative transition-colors
                         after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                         after:bg-white after:border after:rounded-full after:h-5 after:w-5
                         after:transition-transform peer-checked:after:translate-x-5"
                ></div>
              </label>
            </div>
          }
        </div>

        @if (readOnly()) {
          <div class="px-4 py-2 bg-gray-50 border-t text-xs text-gray-600">
            <i class="fas fa-info-circle mr-1"></i>
            Modo lectura: no tienes permisos para modificar los kill switches
            (o no se pudo leer el estado por RLS).
          </div>
        }
      </div>

      <!-- Help text -->
      <div class="mt-6 p-4 bg-gray-50 border rounded text-sm text-gray-600">
        <p class="mb-2">
          <i class="fas fa-info-circle mr-1"></i>
          <strong>¿Qué hace cada check?</strong>
        </p>
        <ul class="list-disc ml-6 space-y-1 text-xs">
          <li><strong>Base de datos:</strong> query directa via PostgREST — detecta DB caída aunque el gateway responda.</li>
          <li><strong>API REST:</strong> query ligera, mide latencia de PostgREST.</li>
          <li><strong>Auth Gateway:</strong> ping a <code>/auth/v1/health</code> — endpoint oficial de Supabase.</li>
          <li><strong>Edge Functions:</strong> OPTIONS preflight a una EF crítica — mide cold-start y latencia de red.</li>
        </ul>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class SystemHealthComponent implements OnInit, OnDestroy {
  private toastService = inject(ToastService);
  private authService = inject(AuthService);
  private simpleSupabase = inject(SimpleSupabaseService);

  loading = signal(false);
  lastPayload = signal<HealthPayload | null>(null);
  lastChecked = signal<Date | null>(null);
  errorMessage = signal<string | null>(null);

  /**
   * Set to true when the initial read of system_settings returned 0 rows
   * (most likely RLS rejection for non-super_admin callers). In that mode
   * the toggles stay disabled and we surface a banner.
   */
  readOnly = signal(false);

  /**
   * Three independent kill switches. Loaded from system_settings in one query
   * (we select all 9 columns together to avoid 3 round-trips). Each entry is
   * mutated in-place when the user toggles it.
   */
  killSwitches = signal<KillSwitch[]>([
    {
      key: 'process_reminders',
      flag: 'process_reminders_paused',
      pausedAtCol: 'process_reminders_paused_at',
      pausedByCol: 'process_reminders_paused_by',
      label: 'Recordatorios a clientes (24h / 1h / reseña)',
      description:
        'Pausa el envío de emails automáticos a clientes sobre sus citas:\n' +
        '- Recordatorio 24h antes de la cita\n' +
        '- Recordatorio 1h antes de la cita\n' +
        '- Petición de reseña 2h después\n' +
        '\n' +
        'Cuándo corre: cada hora (cron: 0 * * * *)\n' +
        'A quién: al cliente de cada reserva (booking.client.email)\n' +
        'Histórico: estuvo roto del 2026-03-29 al 2026-06-23 (referencia a clients.full_name que ya no existía). No se reenvían los perdidos.',
      paused: false,
      pausedAt: null,
      pausedBy: null,
      loading: true,
      saving: false,
    },
    {
      key: 'notify_inactive_clients',
      flag: 'notify_inactive_clients_paused',
      pausedAtCol: 'notify_inactive_clients_paused_at',
      pausedByCol: 'notify_inactive_clients_paused_by',
      label: 'Reactivación de clientes inactivos',
      description:
        'Pausa los emails de "te echamos de menos" a clientes que llevan tiempo sin reservar.\n' +
        '\n' +
        'Cuándo corre: cada día a las 02:30 (cron: 30 2 * * *)\n' +
        'A quién: clientes sin reservas recientes (frecuencia configurable por empresa)',
      paused: false,
      pausedAt: null,
      pausedBy: null,
      loading: true,
      saving: false,
    },
    {
      key: 'marketing_automation',
      flag: 'marketing_automation_paused',
      pausedAtCol: 'marketing_automation_paused_at',
      pausedByCol: 'marketing_automation_paused_by',
      label: 'Automatizaciones de marketing',
      description:
        'Pausa las campañas de marketing, secuencias de follow-up y nutrición de leads.\n' +
        '\n' +
        'Cuándo corre: cada día a las 09:30 (cron: 30 9 * * *)\n' +
        'A quién: leads y clientes según las reglas de marketing configuradas por empresa',
      paused: false,
      pausedAt: null,
      pausedBy: null,
      loading: true,
      saving: false,
    },
    {
      key: 'budget_reminders',
      flag: 'budget_reminders_paused',
      pausedAtCol: 'budget_reminders_paused_at',
      pausedByCol: 'budget_reminders_paused_by',
      label: 'Recordatorios de presupuestos a clientes',
      description:
        'Pausa los emails de presupuestos recurrentes próximos a vencer y los emails directos al crear o vencer un presupuesto.\n' +
        '\n' +
        'Cuándo corre: send-budget-reminders diario 09:00; send-budget-notification en trigger\n' +
        'A quién: clientes con presupuesto recurrente (recurring_budgets)',
      paused: false,
      pausedAt: null,
      pausedBy: null,
      loading: true,
      saving: false,
    },
  ]);

  currentUserId = computed<string | null>(
    () => this.authService.userProfileSignal()?.auth_user_id ?? null,
  );

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL_MS = 30_000;

  overallStatus = computed<CheckStatus>(() => this.lastPayload()?.overall ?? 'pending');

  bannerClasses = computed(() => {
    const status = this.overallStatus();
    switch (status) {
      case 'ok':
        return 'bg-green-50 border-green-500 text-green-900';
      case 'degraded':
        return 'bg-yellow-50 border-yellow-500 text-yellow-900';
      case 'down':
        return 'bg-red-50 border-red-500 text-red-900';
      default:
        return 'bg-gray-50 border-gray-300 text-gray-700';
    }
  });

  bannerIcon = computed(() => {
    const status = this.overallStatus();
    switch (status) {
      case 'ok':
        return 'fas fa-circle-check text-green-600';
      case 'degraded':
        return 'fas fa-triangle-exclamation text-yellow-600';
      case 'down':
        return 'fas fa-circle-xmark text-red-600';
      default:
        return 'fas fa-spinner fa-spin text-gray-400';
    }
  });

  bannerTitle = computed(() => {
    const status = this.overallStatus();
    if (status === 'ok') return 'Operativo';
    if (status === 'degraded') return 'Degradado';
    if (status === 'down') return 'Caído';
    return 'Comprobando...';
  });

  checkCards = computed(() => {
    const p = this.lastPayload();
    if (!p) return [];
    const map: Array<{
      key: keyof HealthPayload['checks'];
      label: string;
      description: string;
      icon: string;
      iconColor: string;
    }> = [
      {
        key: 'database',
        label: 'Base de datos',
        description: 'Postgres directo via PostgREST',
        icon: 'fas fa-database',
        iconColor: '#2563eb',
      },
      {
        key: 'postgrest',
        label: 'API REST',
        description: 'PostgREST query ligera',
        icon: 'fas fa-cloud',
        iconColor: '#0891b2',
      },
      {
        key: 'auth_gateway',
        label: 'Auth Gateway',
        description: 'Endpoint /auth/v1/health',
        icon: 'fas fa-lock',
        iconColor: '#7c3aed',
      },
      {
        key: 'edge_function',
        label: 'Edge Functions',
        description: 'Latencia de EF crítica',
        icon: 'fas fa-bolt',
        iconColor: '#ea580c',
      },
    ];
    return map.map((m) => this.toCard(m.key, m.label, m.description, m.icon, m.iconColor, p));
  });

  ngOnInit() {
    this.refresh();
    this.loadKillSwitches();
    this.pollHandle = setInterval(() => this.refresh(), this.POLL_INTERVAL_MS);
  }

  ngOnDestroy() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  async refresh() {
    if (this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const session = await this.authService.client.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        this.errorMessage.set('No hay sesión activa');
        return;
      }

      const url = `${environment.edgeFunctionsBaseUrl}/health-check`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabase.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        this.errorMessage.set(`HTTP ${response.status}: ${await response.text()}`);
        return;
      }

      const payload = (await response.json()) as HealthPayload;
      this.lastPayload.set(payload);
      this.lastChecked.set(new Date());
    } catch (e) {
      this.errorMessage.set(e instanceof Error ? e.message : String(e));
      this.toastService.error('Health check', 'Error al consultar estado del sistema');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load all 3 kill switches in a single query (9 columns at once).
   * RLS enforces super_admin only — non-super_admin callers get [] (not an
   * error). When that happens we flip into read-only mode and surface a
   * banner so the user understands why they can't toggle.
   */
  async loadKillSwitches() {
    const ksList = this.killSwitches();
    for (const ks of ksList) ks.loading = true;
    this.killSwitches.set([...ksList]);

    try {
      const { data, error } = await this.simpleSupabase
        .getClient()
        .from('system_settings')
        // One row trip — select all 9 columns at once.
        .select(
          [
            'process_reminders_paused',
            'process_reminders_paused_at',
            'process_reminders_paused_by',
            'notify_inactive_clients_paused',
            'notify_inactive_clients_paused_at',
            'notify_inactive_clients_paused_by',
            'marketing_automation_paused',
            'marketing_automation_paused_at',
            'marketing_automation_paused_by',
            'budget_reminders_paused',
            'budget_reminders_paused_at',
            'budget_reminders_paused_by',
          ].join(', '),
        )
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // No row returned: most likely not super_admin (RLS) or row not seeded.
        this.readOnly.set(true);
        this.toastService.error(
          'Kill switches',
          'No se pudo leer el estado (¿eres super_admin?). Modo lectura activo.',
        );
        for (const ks of ksList) {
          ks.paused = false;
          ks.pausedAt = null;
          ks.pausedBy = null;
          ks.loading = false;
        }
      } else {
        const row = data as unknown as Record<string, unknown>;
        for (const ks of ksList) {
          ks.paused = !!row[ks.flag];
          const at = row[ks.pausedAtCol];
          const by = row[ks.pausedByCol];
          ks.pausedAt = at ? new Date(at as string) : null;
          ks.pausedBy = (by as string | null) ?? null;
          ks.loading = false;
        }
      }
    } catch (e: any) {
      // Network error / etc. — surface a toast but keep the UI usable.
      this.toastService.error(
        'Kill switches',
        e?.message ?? 'Error al leer el estado de los kill switches.',
      );
      for (const ks of ksList) {
        ks.loading = false;
      }
    } finally {
      this.killSwitches.set([...ksList]);
    }
  }

  /**
   * Handle user toggling a kill switch.
   * Optimistic update + rollback on failure. Independent per-switch so
   * toggling one doesn't lock the others.
   */
  async onToggleKillSwitch(ks: KillSwitch, event: Event) {
    const input = event.target as HTMLInputElement;
    const desired = input.checked;

    if (ks.saving || this.readOnly()) return;

    const previousPaused = ks.paused;
    const previousAt = ks.pausedAt;
    const previousBy = ks.pausedBy;

    ks.saving = true;
    ks.paused = desired;
    if (desired) {
      ks.pausedAt = new Date();
      ks.pausedBy = this.currentUserId();
    } else {
      ks.pausedAt = null;
      ks.pausedBy = null;
    }
    this.killSwitches.set([...this.killSwitches()]);

    try {
      const patch: Record<string, unknown> = {};
      if (desired) {
        patch[ks.flag] = true;
        patch[ks.pausedAtCol] = ks.pausedAt!.toISOString();
        const uid = this.currentUserId();
        if (uid) patch[ks.pausedByCol] = uid;
      } else {
        patch[ks.flag] = false;
        patch[ks.pausedAtCol] = null;
        patch[ks.pausedByCol] = null;
      }

      const { data, error } = await this.simpleSupabase
        .getClient()
        .from('system_settings')
        .update(patch)
        .eq('id', 1)
        .select(
          [
            ks.flag,
            ks.pausedAtCol,
            ks.pausedByCol,
          ].join(', '),
        )
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const row = data as unknown as Record<string, unknown>;
        ks.paused = !!row[ks.flag];
        const at = row[ks.pausedAtCol];
        const by = row[ks.pausedByCol];
        ks.pausedAt = at ? new Date(at as string) : null;
        ks.pausedBy = (by as string | null) ?? null;
        this.toastService.success(
          'Kill switch',
          desired
            ? `${ks.label} pausado. No se enviarán emails hasta nuevo aviso.`
            : `${ks.label} reactivado.`,
        );
      } else {
        // RLS silently returned no rows — restore previous state and surface error.
        ks.paused = previousPaused;
        ks.pausedAt = previousAt;
        ks.pausedBy = previousBy;
        input.checked = previousPaused;
        this.toastService.error(
          'Kill switch',
          'No se pudo guardar: solo super_admin puede modificar el kill switch.',
        );
      }
    } catch (e: any) {
      ks.paused = previousPaused;
      ks.pausedAt = previousAt;
      ks.pausedBy = previousBy;
      input.checked = previousPaused;
      this.toastService.error(
        'Kill switch',
        e?.message ?? `Error al guardar el estado de ${ks.label}.`,
      );
    } finally {
      ks.saving = false;
      this.killSwitches.set([...this.killSwitches()]);
    }
  }

  /** Render the first 8 chars of a UUID for compact "otro super_admin" labels. */
  shortId(id: string): string {
    return id.slice(0, 8);
  }

  private toCard(
    key: keyof HealthPayload['checks'],
    label: string,
    description: string,
    icon: string,
    iconColor: string,
    payload: HealthPayload,
  ) {
    const check = payload.checks[key];
    const status = check.status;
    const statusLabel = status === 'ok' ? 'OK' : status === 'degraded' ? 'Degradado' : 'Caído';
    const badgeClasses =
      status === 'ok'
        ? 'bg-green-100 text-green-800'
        : status === 'degraded'
          ? 'bg-yellow-100 text-yellow-800'
          : status === 'down'
            ? 'bg-red-100 text-red-800'
            : 'bg-gray-100 text-gray-600';
    return {
      key,
      label,
      description,
      icon,
      iconColor,
      status,
      statusLabel,
      badgeClasses,
      latencyMs: check.latency_ms,
      detail: check.detail,
    };
  }
}