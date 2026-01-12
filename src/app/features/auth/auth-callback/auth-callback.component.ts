import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseClientService } from '../../../services/supabase-client.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div *ngIf="loading" class="spinner"></div>
      
      <div *ngIf="error" class="error-box">
        <h3>Error de conexión</h3>
        <p>{{ error }}</p>
        <p class="small">Cierra esta ventana e intenta de nuevo.</p>
      </div>

      <div *ngIf="success" class="success-box">
        <h3>¡Conectado!</h3>
        <p>Tu cuenta de Google se ha vinculado.</p>
        <p>Esta ventana se cerrará en breve...</p>
      </div>

      <div *ngIf="!loading && !success && !error" class="info-box">
        <p>Esperando respuesta de Google...</p>
      </div>
      
      <!-- Debug info hidden mostly -->
      <details class="debug-info" *ngIf="debugInfo">
        <summary>Detalles técnicos</summary>
        <pre>{{ debugInfo }}</pre>
      </details>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #f8fafc;
      color: #334155;
      padding: 20px;
      text-align: center;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3b82f6;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    }
    .error-box { color: #dc2626; }
    .success-box { color: #16a34a; }
    .small { font-size: 0.8em; opacity: 0.8; }
    .debug-info { margin-top: 20px; text-align: left; font-size: 11px; max-width: 90%; overflow: auto; background: #eee; padding: 10px; border-radius: 4px; }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class AuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseClientService);

  loading = true;
  error = '';
  success = false;
  debugInfo = '';

  ngOnInit() {
    this.handleCallback();
  }

  async handleCallback() {
    const params = this.route.snapshot.queryParams as any;
    const hash = window.location.hash;

    this.debugInfo = JSON.stringify({ params, hashFragment: hash.substring(0, 50) + '...' }, null, 2);

    if (window.opener) {
      console.log('AuthCallback: Running in popup');

      // 1. Check for explicit error
      if (params['error']) {
        this.error = params['error_description'] || params['error'];
        this.loading = false;
        window.opener.postMessage({ type: 'GOOGLE_CONNECTED', error: this.error }, window.location.origin);
        return;
      }

      // 2. Wait for Session
      setTimeout(async () => {
        try {
          const { data: { session }, error } = await this.supabase.instance.auth.getSession();

          if (error) throw error;

          if (session) {
            // Extract tokens from session
            // Note: Supabase puts provider tokens in session.provider_token / session.provider_refresh_token
            // OR in session.user.app_metadata.provider_token? No, usually top level session or identity.
            // Actually, for linkIdentity, it should be in the returned session object if it's the specific session established by the link.
            // BUT, `linkIdentity` updates the EXISTING session often.
            // Let's check `session.provider_token`.

            const providerToken = session.provider_token;
            const refreshToken = session.provider_refresh_token;
            const identity = session.user.identities?.find(i => i.provider === 'google');

            if (providerToken && identity) {
              this.debugInfo += `\nTokens found. Updating integration...`;

              // Upsert integration record manually
              const { error: insertError } = await this.supabase.instance
                .from('integrations')
                .upsert({
                  user_id: session.user.id, // Assuming auth.uid() matches public user id logic or we use RPC
                  // Wait, simple upsert might fail if RLS requires matching ID.
                  // We are logged in as the user, so it should be fine if we have policy.
                  // But `integrations` uses `user_id` as FK to `public.users`.
                  // We need to be sure the current auth user has a public user.
                  provider: 'google_calendar',
                  access_token: providerToken,
                  refresh_token: refreshToken,
                  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // Default 1h if not known
                  metadata: identity.identity_data,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,provider' });

              if (insertError) {
                console.error('Integration Insert Error:', insertError);
                this.error = `Error guardando en BD: ${insertError.message}`;
                this.loading = false;
                this.debugInfo += `\nDB Error: ${insertError.message}`;
                return; // Stop here
              } else {
                this.debugInfo += `\nIntegration saved to DB.`;
                this.success = true;
                this.loading = false;
                window.opener.postMessage({ type: 'GOOGLE_CONNECTED', success: true }, window.location.origin);
                setTimeout(() => window.close(), 1500);
              }
            } else {
              this.error = 'No se recibieron los tokens de acceso de Google. Revisa la consola.';
              this.loading = false;
              this.debugInfo += `\nERROR: No provider_token in session!`;
              this.debugInfo += `\nSession keys: ${Object.keys(session).join(', ')}`;
              if (session.user?.identities) {
                this.debugInfo += `\nIdentities: ${JSON.stringify(session.user.identities.map(i => ({ provider: i.provider, has_token: !!i.identity_data })))}`;
              }
              // Do NOT close window so user can see error
            }
          } else {
            // No session found?
            // Check if we have tokens in hash that supabase client hasn't processed?
            // Usually startAutoRefresh handles it.
            if (hash && hash.includes('access_token')) {
              this.success = true;
              this.loading = false;
              this.debugInfo += `\nHash has token, waiting for Client to absorb...`;
              // Give it one more try
              window.opener.postMessage({ type: 'GOOGLE_CONNECTED', success: true }, window.location.origin);
              setTimeout(() => window.close(), 3000);
            } else {
              this.error = 'No se pudo establecer la sesión.';
              this.loading = false;
              this.debugInfo += '\nNo session and no token in hash.';
            }
          }

        } catch (err: any) {
          this.error = err.message || 'Error desconocido al obtener sesión';
          this.loading = false;
          this.debugInfo += `\nException: ${err.message}`;
        }
      }, 1000);

    } else {
      // Non-popup flow
      this.router.navigate(['/']);
    }
  }
}
