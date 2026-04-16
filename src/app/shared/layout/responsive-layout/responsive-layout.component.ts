import { Component, inject, signal, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ResponsiveSidebarComponent } from '../responsive-sidebar/responsive-sidebar.component';
import { MobileBottomNavComponent } from '../mobile-bottom-nav/mobile-bottom-nav.component';
import { PWAService } from '../../../services/pwa.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { AuthService } from '../../../services/auth.service';
@Component({
  selector: 'app-responsive-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, ResponsiveSidebarComponent, MobileBottomNavComponent],
  template: `
    <!-- Layout sin sidebar para login/register O usuarios no autenticados -->
    <!-- NOTE: Only show the blank loading screen on *private* routes.
         On public routes (login, invite, etc.) the router-outlet must never be
         destroyed by a loading state change, because setCurrentUser() toggles
         loadingSubject true→false while async, which would destroy LoginComponent
         mid-flight and cause GuestGuard to re-run — potentially creating an
         infinite /login ↔ /inicio redirect loop that crashes the browser. -->
    @if ((isLoading | async) && !isPublicRoute()) {
      <div class="h-screen w-full bg-gray-50 dark:bg-gray-900 transition-colors duration-200"></div>
    } @else if (isPublicRoute() || !isAuthenticated()) {
      <div class="min-h-screen">
        <router-outlet></router-outlet>
      </div>
    } @else {
      <!-- Layout normal con sidebar para usuarios autenticados -->
      <div class="h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">

        <!-- Sidebar -->
        <app-responsive-sidebar></app-responsive-sidebar>

        <!-- Main content area -->
        <div class="main-content-area flex flex-col h-full" [class]="mainAreaClasses()">
          <!-- Page content -->
          <main class="flex-1" [class]="getMainContentPadding() + ' ' + getOverflowClass()">
            <div [class]="getContentWrapperClasses()">
              <router-outlet></router-outlet>
            </div>
          </main>
          
          <!-- Mobile bottom navigation -->
          <app-mobile-bottom-nav></app-mobile-bottom-nav>
        </div>
      </div>
    }
  `,
  styles: [`
    .main-content-area {
      position: relative;
    }
    
    @media (min-width: 768px) {
      .main-content-area {
        margin-left: 16rem;
      }
      
      .main-content-area.collapsed {
        margin-left: 4rem;
      }
    }
  `]
})
export class ResponsiveLayoutComponent {
  private pwaService = inject(PWAService);
  sidebarService = inject(SidebarStateService); // Hacer público
  private authService = inject(AuthService);
  private router = inject(Router);

  isLoading = this.authService.loading$;

  // Reactive route state
  private currentUrl = signal<string>('');

  constructor() {
    this.updateMobileStatus();
    // Track URL changes reactively
    this.router.events.subscribe(() => {
      this.currentUrl.set(this.router.url);
    });
    // Set initial URL
    this.currentUrl.set(this.router.url);
  }

  // Check if current route is a public page (no sidebar)
  isPublicRoute = computed(() => {
    const url = this.currentUrl();

    // Auth and Invitation routes
    const isAuthPath = url.includes('/login') ||
      url.includes('/register') ||
      url.includes('/client/set-password') ||
      url.includes('/invite') ||
      url.includes('/reset-password') ||
      url.includes('/recuperar-password') ||
      url.includes('/auth/callback') ||
      url.includes('/consent') ||
      url.includes('/complete-profile') ||
      url.includes('/mfa-verify') ||
      url.includes('/accept-dpa') ||
      url.includes('/pago/');

    // External/Public Legal routes
    const isLegalPath = url.includes('/privacy') ||
      url.includes('/terms-of-service') ||
      url.includes('/aviso-legal');

    return isAuthPath || isLegalPath;
  });

  // Check if user is authenticated and has a complete profile.
  // The 'isPending' guard applies only during the invite/complete-profile flow —
  // NOT on /portal routes where portal clients legitimately lack CRM name/surname.
  isAuthenticated = computed(() => {
    const isAuthed = this.authService.isAuthenticated();
    if (!isAuthed) return false;

    const url = this.currentUrl();
    // Only hide app chrome for incomplete clients if they are still in the invite flow.
    // Once on /portal or any other route, treat them as authenticated.
    const isInviteFlow = url.includes('/invite') || url.includes('/complete-profile');
    if (isInviteFlow) {
      const profile = this.authService.userProfileSignal();
      const isPending = !!profile && profile.role === 'client' && (!profile.name || !profile.surname);
      return !isPending;
    }

    return true;
  });

  // Mobile detection
  isMobile = signal(false);

  @HostListener('window:resize', ['$event'])
  onResize(_event: Event) {
    this.updateMobileStatus();
  }

  private updateMobileStatus() {
    this.isMobile.set(window.innerWidth < 768);
  }

  // Computed classes for main area
  mainAreaClasses = computed(() => {
    if (this.isMobile()) {
      return '';
    }
    return this.sidebarService.isCollapsed() ? 'collapsed' : '';
  });

  getMainContentPadding(): string {
    const isCustomScrollRoute = this.currentUrl().includes('/webmail') || 
                               this.currentUrl().includes('/clientes') || 
                               this.currentUrl().includes('/reservas') || 
                               this.currentUrl().includes('/configuracion/booking-types') ||
                               this.currentUrl().includes('/clientes-gdpr') ||
                               this.currentUrl().includes('/servicios');

    if (this.isMobile()) {
      if (isCustomScrollRoute) {
        // Para móvil, mantener el padding inferior para el menú, pero quitar el padding lateral
        return 'pb-20';
      }
      // En móvil, añadir padding bottom para el menú inferior
      return 'p-4 pb-20';
    }
    
    // Webmail and Customers (Scrollbar fix) need full control of space (no global padding)
    if (isCustomScrollRoute || this.currentUrl().includes('/configuracion')) {
      return 'p-0';
    }
    return 'p-6';
  }

  getOverflowClass(): string {
    // Webmail and Customers need to handle their own scrolling (no global scroll)
    const isCustomScrollRoute = this.currentUrl().includes('/webmail') || 
                               this.currentUrl().includes('/clientes') || 
                               this.currentUrl().includes('/reservas') || 
                               this.currentUrl().includes('/configuracion/booking-types') ||
                               this.currentUrl().includes('/configuracion') ||
                               this.currentUrl().includes('/clientes-gdpr') ||
                               this.currentUrl().includes('/servicios');

    if (isCustomScrollRoute) {
      // In these routes, the inner components define their own scrolling areas to keep headers fixed
      return 'overflow-hidden flex flex-col';
    }
    return 'overflow-auto';
  }

  getContentWidth(): string {
    return 'max-w-8xl';
  }

  getContentWrapperClasses(): string {
    // Prioritize full width in all cases to maximize usable space
    return 'w-full h-full';
  }

  openSidebar(): void {
    this.sidebarService.setOpen(true);
  }
}
