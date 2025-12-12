import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-client-password-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="max-w-md mx-auto mt-16 p-6 bg-white rounded-xl shadow">
    <h1 class="text-xl font-semibold mb-2">Crea tu contraseña</h1>
    <p class="text-sm text-gray-600 mb-4">Configura una contraseña para iniciar sesión cuando quieras.</p>

    <form (submit)="onSubmit($event)" class="space-y-3">
      <div>
        <label class="block text-sm font-medium mb-1">Nueva contraseña</label>
        <input type="password" class="w-full border rounded px-3 py-2" [(ngModel)]="password" name="password" required minlength="8" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Repite la contraseña</label>
        <input type="password" class="w-full border rounded px-3 py-2" [(ngModel)]="password2" name="password2" required minlength="8" />
      </div>

      <div *ngIf="error()" class="text-red-600 text-sm">{{ error() }}</div>
      <div *ngIf="success()" class="text-green-700 text-sm">Contraseña guardada. Redirigiendo…</div>

      <button class="w-full bg-blue-600 text-white rounded px-4 py-2" [disabled]="loading()">Guardar contraseña</button>
      <button type="button" class="w-full border rounded px-4 py-2" (click)="skip()" [disabled]="loading()">Ahora no</button>
    </form>
  </div>
  `
})
export class ClientPasswordSetupComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  password = '';
  password2 = '';
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  async onSubmit(ev: Event) {
    ev.preventDefault();
    this.error.set(null);
    if (!this.password || this.password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (this.password !== this.password2) {
      this.error.set('Las contraseñas no coinciden');
      return;
    }
    this.loading.set(true);
    const res = await this.auth.setPassword(this.password);
    this.loading.set(false);
    if (!res.success) {
      this.error.set(res.error || 'No se pudo guardar la contraseña');
      return;
    }
    this.success.set(true);
    // Redirect to login so user can sign in with their new password
    setTimeout(() => this.router.navigate(['/login']), 900);
  }

  skip() {
    this.router.navigate(['/login']);
  }
}
