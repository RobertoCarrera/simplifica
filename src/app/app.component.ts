import { Component, inject, OnDestroy } from '@angular/core';
import { ResponsiveLayoutComponent } from './shared/layout/responsive-layout/responsive-layout.component';
import { ToastHostComponent } from './shared/ui/toast/toast.component';
import { PwaInstallComponent } from './shared/ui/pwa-install/pwa-install.component';
import { ToastService } from './services/toast.service';
import { PWAService } from './services/pwa.service';
import { ThemeService } from './services/theme.service';
import { FeedbackModalComponent } from './shared/feedback/feedback-modal.component';
import { AuthService } from './services/auth.service';
import { LanguageService } from './core/services/language.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResponsiveLayoutComponent, ToastHostComponent, PwaInstallComponent, FeedbackModalComponent],
  template: `
    <app-responsive-layout></app-responsive-layout>
    <app-toast></app-toast>
    <app-pwa-install></app-pwa-install>
    <app-feedback-modal></app-feedback-modal>
  `,
})
export class AppComponent implements OnDestroy {
  title = 'simplifica-crm';
  private toastService = inject(ToastService);
  private authService = inject(AuthService);
  private languageService = inject(LanguageService);
  pwaService = inject(PWAService);
  themeService = inject(ThemeService);

  private langSub: Subscription;

  constructor() {
    // CRM app initialization

    // Apply the authenticated user's preferred language as soon as the profile is available.
    // This OVERRIDES the boot fallback (localStorage → browser → 'es') with the user's explicit choice.
    this.langSub = this.authService.userProfile$.subscribe((profile) => {
      if (profile?.id) {
        this.languageService.loadUserPreference(profile.id);
      }
    });
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }
}
