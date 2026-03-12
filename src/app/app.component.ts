import { Component, inject } from '@angular/core';
import { ResponsiveLayoutComponent } from './shared/layout/responsive-layout/responsive-layout.component';
import { ToastComponent } from './shared/ui/toast/toast.component';
import { PwaInstallComponent } from './shared/ui/pwa-install/pwa-install.component';
import { DevNavComponent } from './shared/layout/dev-nav/dev-nav.component';
import { ToastService } from './services/toast.service';
import { PWAService } from './services/pwa.service';
import { DevRoleService } from './services/dev-role.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    ResponsiveLayoutComponent,
    ToastComponent,
    PwaInstallComponent,
    DevNavComponent,
  ],
  template: `
    <app-responsive-layout></app-responsive-layout>
    <app-toast></app-toast>
    <app-pwa-install></app-pwa-install>
    <!-- Navigation de desarrollo - Solo para admin/dev -->
    @if (devRoleService.canSeeDevTools()) {
      <app-dev-nav></app-dev-nav>
    }
  `,
})
export class AppComponent {
  title = 'simplifica';
  private toastService = inject(ToastService);
  pwaService = inject(PWAService);
  devRoleService = inject(DevRoleService);
  themeService = inject(ThemeService);

  constructor() {
    // Las notificaciones y toasts se mostrarán solo cuando el usuario esté autenticado
    // No mostrar nada en el login
  }
}
