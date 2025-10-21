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
    // Handle Supabase magic link tokens if present in URL (hash or query)
    try {
      const rawHash = window.location.hash;
      const fragment = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;
      const hashParams = new URLSearchParams(fragment);
      const queryParams = new URLSearchParams(window.location.search);

      let accessToken = hashParams.get('access_token') || queryParams.get('access_token');
      let refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');

      if (!accessToken && fragment.includes('access_token=')) {
        const p = fragment.split('&').find(s => s.startsWith('access_token='));
        if (p) accessToken = p.split('=')[1];
      }
      if (!refreshToken && fragment.includes('refresh_token=')) {
        const p = fragment.split('&').find(s => s.startsWith('refresh_token='));
        if (p) refreshToken = p.split('=')[1];
      }

      if (accessToken && refreshToken) {
        await this.auth.client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        // Clean hash to avoid reprocessing
        history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    } catch (e) {
      // non-fatal
    }

    let token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      // Some providers may append extra params in the hash; try to parse token there as well
      const fragment = (window.location.hash || '').replace(/^#/, '');
      const hashParams = new URLSearchParams(fragment);
      token = hashParams.get('token') || token;
    }
    if (!token) {
      this.loading = false;
      this.error = 'Falta el token de invitación';
      return;
    }
    // Ensure we have a current user after magic link setSession
    const { data: { user } } = await this.auth.client.auth.getUser();
    if (!user) {
      // try refresh once
      try { await this.auth.client.auth.refreshSession(); } catch {}
    }

    let res = await this.auth.acceptInvitation(token);
    if (!res.success && (res.error?.includes('Unauthorized') || res.error?.includes('Invalid') )) {
      await new Promise(r => setTimeout(r, 500));
      res = await this.auth.acceptInvitation(token);
    }
    this.loading = false;
    if (!res.success) {
      this.error = res.error || 'No se pudo aceptar la invitación';
      return;
    }
    this.success = true;
    // Tras aceptar, invita a configurar contraseña del cliente
    setTimeout(() => this.router.navigate(['/client/set-password']), 800);
  }
}
