import {
  ChangeDetectionStrategy,
  Component,
  Input,
  Signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MenuItem } from '../../data/sidebar-menu.items';

/**
 * Sidebar floating tooltip shown when the sidebar is collapsed and the user
 * hovers over a nav item.
 *
 * Extracted from responsive-sidebar.component.html (was lines 391–405). The
 * parent owns the hover state (mouseenter/leave events live on the nav list
 * because they need access to `item` and the event target rectangle), but the
 * child owns the visual rendering and translation lookup.
 *
 * Inputs are passed as signals so the child template reacts to hover changes
 * without the parent re-rendering the entire sidebar.
 */
@Component({
  selector: 'app-sidebar-floating-tooltip',
  standalone: true,
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isCollapsed() && hoveredItem(); as item) {
      <div
        class="fixed transform -translate-y-1/2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg whitespace-nowrap z-[9999] shadow-lg pointer-events-none"
        [style.top]="tooltipStyle().top"
        [style.left]="tooltipStyle().left"
      >
        {{ item.label | transloco }}
        @if (item.badge) {
          <span class="ml-2 px-2 py-0.5 bg-red-500 rounded-full text-xs">
            {{ item.badge }}
          </span>
        }
      </div>
    }
  `,
})
export class SidebarFloatingTooltipComponent {
  @Input({ required: true }) isCollapsed!: Signal<boolean>;
  @Input({ required: true }) hoveredItem!: Signal<MenuItem | null>;
  @Input({ required: true }) tooltipStyle!: Signal<{ top: string; left: string }>;
}
