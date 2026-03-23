import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-mfa-verify',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div class="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <div class="text-center mb-6">
          <div class="text-4xl mb-3">🔐</div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Verificación en dos pasos</h1>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Tu cuenta requiere verificación adicional para acceder a esta sección.
          </p>
        </div>

        @if (loading) {
          <div class="text-center py-6 text-gray-500">Cargando...</div>
        } @else if (error) {
          <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-4">
            <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
          </div>
        }

        @if (!loading && factors.length > 0) {
          <form (ngSubmit)="verify()" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Código de autenticador
              </label>
              <input
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                [(ngModel)]="code"
                name="code"
                placeholder="000000"
                maxlength="6"
                class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-700 dark:text-white"
                [disabled]="verifying"
                required
              />
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Abre tu app de autenticación (Google Authenticator, Authy, etc.) e introduce el código de 6 dígitos.
              </p>
            </div>

            <button
              type="submit"
              [disabled]="verifying || code.length < 6"
              class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {{ verifying ? 'Verificando...' : 'Verificar' }}
            </button>
          </form>
        } @else if (!loading && factors.length === 0) {
          <div class="text-center space-y-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Tu cuenta aún no tiene configurada la verificación en dos pasos (2FA/TOTP).
              Los administradores y propietarios deben activarla antes de continuar.
            </p>
            <button
              (click)="goToSettings()"
              class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Ir a Configuración de Seguridad
            </button>
          </div>
        }

        @if (!loading && factors.length > 0) {
          <div class="mt-4 text-center">
            <button (click)="showBackupInput = !showBackupInput" class="text-xs text-blue-500 hover:text-blue-700">
              {{ showBackupInput ? 'Usar código TOTP' : '¿Perdiste tu dispositivo? Usa un código de respaldo' }}
            </button>
          </div>

          @if (showBackupInput) {
            <form (ngSubmit)="verifyBackup()" class="mt-3 space-y-3">
              <input
                type="text"
                [(ngModel)]="backupCode"
                name="backupCode"
                placeholder="Código de respaldo"
                maxlength="8"
                class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-center text-lg tracking-widest font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-700 dark:text-white"
                [disabled]="verifying"
              />
              <button
                type="submit"
                [disabled]="verifying || backupCode.length < 6"
                class="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {{ verifying ? 'Verificando...' : 'Verificar código de respaldo' }}
              </button>
            </form>
          }
        }

        <div class="mt-4 text-center">
          <button (click)="signOut()" class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  `
})
export class MfaVerifyComponent implements OnInit, OnDestroy {
  private destroyed = false;
  factors: { id: string; friendly_name?: string }[] = [];
  code = '';
  loading = true;
  verifying = false;
  error = '';
  // Brute-force protection: max 5 attempts, then lockout with exponential backoff
  private failedAttempts = 0;
  private lockedUntil = 0;
  private static readonly MAX_ATTEMPTS = 5;

  // Backup code recovery
  showBackupInput = false;
  backupCode = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      const { data } = await this.authService.client.auth.mfa.listFactors();
      // Fix #20: Guard against setting state after component is destroyed
      if (!this.destroyed) {
        this.factors = data?.totp ?? [];
      }
    } catch {
      if (!this.destroyed) {
        this.error = 'No se pudo cargar la información de autenticación.';
      }
    } finally {
      if (!this.destroyed) {
        this.loading = false;
      }
    }
  }

  ngOnDestroy(): void {
    // Fix #20: Mark as destroyed to prevent state updates after navigation
    this.destroyed = true;
  }

  async verify() {
    if (this.code.length < 6 || this.verifying) return;

    // Check lockout
    const now = Date.now();
    if (now < this.lockedUntil) {
      const waitSec = Math.ceil((this.lockedUntil - now) / 1000);
      this.error = `Demasiados intentos fallidos. Espera ${waitSec}s.`;
      this.code = '';
      return;
    }

    this.verifying = true;
    this.error = '';

    try {
      const factorId = this.factors[0]?.id;
      if (!factorId) { this.error = 'No hay factores de autenticación disponibles.'; return; }

      const { error } = await this.authService.client.auth.mfa.challengeAndVerify({
        factorId,
        code: this.code
      });

      if (error) {
        this.failedAttempts++;
        if (this.failedAttempts >= MfaVerifyComponent.MAX_ATTEMPTS) {
          // Exponential backoff: 30s, 60s, 120s...
          const lockoutMs = 30_000 * Math.pow(2, Math.floor(this.failedAttempts / MfaVerifyComponent.MAX_ATTEMPTS) - 1);
          this.lockedUntil = Date.now() + lockoutMs;
          this.error = `Demasiados intentos. Bloqueado ${Math.ceil(lockoutMs / 1000)}s.`;
        } else {
          const remaining = MfaVerifyComponent.MAX_ATTEMPTS - this.failedAttempts;
          this.error = `Código incorrecto. ${remaining} intento${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'}.`;
        }
        this.code = '';
      } else {
        this.failedAttempts = 0;
        // AAL level is now aal2 — navigate back to the intended destination
        const returnTo = (window.history.state as { returnTo?: string })?.returnTo || '/';
        await this.router.navigateByUrl(returnTo);
      }
    } catch {
      this.error = 'Error al verificar el código. Inténtalo de nuevo.';
    } finally {
      this.verifying = false;
    }
  }

  async verifyBackup() {
    if (this.backupCode.length < 6 || this.verifying) return;
    this.verifying = true;
    this.error = '';
    try {
      const valid = await this.authService.verifyBackupCode(this.backupCode);
      if (valid) {
        const returnTo = (window.history.state as { returnTo?: string })?.returnTo || '/';
        await this.router.navigateByUrl(returnTo);
      } else {
        this.error = 'Código de respaldo inválido o ya utilizado.';
        this.backupCode = '';
      }
    } catch {
      this.error = 'Error al verificar el código de respaldo.';
    } finally {
      this.verifying = false;
    }
  }

  goToSettings() {
    this.router.navigate(['/configuracion'], { fragment: 'seguridad' });
  }

  async signOut() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
