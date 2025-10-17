import { Component, inject, signal, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ResponsiveSidebarComponent } from '../responsive-sidebar/responsive-sidebar.component';
import { RlsWarningBannerComponent } from '../rls-warning-banner/rls-warning-banner.component';
import { MobileBottomNavComponent } from '../mobile-bottom-nav/mobile-bottom-nav.component';
import { PWAService } from '../../services/pwa.service';
import { SidebarStateService } from '../../services/sidebar-state.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-responsive-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, ResponsiveSidebarComponent, RlsWarningBannerComponent, MobileBottomNavComponent],
  template: `
    <!-- RLS Warning Banner (always visible when needed) -->
    <app-rls-warning-banner></app-rls-warning-banner>

    <!-- Layout sin sidebar para login/register O usuarios no autenticados -->
    @if (isAuthPage() || !isAuthenticated()) {
      <div class="min-h-screen">
        <router-outlet></router-outlet>
      </div>
    } @else {
      <!-- Layout normal con sidebar para usuarios autenticados -->
      <div class="min-h-screen bg-gray-50 dark:bg-gray-900">

        <!-- Sidebar -->
        <app-responsive-sidebar></app-responsive-sidebar>

        <!-- Main content area -->
        <div class="main-content-area flex flex-col min-h-screen overflow-hidden" [class]="mainAreaClasses()">
          <!-- Page content -->
          <main class="flex-1 overflow-auto" [class]="getMainContentPadding()">
            <div class="mx-auto" [class]="getContentWidth()">
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
      transition: margin-left 0.3s ease;
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

  // Check if current route is auth page
  isAuthPage(): boolean {
    const url = this.router.url;
    return url.includes('/login') || url.includes('/register');
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  // Mobile detection
  isMobile = signal(false);

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.updateMobileStatus();
  }

  constructor() {
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
    return 'p-6';
  }

  getContentWidth(): string {
    return 'max-w-8xl';
  }

  openSidebar(): void {
    this.sidebarService.setOpen(true);
  }
}
