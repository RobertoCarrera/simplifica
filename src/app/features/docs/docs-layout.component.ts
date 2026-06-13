import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewInit,
  effect,
  HostListener,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, ChevronLeft, ChevronRight, BookOpen, Pencil, Eye, Save, X } from 'lucide-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { DocsShellStore } from './docs-shell.store';
import { EditModeService } from './edit-mode.service';
import { DocsBreadcrumbsComponent } from './components/docs-breadcrumbs.component';
import { DocsSearchComponent } from './components/docs-search.component';
import { DocsSidebarComponent } from './components/docs-sidebar.component';
import { DocsTocComponent } from './components/docs-toc.component';
import { DocsMobileTabsComponent } from './components/docs-mobile-tabs.component';

/**
 * 3-column shell for the /docs module.
 *
 * Desktop (>= md):
 *   ┌───────────────────────────────────────────────┐
 *   │ header: breadcrumbs │ search                  │
 *   ├──────────┬──────────────────────────┬─────────┤
 *   │ sidebar  │  main (router-outlet)    │  ToC    │
 *   │ (sticky) │                          │ (sticky)│
 *   └──────────┴──────────────────────────┴─────────┘
 *                  [← prev]            [next →]
 *
 * Mobile (< md):
 *   ┌──────────────────────────────────┐
 *   │ mobile tabs: Índice │ Artículo   │  (sticky top)
 *   ├──────────────────────────────────┤
 *   │ mobile panels (sidebar OR main)  │
 *   │ (rendered via mobileActive sig.) │
 *   └──────────────────────────────────┘
 */
