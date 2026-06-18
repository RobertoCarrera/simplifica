import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { InboundMailService, InboundMailConfig, InboundStatus } from './inbound-mail.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-inbound-mail-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <h1 class="text-2xl font-semibold mb-2">{{ 'inbound.title' | transloco }}</h1>
      <p class="text-sm text-gray-500 mb-6">
        {{ 'inbound.subtitle' | transloco }}
      </p>

      @if (loading()) {
        <div class="text-center py-8">
          <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
        </div>
      } @else if (configs().length === 0) {
        <div class="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm">
          {{ 'inbound.noDomains' | transloco }}
        </div>
      } @else {
        <div class="space-y-4">
          @for (cfg of configs(); track cfg.id) {
            <div class="bg-white border rounded p-4 shadow-sm">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h2 class="text-lg font-semibold">{{ cfg.domain }}</h2>
                  <p class="text-xs text-gray-500">
                    {{ 'inbound.lastProvisioned' | transloco }}:
                    {{ cfg.last_provisioned_at ? (cfg.last_provisioned_at | date: 'short') : '—' }}
                  </p>
                </div>
                <span
                  class="px-2 py-1 rounded text-xs font-semibold"
                  [class.bg-green-100]="cfg.status === 'active'"
                  [class.text-green-800]="cfg.status === 'active'"
                  [class.bg-yellow-100]="cfg.status === 'verifying' || cfg.status === 'pending'"
                  [class.text-yellow-800]="cfg.status === 'verifying' || cfg.status === 'pending'"
                  [class.bg-red-100]="cfg.status === 'failed'"
                  [class.text-red-800]="cfg.status === 'failed'"
                  [class.bg-gray-100]="cfg.status === 'inactive'"
                  [class.text-gray-800]="cfg.status === 'inactive'"
                >
                  {{ statusLabel(cfg.status) }}
                </span>
              </div>

              @if (cfg.status === 'failed' && cfg.last_error) {
                <div class="bg-red-50 border border-red-200 rounded p-3 mb-3 text-xs text-red-700">
                  <strong>{{ 'inbound.error' | transloco }}:</strong> {{ cfg.last_error }}
                </div>
              }

              @if (cfg.ses_rule_name) {
                <p class="text-xs text-gray-500 mb-2">
                  {{ 'inbound.sesRule' | transloco }}:
                  <code class="bg-gray-100 px-1 rounded">{{ cfg.ses_rule_name }}</code>
                  ({{ cfg.ses_rule_set_name }})
                </p>
              }

              @if (cfg.mx_record_value) {
                <p class="text-xs text-gray-500 mb-2">
                  {{ 'inbound.mxRecord' | transloco }}:
                  <code class="bg-gray-100 px-1 rounded">{{ cfg.mx_record_value }}</code>
                </p>
              }

              <details class="mt-3">
                <summary class="cursor-pointer text-sm text-blue-600">
                  {{ 'inbound.behaviorSettings' | transloco }}
                </summary>
                <div class="mt-3 space-y-3 pl-2 border-l-2 border-gray-200">
                  <div>
                    <label class="block text-xs font-medium mb-1">
                      {{ 'inbound.forwardUnknown' | transloco }}
                    </label>
                    <input
                      type="email"
                      [ngModel]="cfg.forward_unknown_to"
                      (ngModelChange)="updateForward(cfg, $event)"
                      class="w-full border rounded px-2 py-1 text-sm"
                      placeholder="tupersonal@ejemplo.com"
                    />
                    <p class="text-xs text-gray-500 mt-1">
                      {{ 'inbound.forwardUnknownHelp' | transloco }}
                    </p>
                  </div>
                  <div>
                    <label class="block text-xs font-medium mb-1">
                      {{ 'inbound.spamAction' | transloco }}
                    </label>
                    <select
                      [ngModel]="cfg.spam_action"
                      (ngModelChange)="updateSpamAction(cfg, $event)"
                      class="border rounded px-2 py-1 text-sm"
                    >
                      <option value="mark">{{ 'inbound.spamMark' | transloco }}</option>
                      <option value="quarantine">{{ 'inbound.spamQuarantine' | transloco }}</option>
                      <option value="reject">{{ 'inbound.spamReject' | transloco }}</option>
                    </select>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      [id]="'reject-' + cfg.id"
                      [checked]="cfg.reject_unknown"
                      (change)="updateRejectUnknown(cfg, $any($event.target).checked)"
                    />
                    <label [for]="'reject-' + cfg.id" class="text-xs">
                      {{ 'inbound.rejectUnknown' | transloco }}
                    </label>
                  </div>
                </div>
              </details>

              <div class="mt-4 flex gap-2">
                <button
                  class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  [disabled]="busy()"
                  (click)="reprovision(cfg)"
                >
                  <i class="fas fa-sync mr-1"></i>
                  {{ 'inbound.reprovision' | transloco }}
                </button>
                <button
                  class="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                  [disabled]="busy() || cfg.status === 'inactive'"
                  (click)="disable(cfg)"
                >
                  {{ 'inbound.disable' | transloco }}
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class InboundMailSettingsComponent implements OnInit {
  private service = inject(InboundMailService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  configs = signal<InboundMailConfig[]>([]);
  loading = signal(true);
  busy = signal(false);

  async ngOnInit() {
    await this.refresh();
  }

  async refresh() {
    this.loading.set(true);
    try {
      const list = await this.service.listMyCompany();
      this.configs.set(list);
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'No se pudo cargar la configuración');
    } finally {
      this.loading.set(false);
    }
  }

  async reprovision(cfg: InboundMailConfig) {
    this.busy.set(true);
    try {
      const result = await this.service.startProvisioning(cfg.company_id, cfg.domain);
      if (result.success) {
        this.toast.success('Listo', `Dominio ${cfg.domain} provisionado`);
        if (result.warnings?.length) {
          result.warnings.forEach(w => this.toast.info('Aviso', w));
        }
      } else {
        this.toast.error('Error', result.error ?? 'Falló el provisioning');
      }
      await this.refresh();
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'Falló el provisioning');
    } finally {
      this.busy.set(false);
    }
  }

  async disable(cfg: InboundMailConfig) {
    if (!confirm(`¿Desactivar inbound para ${cfg.domain}?`)) return;
    this.busy.set(true);
    try {
      await this.service.disable(cfg.company_id, cfg.domain);
      this.toast.info('Desactivado', `Inbound desactivado para ${cfg.domain}`);
      await this.refresh();
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'No se pudo desactivar');
    } finally {
      this.busy.set(false);
    }
  }

  async updateForward(cfg: InboundMailConfig, value: string | null) {
    try {
      await this.service.updateBehavior(cfg.company_id, cfg.domain, {
        forward_unknown_to: value,
      });
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'No se pudo guardar');
    }
  }

  async updateSpamAction(cfg: InboundMailConfig, value: 'mark' | 'quarantine' | 'reject') {
    try {
      await this.service.updateBehavior(cfg.company_id, cfg.domain, {
        spam_action: value,
      });
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'No se pudo guardar');
    }
  }

  async updateRejectUnknown(cfg: InboundMailConfig, value: boolean) {
    try {
      await this.service.updateBehavior(cfg.company_id, cfg.domain, {
        reject_unknown: value,
      });
    } catch (err: any) {
      this.toast.error('Error', err?.message ?? 'No se pudo guardar');
    }
  }

  statusLabel(status: InboundStatus): string {
    const labels: Record<InboundStatus, string> = {
      pending: 'Pendiente',
      verifying: 'Verificando…',
      active: 'Activo',
      failed: 'Falló',
      inactive: 'Inactivo',
    };
    return labels[status] ?? status;
  }
}
