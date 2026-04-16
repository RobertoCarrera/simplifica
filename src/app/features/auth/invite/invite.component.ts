import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { SupabaseService } from '../../../services/supabase.service';

interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  company_id: string;
  company_name: string;
  inviter_email: string;
  message: string | null;
  token?: string;
}

type PageState = 'loading' | 'details' | 'accepting' | 'rejecting' | 'success' | 'rejected' | 'error';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900/40 px-4 py-8">
      <div class="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-slate-700">

        <!-- Header -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 mb-4">
            <svg class="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">Invitación</h1>
        </div>

        <!-- Loading -->
        @if (state() === 'loading') {
          <div class="text-center py-8">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400 text-sm">Cargando invitación...</p>
          </div>
        }

        <!-- Error -->
        @if (state() === 'error') {
          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p class="text-red-800 dark:text-red-300 text-sm">{{ errorMessage() }}</p>
          </div>
          <button
            (click)="goHome()"
            class="w-full py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors text-sm"
          >
            Volver al inicio
          </button>
        }

        <!-- Invitation Details -->
        @if (state() === 'details' && invitation()) {
          <div class="space-y-6">
            <div class="text-center space-y-3">
              <p class="text-sm text-gray-500 dark:text-gray-400">Has sido invitado a unirte a:</p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">{{ invitation()?.company_name || 'Simplifica' }}</p>
              <div class="flex items-center justify-center gap-2">
                <span class="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold">
                  {{ getRoleLabel(invitation()?.role || '') }}
                </span>
              </div>
              @if (invitation()?.inviter_email) {
                <p class="text-xs text-gray-400 dark:text-gray-500">Invitado por {{ invitation()?.inviter_email }}</p>
              }
              @if (invitation()?.message) {
                <div class="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-300 italic text-left">
                  "{{ invitation()?.message }}"
                </div>
              }
            </div>

            @if (acceptError()) {
              <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p class="text-red-800 dark:text-red-300 text-sm">{{ acceptError() }}</p>
              </div>
            }

            <!-- Aviso RGPD Art. 13 — informar al interesado antes de recoger sus datos -->
            <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
              <p class="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                <svg class="inline w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Información sobre tratamiento de datos (Art. 13 RGPD)
              </p>
              <ul class="text-blue-700 dark:text-blue-400 space-y-1 text-xs list-disc list-inside">
                <li><strong>Responsable:</strong> {{ invitation()?.company_name || 'Simplifica' }}</li>
                <li><strong>Finalidad:</strong> Gestión de acceso y prestación de servicios internos</li>
                <li><strong>Base legal:</strong> Relación contractual / laboral (Art. 6.1.b RGPD)</li>
                <li><strong>Derechos:</strong> Acceso, rectificación, supresión, portabilidad y oposición</li>
              </ul>
              <label class="flex items-start gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  [(ngModel)]="privacyAcknowledged"
                  class="mt-0.5 accent-indigo-600"
                />
                <span class="text-xs text-blue-800 dark:text-blue-300">
                  He leído y entendido cómo se tratarán mis datos personales.
                </span>
              </label>
            </div>

            <div class="flex gap-3">
              <button
                (click)="reject()"
                class="flex-1 py-3 px-4 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm"
              >
                Rechazar
              </button>
              <button
                (click)="accept()"
                [disabled]="!privacyAcknowledged"
                class="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aceptar
              </button>
            </div>
          </div>
        }

        <!-- Accepting -->
        @if (state() === 'accepting') {
          <div class="text-center py-8">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400 text-sm">Aceptando invitación...</p>
          </div>
        }

        <!-- Rejecting -->
        @if (state() === 'rejecting') {
          <div class="text-center py-8">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-400 mx-auto mb-4"></div>
            <p class="text-gray-500 dark:text-gray-400 text-sm">Rechazando invitación...</p>
          </div>
        }

        <!-- Success -->
        @if (state() === 'success') {
          <div class="text-center space-y-4">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30">
              <svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p class="text-lg font-semibold text-gray-900 dark:text-white">¡Invitación aceptada!</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Ahora sos parte de <strong>{{ successCompanyName() }}</strong> como <strong>{{ getRoleLabel(successRole()) }}</strong>.
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500">Redirigiendo al inicio...</p>
          </div>
        }

        <!-- Rejected -->
        @if (state() === 'rejected') {
          <div class="text-center space-y-4">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-700">
              <svg class="w-8 h-8 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </div>
            <p class="text-base font-medium text-gray-700 dark:text-gray-300">Invitación rechazada</p>
            <button
              (click)="goHome()"
              class="w-full py-3 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors text-sm"
            >
              Volver al inicio
            </button>
          </div>
        }

      </div>
    </div>
  `,
})
export class InviteComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private supabaseService = inject(SupabaseService);

  state = signal<PageState>('loading');
  invitation = signal<InvitationDetails | null>(null);
  errorMessage = signal<string>('');
  acceptError = signal<string>('');
  successCompanyName = signal<string>('');
  successRole = signal<string>('');
  privacyAcknowledged = false;

  private token: string | null = null;
  // For magic-link flow: user lands on /invite (no token in URL) but is already logged in
  private pendingInvitationForEmail: InvitationDetails | null = null;

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      owner: 'Propietario',
      admin: 'Administrador',
      member: 'Miembro',
      professional: 'Profesional',
      agent: 'Agente',
      client: 'Cliente',
    };
    return labels[role] || role;
  }

  async ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token');

    // No token in URL — check if user is already logged in (magic-link flow from auth-callback)
    if (!this.token) {
      const { data: { user } } = await this.supabaseService.db.auth.getUser();
      if (user?.email) {
        // Try to find a pending invitation for this user's email
        try {
          const { data: rpcData } = await (this.supabaseService.db as any)
            .rpc('get_pending_invitation_by_email', { p_email: user.email.toLowerCase() });
          const result = rpcData as { success: boolean; invitation?: InvitationDetails } | null;
          if (result?.success && result.invitation) {
            const inv = result.invitation as InvitationDetails;
            if (inv.status === 'pending' && new Date(inv.expires_at) > new Date()) {
              this.pendingInvitationForEmail = inv;
              this.invitation.set(inv);
              this.state.set('details');
              return;
            }
          }
        } catch {
          // Non-blocking: fall through to error
        }
      }
      this.state.set('error');
      this.errorMessage.set(
        user
          ? 'No tienes ninguna invitación pendiente.'
          : 'No se encontró el token de invitación en la URL. Accede desde el enlace del correo electrónico o inicia sesión.'
      );
      return;
    }

    try {
      const { data, error } = await (this.supabaseService.db as any)
        .rpc('get_invitation_by_token', { p_token: this.token });

      const result = data as { success: boolean; error?: string; invitation?: InvitationDetails } | null;

      if (error || !result?.success) {
        this.state.set('error');
        this.errorMessage.set(result?.error || 'La invitación no es válida o ha expirado.');
        return;
      }

      const inv = result.invitation as InvitationDetails;

      // Check expiry client-side as well
      if (inv.status !== 'pending') {
        this.state.set('error');
        this.errorMessage.set(
          inv.status === 'accepted' ? 'Esta invitación ya fue aceptada.' :
          inv.status === 'rejected' ? 'Esta invitación fue rechazada.' :
          'Esta invitación ya no está activa.'
        );
        return;
      }

      if (new Date(inv.expires_at) < new Date()) {
        this.state.set('error');
        this.errorMessage.set('Esta invitación ha expirado.');
        return;
      }

      this.invitation.set(inv);
      this.state.set('details');
    } catch (e: any) {
      this.state.set('error');
      this.errorMessage.set('Error al cargar la invitación. Intentá de nuevo.');
    }
  }

  async accept() {
    // Use token from URL, or from the pending invitation found via email (magic-link flow)
    const tokenToUse = this.token || this.pendingInvitationForEmail?.token;
    if (!tokenToUse) {
      // User not logged in and no pending invitation found — redirect to login
      // with return URL to come back here after authentication
      const returnTo = this.router.createUrlTree(['/invite'], {
        queryParams: this.token ? { token: this.token } : undefined
      });
      this.router.navigate(['/login'], { queryParams: { returnUrl: returnTo.toString() } });
      return;
    }
    this.acceptError.set('');
    this.state.set('accepting');

    const result = await this.authService.acceptInvitation(tokenToUse);

    if (!result.success) {
      this.state.set('details');
      this.acceptError.set(result.error || 'No se pudo aceptar la invitación.');
      return;
    }

    this.successCompanyName.set(result.company?.name || this.invitation()?.company_name || '');
    this.successRole.set(result.role || this.invitation()?.role || '');
    this.state.set('success');

    setTimeout(() => this.router.navigate(['/inicio'], { replaceUrl: true }), 2500);
  }

  async reject() {
    if (!this.token) return;
    this.state.set('rejecting');

    try {
      const { data: { user } } = await this.supabaseService.db.auth.getUser();
      await (this.supabaseService.db as any)
        .rpc('reject_company_invitation', {
          p_token: this.token,
          p_user_id: user?.id,
        });
    } catch {
      this.state.set('details');
      this.acceptError.set('Error al rechazar la invitación. Intentá de nuevo.');
      return;
    }

    this.state.set('rejected');
  }

  goHome() {
    this.router.navigate(['/inicio'], { replaceUrl: true });
  }
}
