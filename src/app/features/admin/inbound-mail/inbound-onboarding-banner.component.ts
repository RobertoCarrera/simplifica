import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { InboundMailService, InboundMailConfig } from './inbound-mail.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Banner that shows up at the top of the app when the user's company has
 * a verified domain but inbound mail is not yet active.
 *
 * - Owners see actionable "Configurar" button.
 * - Superadmins see a passive "X empresas necesitan atención" with link.
 *
 * Drop into any layout: <app-inbound-onboarding-banner />
 */
@Component({
  selector: 'app-inbound-onboarding-banner',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoModule],
  template: `
    @if (isAllowedRole() && needsAttention().length > 0 && !dismissed()) {
      <div class="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-exclamation-triangle text-amber-600"></i>
          <span>
            <strong>{{ needsAttention().length }}</strong>
            {{ needsAttention().length === 1
              ? ('inbound.banner.single' | transloco)
              : ('inbound.banner.multi' | transloco) }}
            @if (needsAttentionDomains()) {
              <span class="text-gray-600">({{ needsAttentionDomains() }})</span>
            }
          </span>
        </div>
        <div class="flex items-center gap-2">
          @if (isSuperAdmin()) {
            <a
              routerLink="/admin/inbound-mail"
              class="text-blue-600 hover:underline"
            >
              {{ 'inbound.banner.openAdmin' | transloco }}
            </a>
          } @else {
            <a
              routerLink="/settings/inbound-mail"
              class="text-blue-600 hover:underline"
            >
              {{ 'inbound.banner.configure' | transloco }}
            </a>
          }
          <button
            class="text-gray-400 hover:text-gray-600"
            (click)="dismiss()"
            [attr.aria-label]="'inbound.banner.dismiss' | transloco"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    }
  `,
})
export class InboundOnboardingBannerComponent implements OnInit {
  private service = inject(InboundMailService);
  private auth = inject(AuthService);

  configs = signal<InboundMailConfig[]>([]);
  dismissed = signal(false);

  needsAttention = computed(() =>
    this.configs().filter(c =>
      c.status === 'pending' ||
      c.status === 'verifying' ||
      c.status === 'failed'
    )
  );

  needsAttentionDomains = computed(() =>
    this.needsAttention().map(c => c.domain).join(', ')
  );

  /**
   * Banner visibility — only shown to users who can act on it:
   * owner, super_admin, or supervisor.
   */
  private allowedRoles = new Set(['owner', 'super_admin', 'supervisor']);

  isAllowedRole = computed(() => {
    const u = this.auth.userProfileSignal();
    const role = this.auth.userRole();
    if (this.allowedRoles.has(role)) return true;
    return !!u?.is_super_admin || (u as any)?.app_role?.name === 'super_admin';
  });

  isSuperAdmin = computed(() => {
    const u = this.auth.userProfileSignal();
    return !!u?.is_super_admin
      || (u as any)?.app_role?.name === 'super_admin'
      || this.auth.userRole() === 'super_admin';
  });

  async ngOnInit() {
    try {
      const list = await this.service.listMyCompany();
      this.configs.set(list);
    } catch {
      // Silent: don't break the layout if this fails.
    }
  }

  dismiss() {
    this.dismissed.set(true);
  }
}
