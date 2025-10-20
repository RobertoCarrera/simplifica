import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-portal-invite',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="max-w-lg mx-auto mt-16 p-6 bg-white rounded-xl shadow">
    <h1 class="text-xl font-semibold mb-4">Aceptando invitación…</h1>
    <p *ngIf="loading">Procesando tu invitación, por favor espera…</p>
    <p *ngIf="error" class="text-red-600">{{ error }}</p>
    <p *ngIf="success" class="text-green-700">¡Invitación aceptada! Redirigiendo…</p>
  </div>
  `
})
export class PortalInviteComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  loading = true;
  success = false;
  error: string | null = null;

  constructor() {
    this.handle();
  }

  private async handle() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.loading = false;
      this.error = 'Falta el token de invitación';
      return;
    }
    const res = await this.auth.acceptInvitation(token);
    this.loading = false;
    if (!res.success) {
      this.error = res.error || 'No se pudo aceptar la invitación';
      return;
    }
    this.success = true;
    setTimeout(() => this.router.navigate(['/portal']), 800);
  }
}
