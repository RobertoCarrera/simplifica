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
            Controles Globales
          </h2>
          @if (killSwitchLoading()) {
            <span class="text-xs text-gray-500">
              <i class="fas fa-spinner fa-spin mr-1"></i>
              Cargando...
            </span>
          }
        </div>

        <div class="p-4 flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="font-medium text-sm">
              Pausar envío de recordatorios a clientes
            </div>
            <p class="text-xs text-gray-500 mt-1">
              Cuando está activo, el cron <code>process-reminders</code> no envía
              emails de recordatorio 24h/1h ni solicitudes de reseña. Los demás
              crons no se ven afectados.
            </p>

            @if (killSwitchPaused()) {
              <div class="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 inline-block">
                <i class="fas fa-circle-info mr-1"></i>
                Pausado
                @if (killSwitchPausedAt(); as at) {
                  el {{ at | date: 'short' }}
                }
                @if (killSwitchPausedBy(); as by) {
                  por
                  @if (by === currentUserId()) {
                    ti
                  } @else {
                    otro super_admin
                  }
                }
              </div>
            } @else if (!killSwitchLoading()) {
              <div class="mt-2 text-xs text-green-700">
                <i class="fas fa-circle-check mr-1"></i>
                Activo: los recordatorios se envían con normalidad.
              </div>
            }
          </div>

          <label class="inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              class="sr-only peer"
              [checked]="killSwitchPaused()"
              [disabled]="killSwitchLoading() || killSwitchSaving()"
              (change)="onToggleKillSwitch($event)"
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

  // Kill switch state
  killSwitchLoading = signal(true);
  killSwitchSaving = signal(false);
  killSwitchPaused = signal(false);
  killSwitchPausedAt = signal<Date | null>(null);
  killSwitchPausedBy = signal<string | null>(null);

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
    this.loadKillSwitch();
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
   * Load the current value of the process-reminders kill switch.
   * RLS enforces super_admin only — non-super_admin calls return 0 rows
   * (PostgREST treats them as [], not as an error).
   */
  async loadKillSwitch() {
    this.killSwitchLoading.set(true);
    try {
      const { data, error } = await this.simpleSupabase
        .getClient()
        .from('system_settings')
        .select('process_reminders_paused, process_reminders_paused_at, process_reminders_paused_by')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        this.killSwitchPaused.set(!!data.process_reminders_paused);
        this.killSwitchPausedAt.set(
          data.process_reminders_paused_at ? new Date(data.process_reminders_paused_at) : null,
        );
        this.killSwitchPausedBy.set(data.process_reminders_paused_by ?? null);
      } else {
        // No row returned: most likely not super_admin (RLS) or row not seeded yet.
        // Reset to defaults; the toggle stays disabled because we can't prove permission.
        this.killSwitchPaused.set(false);
        this.killSwitchPausedAt.set(null);
        this.killSwitchPausedBy.set(null);
      }
    } catch (e: any) {
      // RLS denial or network error — surface as a toast but keep UI usable.
      this.toastService.error(
        'Kill switch',
        e?.message ?? 'No se pudo leer el estado del kill switch (¿eres super_admin?)',
      );
    } finally {
      this.killSwitchLoading.set(false);
    }
  }

  /**
   * Handle user toggling the kill switch.
   * Optimistically flips the local state, then persists; rolls back on error.
   */
  async onToggleKillSwitch(event: Event) {
    const input = event.target as HTMLInputElement;
    const desired = input.checked;

    if (this.killSwitchSaving()) return;

    const previousPaused = this.killSwitchPaused();
    this.killSwitchSaving.set(true);
    // Optimistic update
    this.killSwitchPaused.set(desired);

    try {
      const patch: Record<string, unknown> = {
        process_reminders_paused: desired,
      };
      if (desired) {
        patch['process_reminders_paused_at'] = new Date().toISOString();
        const uid = this.currentUserId();
        if (uid) patch['process_reminders_paused_by'] = uid;
      } else {
        patch['process_reminders_paused_at'] = null;
        patch['process_reminders_paused_by'] = null;
      }

      const { data, error } = await this.simpleSupabase
        .getClient()
        .from('system_settings')
        .update(patch)
        .eq('id', 1)
        .select('process_reminders_paused, process_reminders_paused_at, process_reminders_paused_by')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        this.killSwitchPaused.set(!!data.process_reminders_paused);
        this.killSwitchPausedAt.set(
          data.process_reminders_paused_at ? new Date(data.process_reminders_paused_at) : null,
        );
        this.killSwitchPausedBy.set(data.process_reminders_paused_by ?? null);
        this.toastService.success(
          'Kill switch',
          desired
            ? 'process-reminders pausado. No se enviarán recordatorios hasta nuevo aviso.'
            : 'process-reminders reactivado.',
        );
      } else {
        // RLS silently returned no rows — restore previous state and surface error.
        this.killSwitchPaused.set(previousPaused);
        input.checked = previousPaused;
        this.toastService.error(
          'Kill switch',
          'No se pudo guardar: solo super_admin puede modificar el kill switch.',
        );
      }
    } catch (e: any) {
      // Roll back optimistic update
      this.killSwitchPaused.set(previousPaused);
      input.checked = previousPaused;
      this.toastService.error(
        'Kill switch',
        e?.message ?? 'Error al guardar el estado del kill switch.',
      );
    } finally {
      this.killSwitchSaving.set(false);
    }
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
