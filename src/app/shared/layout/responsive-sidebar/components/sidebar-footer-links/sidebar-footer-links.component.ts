import {
  ChangeDetectionStrategy,
  Component,
  Input,
  Signal,
  inject,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeedbackService } from '../../../../feedback/feedback.service';

/**
 * Sidebar footer links: Configuración + Feedback button.
 *
 * Extracted from responsive-sidebar.component.html (was lines 361–388). Owns
 * the entire block including the FeedbackService injection — strictTemplates
 * does not validate cross-component method calls, so all dependencies the
 * template uses must live in this component.
 */
@Component({
  selector: 'app-sidebar-footer-links',
  standalone: true,
  imports: [RouterModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1"
    >
      <!-- Configuración -->
      <a
        routerLink="/configuracion"
        routerLinkActive="bg-gray-100 dark:bg-gray-700 text-blue-600 dark:text-blue-400"
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
        [class.justify-center]="isCollapsed()"
      >
        <i class="fas fa-cog"></i>
        @if (!isCollapsed()) {
          <span>{{ 'nav.configuracion' | transloco }}</span>
        }
      </a>

      <!-- Feedback Button -->
      <button
        type="button"
        (click)="feedbackService.open()"
        class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
        [class.justify-center]="isCollapsed()"
      >
        <i class="fas fa-circle-question"></i>
        @if (!isCollapsed()) {
          <span>Feedback</span>
        }
      </button>
    </div>
  `,
})
export class SidebarFooterLinksComponent {
  @Input({ required: true }) isCollapsed!: Signal<boolean>;
  feedbackService = inject(FeedbackService);
}
