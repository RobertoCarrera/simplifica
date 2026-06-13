import {
  Component,
  inject,
  computed,
  effect,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, ChevronDown, FileText } from 'lucide-angular';
import { filter, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { DocsShellStore } from '../docs-shell.store';

const STORAGE_KEY = 'docs-sidebar-expanded';

/**
 * Sidebar index for the /docs module.
 *
 * - Renders a tree of categories with their articles.
 * - Highlights the active article (matches the current route).
 * - Persists expanded/collapsed state per category in localStorage
 *   under `docs-sidebar-expanded`.
 * - Sticky on desktop; on mobile the parent layout hides it in favour
 *   of the mobile tabs component.
 */
@Component({
  selector: 'app-docs-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe, LucideAngularModule],
  template: `
    <aside
      class="docs-sidebar block w-full h-full overflow-y-auto py-4 pr-2"
      [attr.aria-label]="'docs.sidebar.label' | transloco"
    >
      @if (store.loading() && store.sidebarTree().length === 0) {
        <div class="space-y-2 px-2">
          @for (i of [1,2,3,4]; track i) {
            <div class="h-7 rounded bg-gray-100 dark:bg-gray-800 animate-pulse"></div>
          }
        </div>
      } @else if (store.error()) {
        <p class="px-3 text-xs text-red-600 dark:text-red-400">
          {{ store.error() }}
        </p>
      } @else {
        <ul class="space-y-0.5">
          @for (cat of store.sidebarTree(); track cat.id) {
            <li>
              <button
                type="button"
                (click)="toggle(cat.id)"
                [attr.aria-expanded]="isExpanded(cat.id)"
                class="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-left text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span class="truncate">{{ cat.name }}</span>
                <lucide-icon
                  [name]="ChevronDownIcon"
                  [size]="14"
                  class="text-gray-400 shrink-0 transition-transform"
                  [class.rotate-180]="!isExpanded(cat.id)"
                ></lucide-icon>
              </button>
              @if (isExpanded(cat.id)) {
                <ul class="mt-0.5 ml-2 pl-2 border-l border-gray-200 dark:border-gray-700 space-y-px">
                  @for (art of cat.articles; track art.id) {
                    <li>
                      <a
                        [routerLink]="['/docs', cat.slug, art.slug]"
                        [class]="
                          isActive(cat.slug, art.slug)
                            ? 'docs-sidebar-link docs-sidebar-link--active'
                            : 'docs-sidebar-link'
                        "
                      >
                        <lucide-icon
                          [name]="FileTextIcon"
                          [size]="12"
                          class="shrink-0 opacity-60"
                        ></lucide-icon>
                        <span class="truncate">{{ art.title }}</span>
                      </a>
                    </li>
                  }
                  @if (cat.articles.length === 0) {
                    <li class="px-3 py-1.5 text-xs text-gray-400 italic">
                      {{ 'docs.sidebar.empty' | transloco }}
                    </li>
                  }
                </ul>
              }
            </li>
          }
        </ul>
      }
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-width: 0;
      }
      .docs-sidebar-link {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        font-size: 0.8125rem;
        line-height: 1.25rem;
        color: rgb(75 85 99);
        border-radius: 0.375rem;
        transition: background-color 150ms, color 150ms;
      }
      :host-context(.dark) .docs-sidebar-link {
        color: rgb(209 213 219);
      }
      .docs-sidebar-link:hover {
        background-color: rgb(243 244 246);
      }
      :host-context(.dark) .docs-sidebar-link:hover {
        background-color: rgb(31 41 55);
      }
      .docs-sidebar-link--active {
        background-color: rgb(239 246 255);
        color: rgb(29 78 216);
        font-weight: 500;
      }
      :host-context(.dark) .docs-sidebar-link--active {
        background-color: rgba(30, 58, 138, 0.25);
        color: rgb(147 197 253);
      }
    `,
  ],
})
export class DocsSidebarComponent {
  readonly store = inject(DocsShellStore);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  readonly ChevronDownIcon = ChevronDown;
  readonly FileTextIcon = FileText;

  /**
   * Track which category ids are expanded. Initialised from
   * localStorage in the browser; all categories default to expanded
   * on the server / when no key is found.
   */
  private expanded = signal<Set<string>>(new Set());

  /**
   * Current URL — used to highlight the active article. Recomputed
   * on NavigationEnd so routerLinkActive's defaults work for us
   * without needing its quirky partial-match setup.
   */
  private currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  activeKey = computed(() => {
    const url = this.currentUrl();
    const m = url.match(/^\/docs\/([^/]+)(?:\/([^/]+))?/);
    if (!m) return null;
    return { category: m[1], article: m[2] ?? null };
  });

  constructor() {
    // Initialise expansion state from localStorage. Done here (not
    // in a constructor of a service) so the sidebar owns its own UI
    // state. Read once on construction.
    if (isPlatformBrowser(this.platformId)) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const arr = JSON.parse(raw) as string[];
          if (Array.isArray(arr)) this.expanded.set(new Set(arr));
        }
      } catch {
        // Corrupt JSON — fall back to default (all expanded).
      }
    }

    // Once categories are loaded, ensure the active category is
    // expanded so users see where they are.
    effect(() => {
      const cats = this.store.categories();
      const key = this.activeKey();
      if (cats.length === 0 || !key) return;
      // Default: all expanded; if a stored set exists, keep it.
      const current = this.expanded();
      if (current.size === 0) {
        this.expanded.set(new Set(cats.map((c) => c.id)));
        this.persist();
      } else if (key.article) {
        // Make sure the active category is visible
        const cat = cats.find((c) => c.slug === key.category);
        if (cat && !current.has(cat.id)) {
          const next = new Set(current);
          next.add(cat.id);
          this.expanded.set(next);
          this.persist();
        }
      }
    });
  }

  isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  toggle(id: string): void {
    const next = new Set(this.expanded());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded.set(next);
    this.persist();
  }

  isActive(categorySlug: string, articleSlug: string): boolean {
    const k = this.activeKey();
    return !!k && k.category === categorySlug && k.article === articleSlug;
  }

  private persist(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.expanded()]));
    } catch {
      // localStorage quota or privacy mode — silently degrade; the
      // expansion state will just reset on the next page load.
    }
  }
}
