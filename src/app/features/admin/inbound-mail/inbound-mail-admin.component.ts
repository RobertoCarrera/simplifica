import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import {
  InboundMailService,
  InboundMailConfig,
  InboundMailGlobalConfig,
  AwsJob,
} from './inbound-mail.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-inbound-mail-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  template: `
    <div class="p-6 max-w-7xl mx-auto">
      <h1 class="text-2xl font-semibold mb-1">
        <i class="fas fa-shield-halved text-blue-600 mr-2"></i>
        Inbound Mail — Admin
      </h1>
      <p class="text-sm text-gray-500 mb-6">
        Configuración global y monitor de provisioning SES. Solo super_admin.
      </p>

      <!-- Global config card -->
      <div class="bg-white border rounded p-4 shadow-sm mb-6">
        <h2 class="text-lg font-semibold mb-3">Configuración global</h2>
        @if (globalCfg(); as cfg) {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled-globally"
                [checked]="cfg.enabled"
                (change)="updateGlobal({ enabled: $any($event.target).checked })"
              />
              <label for="enabled-globally" class="text-sm">
                Inbound mail habilitado globalmente
              </label>
            </div>
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="sandbox-mode"
                [checked]="cfg.sandbox_mode"
                (change)="updateGlobal({ sandbox_mode: $any($event.target).checked })"
              />
              <label for="sandbox-mode" class="text-sm">
                Modo sandbox (solo remitentes verificados)
              </label>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Rule Set</label>
              <input
                class="w-full border rounded px-2 py-1 text-sm"
                [ngModel]="cfg.rule_set_name"
                (ngModelChange)="updateGlobal({ rule_set_name: $event })"
              />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Lambda function</label>
              <input
                class="w-full border rounded px-2 py-1 text-sm"
                [ngModel]="cfg.lambda_function_name"
                (ngModelChange)="updateGlobal({ lambda_function_name: $event })"
              />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">S3 bucket</label>
              <input
                class="w-full border rounded px-2 py-1 text-sm"
                [ngModel]="cfg.s3_bucket"
                (ngModelChange)="updateGlobal({ s3_bucket: $event })"
              />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">SES region</label>
              <input
                class="w-full border rounded px-2 py-1 text-sm"
                [ngModel]="cfg.ses_region"
                (ngModelChange)="updateGlobal({ ses_region: $event })"
              />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Max dominios por empresa</label>
              <input
                type="number"
                class="w-full border rounded px-2 py-1 text-sm"
                [ngModel]="cfg.max_domains_per_company"
                (ngModelChange)="updateGlobal({ max_domains_per_company: +$event })"
              />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">MX priority (default)</label>
              <input
                type="number"
                class="w-full border rounded px-2 py-1 text-sm"
                [ngModel]="cfg.default_mx_priority"
                (ngModelChange)="updateGlobal({ default_mx_priority: +$event })"
              />
            </div>
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="force-global"
                [checked]="cfg.force_global_rule"
                (change)="updateGlobal({ force_global_rule: $any($event.target).checked })"
              />
              <label for="force-global" class="text-sm">
                Forzar regla global única
              </label>
            </div>
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-prov"
                [checked]="cfg.auto_provision_on_domain_verify"
                (change)="updateGlobal({ auto_provision_on_domain_verify: $any($event.target).checked })"
              />
              <label for="auto-prov" class="text-sm">
                Auto-provision al verificar dominio
              </label>
            </div>
          </div>
        } @else {
          <i class="fas fa-spinner fa-spin"></i> Cargando...
        }
      </div>

      <!-- Healthcheck + jobs -->
      <div class="bg-white border rounded p-4 shadow-sm mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Estado de la flota</h2>
          <div class="flex gap-2">
            <button
              class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              [disabled]="healthcheckRunning()"
              (click)="runHealthcheck()"
            >
              <i class="fas fa-heartbeat mr-1"></i>
              {{ healthcheckRunning() ? 'Verificando…' : 'Correr healthcheck' }}
            </button>
            <button
              class="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              (click)="refresh()"
            >
              <i class="fas fa-sync mr-1"></i>
              Refrescar
            </button>
          </div>
        </div>

        @if (healthcheckResult(); as hc) {
          <div class="grid grid-cols-3 gap-3 text-center text-sm mb-3">
            <div class="bg-green-50 border border-green-200 rounded p-2">
              <div class="text-2xl font-bold text-green-700">{{ hc.ok }}</div>
              <div class="text-xs">OK</div>
            </div>
            <div class="bg-yellow-50 border border-yellow-200 rounded p-2">
              <div class="text-2xl font-bold text-yellow-700">{{ hc.drifted }}</div>
              <div class="text-xs">Drifted</div>
            </div>
            <div class="bg-red-50 border border-red-200 rounded p-2">
              <div class="text-2xl font-bold text-red-700">{{ hc.missing }}</div>
              <div class="text-xs">Missing</div>
            </div>
          </div>
        }

        <h3 class="text-sm font-semibold mt-4 mb-2">Cola aws_jobs (últimos 50)</h3>
        @if (jobs().length === 0) {
          <p class="text-xs text-gray-500">Sin jobs en cola.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-2 py-1">Tipo</th>
                  <th class="px-2 py-1">Dominio</th>
                  <th class="px-2 py-1">Status</th>
                  <th class="px-2 py-1">Attempts</th>
                  <th class="px-2 py-1">Error</th>
                  <th class="px-2 py-1">Run at</th>
                </tr>
              </thead>
              <tbody>
                @for (j of jobs(); track j.id) {
                  <tr class="border-t">
                    <td class="px-2 py-1 font-mono">{{ j.job_type }}</td>
                    <td class="px-2 py-1">{{ j.domain ?? '—' }}</td>
                    <td class="px-2 py-1">
                      <span
                        [class.text-green-700]="j.status === 'completed'"
                        [class.text-red-700]="j.status === 'failed' || j.status === 'dead'"
                        [class.text-yellow-700]="j.status === 'pending' || j.status === 'in_progress'"
                      >
                        {{ j.status }}
                      </span>
                    </td>
                    <td class="px-2 py-1">{{ j.attempts }}</td>
                    <td class="px-2 py-1 text-red-600 truncate max-w-xs">{{ j.last_error ?? '—' }}</td>
                    <td class="px-2 py-1">{{ j.run_at | date: 'short' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- All configs -->
      <div class="bg-white border rounded p-4 shadow-sm">
        <h2 class="text-lg font-semibold mb-3">
          Configuraciones por empresa ({{ configs().length }})
        </h2>
        @if (configs().length === 0) {
          <p class="text-xs text-gray-500">Sin configuraciones registradas.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-2 py-1">Dominio</th>
                  <th class="px-2 py-1">Status</th>
                  <th class="px-2 py-1">Regla SES</th>
                  <th class="px-2 py-1">MX</th>
                  <th class="px-2 py-1">Last error</th>
                  <th class="px-2 py-1">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (c of configs(); track c.id) {
                  <tr class="border-t">
                    <td class="px-2 py-1 font-mono">{{ c.domain }}</td>
                    <td class="px-2 py-1">
                      <span
                        [class.text-green-700]="c.status === 'active'"
                        [class.text-red-700]="c.status === 'failed'"
                        [class.text-yellow-700]="c.status === 'verifying' || c.status === 'pending'"
                        [class.text-gray-700]="c.status === 'inactive'"
                      >
                        {{ c.status }}
                      </span>
                    </td>
                    <td class="px-2 py-1 font-mono text-xs">{{ c.ses_rule_name ?? '—' }}</td>
                    <td class="px-2 py-1 font-mono text-xs">{{ c.mx_record_value ?? '—' }}</td>
                    <td class="px-2 py-1 text-red-600 truncate max-w-xs">{{ c.last_error ?? '—' }}</td>
                    <td class="px-2 py-1">
                      <button
                        class="text-blue-600 hover:underline"
                        [disabled]="busy()"
                        (click)="reprovision(c)"
                      >
                        Reprovision
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class InboundMailAdminComponent implements OnInit {
  private service = inject(InboundMailService);
  private toast = inject(ToastService);

  globalCfg = signal<InboundMailGlobalConfig | null>(null);
  configs = signal<InboundMailConfig[]>([]);
  jobs = signal<AwsJob[]>([]);
  healthcheckResult = signal<{ ok: number; drifted: number; missing: number } | null>(null);
  healthcheckRunning = signal(false);
  busy = signal(false);

  async ngOnInit() {
    await this.refresh();
  }

  async refresh() {
    try {
      const [g, c, j] = await Promise.all([
        this.service.getGlobalConfig(),
        this.service.listAllConfigs(),
        this.service.listAwsJobs(50),
      ]);
      this.globalCfg.set(g);
      this.configs.set(c);
      this.jobs.set(j);
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'No se pudo cargar');
    }
  }

  async updateGlobal(patch: Partial<InboundMailGlobalConfig>) {
    this.busy.set(true);
    try {
      const updated = await this.service.updateGlobalConfig(patch);
      this.globalCfg.set(updated);
      this.toast.success('Guardado', 'Configuración global actualizada');
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'No se pudo guardar');
    } finally {
      this.busy.set(false);
    }
  }

  async runHealthcheck() {
    this.healthcheckRunning.set(true);
    try {
      const result = await this.service.runHealthcheck();
      this.healthcheckResult.set(result);
      this.toast.info('Healthcheck', `OK: ${result.ok}, Drifted: ${result.drifted}, Missing: ${result.missing}`);
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'Healthcheck falló');
    } finally {
      this.healthcheckRunning.set(false);
    }
  }

  async reprovision(c: InboundMailConfig) {
    if (!confirm(`¿Reprovisionar ${c.domain}?`)) return;
    this.busy.set(true);
    try {
      const result = await this.service.startProvisioning(c.company_id, c.domain);
      if (result.success) {
        this.toast.success('Listo', `${c.domain} reprovisionado`);
      } else {
        this.toast.error('Error', result.error ?? 'Falló');
      }
      await this.refresh();
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'Falló');
    } finally {
      this.busy.set(false);
    }
  }
}
