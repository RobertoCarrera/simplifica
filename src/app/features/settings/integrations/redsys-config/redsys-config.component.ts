import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { RedsysConfigService, RedsysEnvironment } from '../../../../services/redsys-config.service';

/**
 * Per-company Redsys payment-gateway configuration. The owner of the
 * company pastes the FUC, terminal, and secret key issued by Redsys,
 * picks an environment (test/production), and enables the gateway.
 *
 * The secret is sent to a SECURITY DEFINER RPC that encrypts it
 * with pgsodium/Vault before persisting. The raw key is never
 * returned to the client after save.
 */
@Component({
  selector: 'app-redsys-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <header class="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-3 min-w-0">
          <span class="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-credit-card text-red-600 dark:text-red-400"></i>
          </span>
          <div class="min-w-0">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Redsys (TPV Virtual)</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Pagos con tarjeta para tus clientes desde el portal.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          @if (enabled()) {
            <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Activo
            </span>
          } @else {
            <span class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
              Inactivo
            </span>
          }
        </div>
      </header>

      <div class="px-5 py-4 space-y-4">
        @if (loading()) {
          <div class="py-6 text-center text-sm text-gray-500">
            <i class="fas fa-spinner fa-spin mr-2"></i>
            Cargando configuración…
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Merchant code (FUC) -->
            <label class="block">
              <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Código de comercio (FUC)
              </span>
              <input
                type="text"
                [ngModel]="merchantCode()"
                (ngModelChange)="merchantCode.set($event)"
                placeholder="999008881"
                class="mt-1 w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-700 dark:text-gray-200 font-mono"
              />
            </label>

            <!-- Terminal -->
            <label class="block">
              <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Terminal
              </span>
              <input
                type="text"
                [ngModel]="terminal()"
                (ngModelChange)="terminal.set($event)"
                placeholder="1"
                class="mt-1 w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-700 dark:text-gray-200 font-mono"
              />
            </label>

            <!-- Merchant name -->
            <label class="block">
              <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Nombre comercial
              </span>
              <input
                type="text"
                [ngModel]="merchantName()"
                (ngModelChange)="merchantName.set($event)"
                placeholder="Mi Empresa S.L."
                class="mt-1 w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-700 dark:text-gray-200"
              />
              <span class="block mt-1 text-[11px] text-gray-500">Aparece en la página de pago de Redsys.</span>
            </label>

            <!-- Environment -->
            <label class="block">
              <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Entorno
              </span>
              <div class="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  (click)="environment.set('test')"
                  [class.border-red-500]="environment() === 'test'"
                  [class.bg-red-50]="environment() === 'test'"
                  [class.dark:bg-red-900]="environment() === 'test'"
                  [class.border-gray-200]="environment() !== 'test'"
                  [class.dark:border-gray-700]="environment() !== 'test'"
                  class="px-3 py-2 text-sm border rounded-lg text-left transition-colors"
                >
                  <div class="font-medium text-gray-900 dark:text-white text-sm">Test (sandbox)</div>
                  <div class="text-[11px] text-gray-500">sis-t.redsys.es</div>
                </button>
                <button
                  type="button"
                  (click)="environment.set('production')"
                  [class.border-red-500]="environment() === 'production'"
                  [class.bg-red-50]="environment() === 'production'"
                  [class.dark:bg-red-900]="environment() === 'production'"
                  [class.border-gray-200]="environment() !== 'production'"
                  [class.dark:border-gray-700]="environment() !== 'production'"
                  class="px-3 py-2 text-sm border rounded-lg text-left transition-colors"
                >
                  <div class="font-medium text-gray-900 dark:text-white text-sm">Producción</div>
                  <div class="text-[11px] text-gray-500">sis.redsys.es</div>
                </button>
              </div>
            </label>

            <!-- Secret key -->
            <label class="block md:col-span-2">
              <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Clave secreta (SHA-256)
              </span>
              <div class="mt-1 relative">
                <input
                  [type]="showSecret() ? 'text' : 'password'"
                  [ngModel]="secretKey()"
                  (ngModelChange)="secretKey.set($event)"
                  [placeholder]="secretKeyPlaceholder()"
                  class="w-full px-3 py-2 pr-20 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-700 dark:text-gray-200 font-mono"
                />
                <button
                  type="button"
                  (click)="showSecret.set(!showSecret())"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2"
                >
                  {{ showSecret() ? 'Ocultar' : 'Mostrar' }}
                </button>
              </div>
              <span class="block mt-1 text-[11px] text-gray-500">
                La clave se cifra antes de guardarse. No se vuelve a mostrar después.
              </span>
            </label>

            <!-- Notify URL -->
            <label class="block md:col-span-2">
              <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                URL de notificación
              </span>
              <input
                type="text"
                [ngModel]="notifyUrl()"
                (ngModelChange)="notifyUrl.set($event)"
                [placeholder]="defaultNotifyUrl()"
                class="mt-1 w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-700 dark:text-gray-200 font-mono"
              />
              <span class="block mt-1 text-[11px] text-gray-500">
                Redsys la llama cuando un pago cambia de estado. Déjala vacía para usar la URL por defecto.
              </span>
            </label>
          </div>

          <!-- Enable + test + save -->
          <div class="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                [ngModel]="enabled()"
                (ngModelChange)="enabled.set($event)"
                class="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span class="text-sm text-gray-700 dark:text-gray-200">Habilitar Redsys en el portal del cliente</span>
            </label>

            <div class="ml-auto flex items-center gap-2">
              <button
                type="button"
                (click)="test()"
                [disabled]="testing()"
                class="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center gap-1.5"
              >
                @if (testing()) {
                  <span class="animate-spin h-3.5 w-3.5 border-2 border-gray-400 border-t-transparent rounded-full"></span>
                } @else {
                  <i class="fas fa-plug text-xs"></i>
                }
                Probar conexión
              </button>
              <button
                type="button"
                (click)="save()"
                [disabled]="saving()"
                class="px-4 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                @if (saving()) {
                  <span class="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                } @else {
                  <i class="fas fa-save text-xs"></i>
                }
                Guardar
              </button>
            </div>
          </div>

          @if (testResult(); as r) {
            <div
              class="flex items-start gap-2 p-3 rounded-md text-sm"
              [class.bg-emerald-50]="r.ok"
              [class.text-emerald-700]="r.ok"
              [class.dark:bg-emerald-900]="r.ok"
              [class.dark:text-emerald-300]="r.ok"
              [class.bg-red-50]="!r.ok"
              [class.text-red-700]="!r.ok"
              [class.dark:bg-red-900]="!r.ok"
              [class.dark:text-red-300]="!r.ok"
            >
              <i [class]="r.ok ? 'fas fa-check-circle mt-0.5' : 'fas fa-exclamation-circle mt-0.5'"></i>
              <div class="flex-1">
                <div class="font-medium">{{ r.message }}</div>
                @if (r.details) {
                  <pre class="text-[11px] opacity-80 mt-1 whitespace-pre-wrap break-all">{{ r.details | json }}</pre>
                }
              </div>
            </div>
          }

          @if (errorMessage()) {
            <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage() }}</p>
          }
        }
      </div>
    </div>
  `,
})
export class RedsysConfigComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private redsys = inject(RedsysConfigService);

  private destroy$ = new Subject<void>();

  loading = this.redsys.loading;
  saving = this.redsys.saving;
  testing = this.redsys.testing;
  testResult = this.redsys.testResult;

  merchantCode = signal<string>('');
  terminal = signal<string>('1');
  merchantName = signal<string>('');
  environment = signal<RedsysEnvironment>('test');
  secretKey = signal<string>('');
  notifyUrl = signal<string>('');
  enabled = signal<boolean>(false);
  showSecret = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.errorMessage.set('No hay empresa activa');
      return;
    }
    this.redsys.load(companyId).then((cfg) => {
      if (!cfg) return;
      this.merchantCode.set(cfg.merchant_code ?? '');
      this.terminal.set(cfg.terminal);
      this.merchantName.set(cfg.merchant_name ?? '');
      this.environment.set(cfg.environment);
      this.notifyUrl.set(cfg.notify_url ?? '');
      this.enabled.set(cfg.enabled);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  secretKeyPlaceholder(): string {
    return this.redsys.config()?.secret_key_set
      ? '•••••••••••••••• (deja vacío para mantener la actual)'
      : 'REDACTED_RUNTIME_KEY';
  }

  defaultNotifyUrl(): string {
    return this.redsys.defaultNotifyUrl();
  }

  test(): void {
    this.redsys.testConnection();
  }

  async save(): Promise<void> {
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.toast.error('Sin empresa activa', 'No se puede guardar la configuración');
      return;
    }
    if (!this.merchantCode().trim()) {
      this.toast.error('Falta el código de comercio', 'Introduce el FUC asignado por Redsys');
      return;
    }
    this.errorMessage.set(null);
    const ok = await this.redsys.save(companyId, {
      merchant_code: this.merchantCode().trim(),
      terminal: this.terminal().trim() || '1',
      merchant_name: this.merchantName().trim() || null,
      environment: this.environment(),
      currency: '978',
      enabled: this.enabled(),
      notify_url: this.notifyUrl().trim() || null,
      secret_key: this.secretKey() || undefined,
    });
    if (ok) {
      // Clear the secret input after a successful save so the
      // key isn't left lying in the form state.
      this.secretKey.set('');
      this.showSecret.set(false);
    }
  }
}
