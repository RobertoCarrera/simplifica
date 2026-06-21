import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
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

  loading = signal(false);
  lastPayload = signal<HealthPayload | null>(null);
  lastChecked = signal<Date | null>(null);
  errorMessage = signal<string | null>(null);

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
