import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  Signal,
  WritableSignal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../../../services/auth.service';
import {
  SupabaseModulesService,
} from '../../../../../services/supabase-modules.service';
import { AnalyticsService } from '../../../../../services/analytics.service';

/**
 * Sidebar footer block: user profile (avatar + name + role + professional badge)
 * plus the company / professional-profile switcher dropdown and the logout button.
 *
 * Extracted from responsive-sidebar.component.html (was lines 171–339).
 *
 * Design contract (PR #3 of sidebar refactor):
 *  - Parent owns the OPEN/CLOSED state of the switcher dropdown. The parent
 *    exposes its local `isSwitcherOpen` signal via an event listener
 *    (`window.open-profile-switcher`) — that listener stays in the parent.
 *    The child receives the SAME signal reference via `@Input() Signal<boolean>`
 *    so mutations done here (toggle, select, exit) propagate back to the parent
 *    and the global open-profile-switcher trigger still works.
 *  - `isCollapsed` is forwarded from the parent's SidebarStateService so the
 *    avatar/name block can be hidden when the sidebar is collapsed (only the
 *    logout icon stays visible, matching original behaviour).
 *  - `currentCompanyName` is forwarded because the parent already computes it
 *    (also used by the logo block). Avoid duplicating the transloco + membership
 *    resolution logic in two places.
 *
 * The child injects AuthService, SupabaseModulesService, AnalyticsService,
 * Router and TranslocoService locally — these were all user-profile-only
 * concerns in the parent and are no longer needed there.
 */
@Component({
  selector: 'app-sidebar-user-profile',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.collapsed]': 'isCollapsed()',
  },
  templateUrl: './sidebar-user-profile.component.html',
  styleUrls: ['./sidebar-user-profile.component.scss'],
})
export class SidebarUserProfileComponent {
  @Input({ required: true }) isCollapsed!: Signal<boolean>;
  @Input({ required: true }) currentCompanyName!: Signal<string>;
  /** Mutable signal from the parent. The window 'open-profile-switcher'
   *  listener (parent) and the toggle/select/exit handlers (this child) both
   *  mutate it; consumers in either component observe a single source of truth.
   *  Typed as `WritableSignal` so `.set()` / `.update()` are usable without
   *  casting — the runtime object IS writable; only the interface is. */
  @Input({ required: true }) isSwitcherOpen!: WritableSignal<boolean>;

  // Optional outputs — kept for future cross-cutting needs (analytics, etc.).
  // Parent does not currently consume them.
  @Output() switcherToggled = new EventEmitter<void>();
  @Output() closeSwitcher = new EventEmitter<void>();

  private authService = inject(AuthService);
  private translocoService = inject(TranslocoService);
  private modulesService = inject(SupabaseModulesService);
  private analyticsService = inject(AnalyticsService);
  private router = inject(Router);

  // Reactive language signal — keeps getRoleDisplayName reactive to lang changes
  // (the role names are looked up synchronously via translate(), so we read this
  // inside the method body to register a dependency).
  private currentLang = toSignal(this.translocoService.langChanges$, {
    initialValue: this.translocoService.getActiveLang(),
  });

  // Reactive roles translations — used by userRoleDisplay. Reactive to load
  // and lang change; avoids "Missing translation" warnings during bootstrap
  // when async translation files haven't fetched yet.
  private _rolesTranslations = toSignal(
    this.translocoService.selectTranslateObject('roles'),
    { initialValue: null as Record<string, string> | null },
  );

  // Lucide icons are registered via the parent ResponsiveSidebarComponent's
  // LUCIDE_ICONS provider and inherited through the injector hierarchy. We
  // resolve them by `name="..."` in the template below.

  // ---------- Switcher state ----------
  toggleSwitcher() {
    // Mutating the parent's signal instance directly is intentional — both
    // the parent (window listener) and this child (toggle/select/exit)
    // observe a single source of truth without round-tripping through
    // outputs/state.
    this.isSwitcherOpen.update((v: boolean) => !v);
    this.switcherToggled.emit();
  }

  availableCompanies = computed(() => {
    const professionalCompanyIds = new Set(
      this.authService.linkedProfessionals().map((p) => p.company_id),
    );
    const uniqueMap = new Map();
    this.authService.companyMemberships().forEach((m) => {
      // Only hide from "CAMBIAR EMPRESA" if role is purely 'professional' AND
      // has a linked profile. Owners/admins/members keep the company entry
      // even if they also have a professional profile.
      if (professionalCompanyIds.has(m.company_id) && m.role === 'professional') return;
      if (!uniqueMap.has(m.company_id)) {
        uniqueMap.set(m.company_id, {
          id: m.company_id,
          name: m.company?.name || 'Empresa Sin Nombre',
          role: m.role,
          isCurrent: m.company_id === this.authService.currentCompanyId(),
        });
      }
    });
    return Array.from(uniqueMap.values());
  });