@Component({
  selector: 'app-docs-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    TranslocoPipe,
    LucideAngularModule,
    DocsBreadcrumbsComponent,
    DocsSearchComponent,
    DocsSidebarComponent,
    DocsTocComponent,
    DocsMobileTabsComponent,
  ],
  template: `
    <div class="docs-shell min-h-full">
      <!-- Header strip: breadcrumbs + search + edit-mode toggle -->
      <header
        class="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-gray-900/60 w-full"
      >
        <div class="w-full px-4 md:px-6 h-14 flex items-center gap-4">
          <div class="flex-1 min-w-0">
            <app-docs-breadcrumbs
              [categorySlug]="activeCategory()"
              [articleSlug]="activeArticleSlug()"
              [articleTitleInput]="activeArticleTitle()"
            ></app-docs-breadcrumbs>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <app-docs-search></app-docs-search>
            @if (editModeSvc.canEdit()) {
              <button
                type="button"
                (click)="editModeSvc.toggle()"
                class="docs-edit-toggle inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors"
                [class.docs-edit-toggle--active]="editModeSvc.editMode()"
                [attr.aria-pressed]="editModeSvc.editMode()"
                data-testid="docs-edit-toggle"
              >
                @if (editModeSvc.editMode()) {
                  <lucide-icon [name]="EyeIcon" [size]="14"></lucide-icon>
                  <span>Salir de edición</span>
                } @else {
                  <lucide-icon [name]="PencilIcon" [size]="14"></lucide-icon>
                  <span>Editar documentación</span>
                }
              </button>
            }
          </div>
        </div>
        @if (editModeSvc.editMode()) {
          <div
            class="w-full px-4 md:px-6 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2"
            data-testid="docs-edit-banner"
          >
            <lucide-icon [name]="PencilIcon" [size]="12"></lucide-icon>
            <span>Modo edición activo. Los cambios se guardan al pulsar <kbd class="px-1 rounded bg-amber-100 dark:bg-amber-900/40">Ctrl+S</kbd> o el botón Listo.</span>
          </div>
        }
      </header>

      <!-- Mobile tabs: Índice | Artículo (only < md / 768px) -->
      <app-docs-mobile-tabs
        class="md:hidden"
        [activeTab]="mobileActive()"
        (select)="onMobileSelect($event)"
      ></app-docs-mobile-tabs>

      <!-- Main grid (responsive, from compact to wide):
           - mobile: 1 col, no sidebar, no ToC
           - md (>=768px): 2 cols (sidebar + main), no ToC
           - xl (>=1280px): 3 cols, ToC angosto (180px)
           - 3xl (>=1100px custom, sits below xl): 3 cols anchas (240/220) -->
      <div class="w-full px-4 md:px-6 py-4 md:py-6 grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_180px] 3xl:grid-cols-[240px_minmax(0,1fr)_220px] gap-4 md:gap-6">
        <!-- LEFT: Sidebar appears at md. Sticky so it follows scroll. -->
        <div class="hidden md:block min-w-0">
          <div class="sticky top-20 max-h-[calc(100vh-6rem)] w-full">
            <app-docs-sidebar></app-docs-sidebar>
          </div>
        </div>

        <!-- CENTER: Main content (router-outlet, with prev/next footer) -->
        <main class="min-w-0 overflow-hidden">
          <div #contentHost class="min-w-0">
            <router-outlet></router-outlet>
          </div>

          @if (activeCategory() && activeArticleSlug() && (neighbours().prev || neighbours().next)) {
            <nav
              class="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 flex items-stretch justify-between gap-3"
              [attr.aria-label]="'docs.footerNav.label' | transloco"
            >
              @if (neighbours().prev; as p) {
                <a
                  [routerLink]="['/docs', p.category.slug, p.article.slug]"
                  class="group flex-1 min-w-0 max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-blue-500/50 transition-colors"
                >
                  <span class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <lucide-icon [name]="ChevronLeftIcon" [size]="12"></lucide-icon>
                    {{ 'docs.footerNav.previous' | transloco }}
                  </span>
                  <span class="mt-1 block text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ p.article.title }}
                  </span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">
                    {{ p.category.name }}
                  </span>
                </a>
              } @else {
                <span class="flex-1"></span>
              }

              @if (neighbours().next; as n) {
                <a
                  [routerLink]="['/docs', n.category.slug, n.article.slug]"
                  class="group flex-1 min-w-0 max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-right hover:border-blue-500/50 transition-colors"
                >
                  <span class="flex items-center justify-end gap-1 text-xs text-gray-500 dark:text-gray-400">
                    {{ 'docs.footerNav.next' | transloco }}
                    <lucide-icon [name]="ChevronRightIcon" [size]="12"></lucide-icon>
                  </span>
                  <span class="mt-1 block text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ n.article.title }}
                  </span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">
                    {{ n.category.name }}
                  </span>
                </a>
              } @else {
                <span class="flex-1"></span>
              }
            </nav>
          }
        </main>

        <!-- RIGHT: ToC — only rendered on the article view (where there
             are headings to show). On the category index the right column
             would be empty and waste 220px. -->
        @if (activeArticleSlug()) {
          <div class="hidden xl:block min-w-0">
            <app-docs-toc [contentRef]="contentRef()"></app-docs-toc>
          </div>
        }
      </div>

      <!-- Mobile panel: show the sidebar as a fullscreen overlay below
           3xl (1100px) when the user taps the "Índice" tab. The article
           panel replaces it via the routed outlet. -->
      @if (mobileActive() === 'index') {
        <div class="md:hidden fixed inset-x-0 bottom-0 top-[7.5rem] z-10 bg-white dark:bg-gray-900 overflow-y-auto px-4 pb-6">
          <app-docs-sidebar></app-docs-sidebar>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .docs-edit-toggle {
        background: transparent;
        border-color: rgb(229 231 235);
        color: rgb(75 85 99);
      }
      :host-context(.dark) .docs-edit-toggle {
        border-color: rgb(55 65 81);
        color: rgb(209 213 219);
      }
      .docs-edit-toggle:hover {
        background: rgb(243 244 246);
      }
      :host-context(.dark) .docs-edit-toggle:hover {
        background: rgb(31 41 55);
      }
      .docs-edit-toggle--active {
        background: rgb(254 243 199) !important;
        border-color: rgb(245 158 11) !important;
        color: rgb(146 64 14) !important;
      }
      :host-context(.dark) .docs-edit-toggle--active {
        background: rgba(245, 158, 11, 0.15) !important;
        border-color: rgb(245 158 11) !important;
        color: rgb(252 211 77) !important;
      }
      kbd {
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 0.7rem;
      }
    `,
  ],
})
export class DocsLayoutComponent implements OnInit, AfterViewInit {
  readonly store = inject(DocsShellStore);
  readonly editModeSvc = inject(EditModeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  readonly ChevronLeftIcon = ChevronLeft;
  readonly ChevronRightIcon = ChevronRight;
  readonly BookOpenIcon = BookOpen;
  readonly PencilIcon = Pencil;
  readonly EyeIcon = Eye;
  readonly SaveIcon = Save;
  readonly XIcon = X;

  /** ElementRef of the main content area — passed to the ToC.
   *  In Angular 21 `@ViewChild` returns the native element directly
   *  (no `ElementRef` wrapper), so we re-wrap in a computed. */
  @ViewChild('contentHost', { static: false }) contentHost?: HTMLDivElement;
  readonly contentRef = computed<ElementRef<any> | undefined>(() =>
    this.contentHost ? new ElementRef(this.contentHost) : undefined,
  );

  /** Mobile panel selector. */
  readonly mobileActive = signal<'index' | 'article'>('article');

  /**
   * Track the deepest child route so we can read its params. We use
   * the router URL directly because child components own the data
   * loading and re-render on every route change.
   */
  private url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Parsed category from the URL: `/docs`, `/docs/:cat`, `/docs/:cat/:slug`. */
  activeCategory = computed(() => {
    const m = this.url().match(/^\/docs\/([^/]+)/);
    if (!m) return null;
    // The /docs index has no category. Filter out the bare /docs path.
    if (m[1] === undefined) return null;
    // Routes start with /docs/. The match[1] is what comes next.
    // We treat any non-empty segment that isn't a sub-route of docs
    // (e.g. "categorias") as a category.
    return m[1];
  });

  activeArticleSlug = computed(() => {
    const m = this.url().match(/^\/docs\/([^/]+)\/([^/]+)/);
    return m ? m[2] : null;
  });

  activeArticleTitle = computed(() => {
    const slug = this.activeArticleSlug();
    const cat = this.activeCategory();
    if (!slug || !cat) return null;
    return (
      this.store
        .articles()
        .find((a) => a.slug === slug && this.store.categories().find((c) => c.id === a.category_id)?.slug === cat)
        ?.title ?? null
    );
  });

  neighbours = computed(() => {
    const cat = this.activeCategory();
    const slug = this.activeArticleSlug();
    if (!cat || !slug) return { prev: null, next: null };
    return this.store.neighbours(cat, slug);
  });

  ngOnInit(): void {
    this.store.ensureLoaded();
  }

  ngAfterViewInit(): void {
    // On mobile, default to showing the article panel; users can tap
    // "Índice" to swap. We switch automatically to "article" on every
    // article navigation.
    effect(() => {
      if (this.activeArticleSlug()) this.mobileActive.set('article');
    });
  }

  onMobileSelect(tab: 'index' | 'article'): void {
    this.mobileActive.set(tab);
  }
}
