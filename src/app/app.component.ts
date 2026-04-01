import { Component, inject } from '@angular/core';
import { ResponsiveLayoutComponent } from './shared/layout/responsive-layout/responsive-layout.component';
import { ToastComponent } from './shared/ui/toast/toast.component';
import { PwaInstallComponent } from './shared/ui/pwa-install/pwa-install.component';
import { ToastService } from './services/toast.service';
import { PWAService } from './services/pwa.service';
import { ThemeService } from './services/theme.service';
import { FeedbackModalComponent } from './shared/feedback/feedback-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResponsiveLayoutComponent, ToastComponent, PwaInstallComponent, FeedbackModalComponent],
  template: `
    <app-responsive-layout></app-responsive-layout>
    <app-toast></app-toast>
    <app-pwa-install></app-pwa-install>
    <app-feedback-modal></app-feedback-modal>
  `,
})
export class AppComponent {
  title = 'simplifica-crm';
  private toastService = inject(ToastService);
  pwaService = inject(PWAService);
  themeService = inject(ThemeService);

  constructor() {
    // CRM app initialization
  }
}
