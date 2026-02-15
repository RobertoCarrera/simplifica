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
    @if (isLoading | async) {
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
      url.includes('/pago/');

    // External/Public Legal routes
    const isLegalPath = url.includes('/privacy-policy') ||
      url.includes('/terms-of-service');

    return isAuthPath || isLegalPath;
  });

  // Check if user is authenticated and has a complete profile
  // If profile is missing basic data (name/surname), we treat it as "Pending Registration"
  isAuthenticated = computed(() => {
    const isAuthed = this.authService.isAuthenticated();
    if (!isAuthed) return false;

    // Security layer: If we are in an invitation/auth flow, even if 'authed', 
    // we should hide app chrome if the profile isn't fully ready.
    const profile = this.authService.userProfileSignal();
    const isPending = !!profile && profile.role === 'client' && (!profile.name || !profile.surname);

    return isAuthed && !isPending;
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
    if (this.isMobile()) {
      // En móvil, añadir padding bottom para el menú inferior
      return 'p-4 pb-20';
    }
    // Webmail and Customers (Scrollbar fix) need full control of space (no global padding)
    if (this.currentUrl().includes('/webmail') || this.currentUrl().includes('/clientes')) {
      return 'p-0';
    }
    return 'p-6';
  }

  getOverflowClass(): string {
    // Webmail and Customers need to handle their own scrolling (no global scroll)
    if (this.currentUrl().includes('/webmail') || this.currentUrl().includes('/clientes')) {
      return 'overflow-auto';
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
