import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, BookOpen, FileText } from 'lucide-angular';

/**
 * Mobile bottom tabs for /docs. Shown only on screens below the
 * `md` breakpoint (parent layout uses `md:hidden`). Replaces the
 * left sidebar on small screens with a sticky two-tab switch.
 */
@Component({
  selector: 'app-docs-mobile-tabs',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, LucideAngularModule],
  template: `
    <nav
      class="3xl:hidden sticky top-0 z-30 grid grid-cols-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      [attr.aria-label]="'docs.mobileTabs.label' | transloco"
    >
      <button
        type="button"
        (click)="select.emit('index')"
        [class]="tabClass(activeTab === 'index')"
      >
        <lucide-icon [name]="BookOpenIcon" [size]="14"></lucide-icon>
        <span>{{ 'docs.mobileTabs.index' | transloco }}</span>
      </button>
      <button
        type="button"
        (click)="select.emit('article')"
        [class]="tabClass(activeTab === 'article')"
      >
        <lucide-icon [name]="FileTextIcon" [size]="14"></lucide-icon>
        <span>{{ 'docs.mobileTabs.article' | transloco }}</span>
      </button>
    </nav>
  `,
})
export class DocsMobileTabsComponent {
  readonly BookOpenIcon = BookOpen;
  readonly FileTextIcon = FileText;

  @Input() activeTab: 'index' | 'article' = 'article';
  @Output() select = new EventEmitter<'index' | 'article'>();

  /** Build the class string for a mobile tab. Public so the template
   * can call it directly. */
  tabClass(active: boolean): string {
    const base =
      'flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors';
    return active
      ? `${base} border-blue-600 text-blue-600 dark:text-blue-400`
      : `${base} border-transparent text-gray-500 dark:text-gray-400`;
  }
}
