import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { EmailConfigService } from './email-config.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './oauth-callback.component.html',
  styleUrls: ['./oauth-callback.component.scss'],
})
export class OAuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private configService = inject(EmailConfigService) as any;
  private toast = inject(ToastService);

  processing = signal(true);
  errorMessage = signal('');

  async ngOnInit() {
    const code = this.route.snapshot.queryParamMap.get('code') ?? '';
    const state = this.route.snapshot.queryParamMap.get('state') ?? '';
    const accountId = this.route.snapshot.queryParamMap.get('account_id') ?? '';

    if (!code || !state || !accountId) {
      this.handleError('Faltan parámetros OAuth — por favor intenta de nuevo');
      return;
    }

    // C-4: CSRF state validation — compare the returned state against a nonce
    // stored in sessionStorage by openGoogleOAuthPopup() before the OAuth flow
    // started. Without this, an attacker could craft a URL with their own auth
    // code and trick a logged-in admin into linking the attacker's Google
    // account to the victim's email account.
    const csrfValid = this.configService.validateCsrfNonce(state, accountId);
    if (!csrfValid) {
      this.handleError('Token CSRF inválido o expirado. Por favor, intenta el flujo OAuth de nuevo desde la página de configuración.');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.configService.handleOAuthCallback(code, state, accountId).subscribe({
          next: () => {
            const origin = window.opener?.location?.origin ?? window.location.origin;
            window.opener?.postMessage(
              { type: 'google_oauth_success', accountId },
              origin
            );
            window.close();
            resolve();
          },
          error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
        });
      });
    } catch (err: unknown) {
      this.handleError(err instanceof Error ? err.message : 'Error en el callback OAuth');
    }
  }

  private handleError(message: string) {
    this.processing.set(false);
    this.errorMessage.set(message);
    const origin = window.opener?.location?.origin ?? window.location.origin;
    window.opener?.postMessage(
      { type: 'google_oauth_error', message },
      origin
    );
    // Close window after a short delay so user can see the error
    setTimeout(() => window.close(), 3000);
  }
}