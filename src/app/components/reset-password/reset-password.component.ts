import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div class="max-w-md w-full space-y-8">
        <div>
          <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Recuperar contraseña
          </h2>
          <p class="mt-2 text-center text-sm text-gray-600" *ngIf="!tokenPresent()">
            Ingresa tu nueva contraseña (has llegado desde el enlace del email)
          </p>
        </div>

        <div *ngIf="stage() === 'setting'">
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="mt-8 space-y-6">
            <div class="rounded-md shadow-sm -space-y-px">
              <div>
                <label class="sr-only">Nueva contraseña</label>
                <input type="password" formControlName="password" placeholder="Nueva contraseña"
                  class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm">
              </div>
              <div>
                <label class="sr-only">Confirmar contraseña</label>
                <input type="password" formControlName="confirm" placeholder="Confirmar contraseña"
                  class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm">
              </div>
            </div>

            <div>
              <button type="submit" [disabled]="form.invalid || loading()"
                class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
                <span *ngIf="!loading(); else loadingTpl">Actualizar contraseña</span>
              </button>
              <ng-template #loadingTpl>
                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </ng-template>
            </div>
          </form>
        </div>

        <div *ngIf="stage() === 'done'" class="text-center space-y-4">
          <p class="text-green-700 font-medium">Contraseña actualizada correctamente</p>
          <button (click)="router.navigate(['/login'])" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Ir al login</button>
        </div>

        <div *ngIf="stage() === 'error'" class="text-center space-y-4">
          <p class="text-red-600">{{errorMessage()}}</p>
          <button (click)="reload()" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Reintentar</button>
        </div>
      </div>
    </div>
  `
})
export class ResetPasswordComponent implements OnInit {
  form;

  loading = signal(false);
  stage = signal<'setting'|'done'|'error'>('setting');
  errorMessage = signal('');
  tokenPresent = signal(false);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    public router: Router,
    private toast: ToastService
  ) {
    this.form = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', [Validators.required]]
    });
  }

  async ngOnInit() {
    const fragment = window.location.hash.substring(1);
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    if (accessToken && refreshToken) {
      this.tokenPresent.set(true);
      try {
        const { error } = await this.auth.client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (error) throw error;
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e:any) {
        console.error('Error estableciendo sesión de recuperación', e);
        this.stage.set('error');
        this.errorMessage.set('No se pudo validar el enlace. Solicita otro email.');
      }
    } else if (type === 'recovery') {
      this.tokenPresent.set(true);
    }
  }

  async onSubmit() {
    if (this.form.invalid) return;
    const { password, confirm } = this.form.value;
    if (password !== confirm) {
      this.toast.error('Las contraseñas no coinciden', 'Error');
      return;
    }
    this.loading.set(true);
    const result = await this.auth.updatePassword(password!);
    this.loading.set(false);
    if (result.success) {
      this.toast.success('Contraseña actualizada', 'Éxito');
      this.stage.set('done');
    } else {
      this.toast.error(result.error || 'Error actualizando contraseña', 'Error');
    }
  }

  reload() { window.location.reload(); }
}