  selectCompany(companyId: string) {
    this.modulesService.clearCache();
    this.analyticsService.clearSignals();
    this.authService.switchCompany(companyId);
    this._closeSwitcher();
  }

  // ---------- Professional mode ----------
  readonly linkedProfessionals = computed(() => this.authService.linkedProfessionals());
  readonly isInProfessionalMode = computed(() => this.authService.isInProfessionalMode());
  readonly activeProfessionalId = computed(() => this.authService.activeProfessionalId());

  /** True if the user is owner of at least one company in `availableCompanies()`. */
  readonly isOwnerOfAnyCompany = computed(() =>
    this.availableCompanies().some((c) => c.role === 'owner'),
  );

  selectProfessionalProfile(professionalId: string) {
    this.authService.switchToProfessionalProfile(professionalId);
    this._closeSwitcher();
  }

  exitProfessionalMode() {
    this.authService.exitProfessionalMode();
    this._closeSwitcher();
  }

  // ---------- Favorites ----------
  readonly favoriteCompanyId = computed(() => this.authService.favoriteCompanyId());
  readonly favoriteProfessionalId = computed(() => this.authService.favoriteProfessionalId());

  toggleFavoriteCompany(event: Event, companyId: string) {
    event.stopPropagation(); // don't also trigger selectCompany
    const current = this.authService.favoriteCompanyId();
    if (current === companyId) {
      this.authService.setFavoriteCompany(null);
    } else {
      this.authService.setFavoriteCompany(companyId);
    }
  }

  toggleFavoriteProfessional(event: Event, professionalId: string) {
    event.stopPropagation(); // don't also trigger selectProfessionalProfile
    const current = this.authService.favoriteProfessionalId();
    if (current === professionalId) {
      this.authService.setFavoriteProfessional(null);
    } else {
      this.authService.setFavoriteProfessional(professionalId);
    }
  }

  // ---------- Display helpers ----------
  // Reactive role display — for the userRoleDisplay() computed used in template.
  userRoleDisplay = computed(() => {
    const roles = this._rolesTranslations();
    const profile = this.authService.userProfileSignal();
    const role = profile?.role || 'member';

    // Translations not yet loaded — return readable Spanish fallback, no warning
    if (!roles) {
      if (profile?.is_super_admin) return 'Super Admin';
      switch (role) {
        case 'super_admin': return 'Super Admin';
        case 'owner':       return 'Propietario';
        case 'admin':       return 'Administrador';
        case 'member':      return 'Miembro';
        case 'client':      return 'Cliente';
        case 'none':        return 'Sin acceso';
        default:            return role;
      }
    }

    if (profile?.is_super_admin) return roles['superAdmin'];
    switch (role) {
      case 'super_admin': return roles['superAdmin'];
      case 'owner':       return roles['propietario'];
      case 'admin':       return roles['administrador'];
      case 'member':      return roles['miembro'];
      case 'client':      return roles['cliente'];
      case 'none':        return roles['sinAcceso'];
      default:            return role;
    }
  });

  getRoleDisplayName(role: string): string {
    // Read currentLang to create reactive dependency on language changes
    this.currentLang();
    switch (role) {
      case 'super_admin':
        return this.translocoService.translate('roles.superAdmin');
      case 'owner':
        return this.translocoService.translate('roles.propietario');
      case 'admin':
        return this.translocoService.translate('roles.administrador');
      case 'supervisor':
        return this.translocoService.translate('roles.supervisor');
      case 'member':
        return this.translocoService.translate('roles.miembro');
      case 'client':
        return this.translocoService.translate('roles.cliente');
      case 'professional':
        return this.translocoService.translate('roles.profesional');
      case 'none':
        return this.translocoService.translate('roles.sinAcceso');
      default:
        return role;
    }
  }

  getUserInitial(): string {
    const fullName = this.authService.userProfileSignal()?.full_name;
    return fullName ? fullName.charAt(0).toUpperCase() : 'U';
  }

  getUserDisplayName(): string {
    return (
      this.authService.userProfileSignal()?.full_name ||
      this.translocoService.translate('shared.usuario')
    );
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error durante logout:', error);
    }
  }

  /** Close the switcher. Called by handlers that perform an action and dismiss
   *  the dropdown. Goes through the signal ref so the parent's listener also
   *  observes the close. */
  private _closeSwitcher() {
    this.isSwitcherOpen.set(false);
    this.closeSwitcher.emit();
  }
}
