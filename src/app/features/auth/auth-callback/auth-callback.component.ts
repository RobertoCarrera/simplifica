import { Component, OnInit, inject, NgZone } from '@angular/core';
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
        <p class="small">Probablemente necesites habilitar "Store token in database" en Supabase.</p>
        <pre class="debug-info">{{ debugInfo }}</pre>
      </div>

      <div *ngIf="success" class="success-box">
        <h3>¡Conectado!</h3>
        <p>Tu cuenta de Google ha sido verificada.</p>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #f5f5f5;
      font-family: 'Inter', sans-serif;
    }
    .spinner {
      border: 4px solid rgba(0, 0, 0, 0.1);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border-left-color: #09f;
      animation: spin 1s ease infinite;
    }
    .error-box {
      background: #fee2e2;
      color: #991b1b;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      max-width: 90%;
    }
    .success-box {
      background: #dcfce7;
      color: #166534;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .debug-info {
        font-size: 10px;
        text-align: left;
        margin-top: 10px;
        white-space: pre-wrap;
        opacity: 0.7;
    }
    .small { font-size: 12px; margin-top: 5px; }
  `]
})
export class AuthCallbackComponent implements OnInit {
  loading = true;
  success = false;
  error: string | null = null;
  debugInfo = '';

  private supabase = inject(SupabaseClientService);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  ngOnInit() {
    this.handleAuthCallback();
  }

  async handleAuthCallback() {
    console.log('AuthCallback: Starting...');

    // 2. Listen for Auth State Change (Most reliable for OAuth redirect)
    // We do NOT check initialSession here because it usually comes from LocalStorage and lacks the provider_token.
    // We wait for the library to process the URL and emit the event.
    const { data: { subscription } } = this.supabase.instance.auth.onAuthStateChange(async (event, session) => {
      console.log(`AuthCallback: Auth State Change Event: ${event}`, session?.user?.id);

      this.ngZone.run(async () => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || (event === 'INITIAL_SESSION' && session)) {
          // We only process if we haven't succeeded yet. 
          // We ALLOW processing even if there was a previous error (retrying with new event).
          if (!this.success) {
            await this.processSession(session);
          }
        }
      });
    });

    // Fallback: If no event fires in 5 seconds (e.g. already signed in), force check
    setTimeout(() => {
      this.ngZone.run(async () => {
        if (!this.success) {
          console.log('AuthCallback: Timeout fallback checking...');
          const { data } = await this.supabase.instance.auth.getSession();
          if (data.session) {
            await this.processSession(data.session);
          } else {
            if (!this.error) { // Only set error if we haven't already
              this.error = 'No se detectó ninguna sesión activa. Intenta conectar de nuevo.';
            }
            this.loading = false;
          }
        }
      });
    }, 5000);
  }

  async processSession(session: any) {
    if (this.success) return; // Already done

    // Clear any previous error if we are retrying
    this.error = null;
    this.loading = true;

    try {
      console.log('AuthCallback: Processing session...', session);

      // 1. RPC FIRST STRATEGY
      // We assume the client might NOT have the token, so we ask the DB first.
      console.log('AuthCallback: Attempting RPC token fetch (primary strategy)...');
      let providerToken: string | null = null;
      let refreshToken: string | null = null;

      const { data: rpcData, error: rpcError } = await this.supabase.instance
        .rpc('get_provider_tokens', { provider_name: 'google' });

      if (rpcData && rpcData.access_token) {
        console.log('RPC Token Fetch SUCCESS!', rpcData);
        providerToken = rpcData.access_token;
        if (rpcData.refresh_token) refreshToken = rpcData.refresh_token;
      } else {
        console.warn('RPC Token Fetch failed or returned empty:', rpcError || 'No tokens');
      }

      // 2. FALLBACK: Check Client Session/URL
      if (!providerToken) {
        console.log('AuthCallback: RPC failed, checking client session/URL as fallback...');
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        providerToken = urlParams.get('provider_token') || hashParams.get('provider_token') || session.provider_token || session.user?.app_metadata?.['provider_token'];
        refreshToken = urlParams.get('provider_refresh_token') || hashParams.get('provider_refresh_token') || session.provider_refresh_token || session.user?.app_metadata?.['provider_refresh_token'];
      }

      // Debug Info Update
      this.debugInfo = JSON.stringify({
        strategy: 'RPC-First',
        rpcResult: rpcData ? 'FOUND' : 'MISSING',
        clientValues: {
          sessionToken: session.provider_token ? 'YES' : 'NO',
          metaToken: session.user?.app_metadata?.['provider_token'] ? 'YES' : 'NO'
        }
      }, null, 2);

      // 3. VALIDATION
      if (!providerToken) {
        this.error = 'No se encontraron tokens ni en la base de datos ni en la sesión. Asegúrate de que "Store tokens" esté activo en Supabase.';
        this.loading = false;
        return;
      }

      if (typeof providerToken === 'string' && providerToken.startsWith('ey')) {
        this.error = 'Error crítico: Token inválido (JWT Supabase). Revisa la configuración del proveedor.';
        this.loading = false;
        return;
      }

      // 4. SAVE INTEGRATION
      const identity = session.user.identities?.find((i: any) => i.provider === 'google');
      const providerEmail = identity?.identity_data?.email || session.user.email;
      const companyId = localStorage.getItem('pending_integration_company_id');

      const { data: publicUser, error: userError } = await this.supabase.instance
        .from('users')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .single();

      if (userError || !publicUser) {
        this.error = 'No se encontró tu perfil de usuario (public.users).';
        this.loading = false;
        return;
      }

      const upsertData: any = {
        user_id: publicUser.id,
        provider: 'google_calendar',
        access_token: providerToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        metadata: identity?.identity_data || {},
        updated_at: new Date().toISOString(),
        provider_email: providerEmail
      };

      if (companyId) {
        upsertData.company_id = companyId;
      }

      // Cleanup
      localStorage.removeItem('pending_integration_company_id');

      const { error: insertError } = await this.supabase.instance
        .from('integrations')
        .upsert(upsertData, { onConflict: 'user_id,provider' });

      if (insertError) {
        this.error = `Error guardando en BD: ${insertError.message}`;
        this.loading = false;
      } else {
        this.success = true;
        this.error = null; // Ensure no error is shown
        this.loading = false;

        if (window.opener) {
          window.opener.postMessage({ type: 'GOOGLE_CONNECTED', success: true }, window.location.origin);
          setTimeout(() => window.close(), 1500);
        } else {
          setTimeout(() => {
            this.router.navigate(['/configuracion']);
          }, 1500);
        }
      }

    } catch (err: any) {
      this.error = err.message;
      this.loading = false;
    }
  }
}
