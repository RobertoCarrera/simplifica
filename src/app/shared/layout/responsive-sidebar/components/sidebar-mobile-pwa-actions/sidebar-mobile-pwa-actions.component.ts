import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  Signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';
import { PWAService } from '../../../../../services/pwa.service';

/**
 * Sidebar mobile / PWA actions: Install App button + Mobile Dashboard link.
 *
 * Extracted from responsive-sidebar.component.html (was lines 197–223).
 *
 * Owns its own render guard (`isMobile()`) and injects PWAService locally for
 * `canInstall()` and `deviceInfo()`. The parent supplies `isMobile` and
 * `isCollapsed` as Signal inputs so the child re-renders reactively when the
 * viewport crosses the 768px breakpoint without re-rendering the whole
 * sidebar (same pattern as SidebarMobileOverlayComponent from PR #1).
 *
 * Design note: `installPwa` is exposed as an `@Output` even though the actual
 * install is performed locally — this gives the parent a hook for analytics
 * or future cross-cutting concerns without coupling the parent to PWAService.
 */
@Component({
  selector: 'app-sidebar-mobile-pwa-actions',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isMobile()) {
      <div class="space-y-2">
        <!-- PWA Install button -->
        @if (pwaService.canInstall() && !isCollapsed()) {
          <button
            (click)="onInstallClick()"
            class="w-full flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
          >
            <lucide-icon name="download" [size]="16" class="mr-2"></lucide-icon>
            {{ 'sidebar.instalarApp' | transloco }}
          </button>
        }

        <!-- Mobile dashboard link -->
        <a
          routerLink="/mobile"
          class="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
          [class.justify-center]="isCollapsed()"
        >
          <lucide-icon name="smartphone" [size]="16" class="mr-2"></lucide-icon>
          @if (!isCollapsed()) {
            <span>{{ 'sidebar.dashboardMovil' | transloco }}</span>
          }
        </a>
      </div>
    }
  `,
})
export class SidebarMobilePwaActionsComponent {
  @Input({ required: true }) isMobile!: Signal<boolean>;
  @Input({ required: true }) isCollapsed!: Signal<boolean>;
  @Output() installPwa = new EventEmitter<void>();

  pwaService = inject(PWAService);

  async onInstallClick(): Promise<void> {
    this.installPwa.emit();
    const success = await this.pwaService.installPWA();
    if (success) {
      this.pwaService.vibrate([200, 100, 200]);
    }
  }
}