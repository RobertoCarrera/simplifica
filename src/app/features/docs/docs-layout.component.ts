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
import { LucideAngularModule, ChevronLeft, ChevronRight, BookOpen } from 'lucide-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';

import { DocsShellStore } from './docs-shell.store';
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
      <!-- Header strip: breadcrumbs + search -->
      <header
        class="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-gray-900/60"
      >
        <div class="max-w-[1400px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          <div class="flex-1 min-w-0">
            <app-docs-breadcrumbs
              [categorySlug]="activeCategory()"
              [articleSlug]="activeArticleSlug()"
              [articleTitleInput]="activeArticleTitle()"
            ></app-docs-breadcrumbs>
          </div>
          <div class="shrink-0">
            <app-docs-search></app-docs-search>
          </div>
        </div>
      </header>

      <!-- Mobile tabs: Índice | Artículo (only < 3xl / 1100px) -->
      <app-docs-mobile-tabs
        class="3xl:hidden"
        [activeTab]="mobileActive()"
        (select)="onMobileSelect($event)"
      ></app-docs-mobile-tabs>

      <!-- Main grid: 3 columns only at 3xl (>=1100px); below that, only
           the main column renders (sidebar + ToC hidden, mobile tabs own
           the index/panel switch). -->
      <div class="max-w-[1400px] mx-auto px-4 md:px-6 py-4 md:py-6 grid 3xl:grid-cols-[240px_1fr_220px] gap-6">
        <!-- LEFT: Sidebar (only desktop >= 1100px) -->
        <div class="hidden 3xl:block">
          <div class="sticky top-20 max-h-[calc(100vh-6rem)]">
            <app-docs-sidebar></app-docs-sidebar>
          </div>
        </div>

        <!-- CENTER: Main content (router-outlet, with prev/next footer) -->
        <main class="min-w-0">
          <div #contentHost>
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

        <!-- RIGHT: ToC (only desktop >= 1100px) -->
        <div class="hidden 3xl:block">
          <app-docs-toc [contentRef]="contentRef()"></app-docs-toc>
        </div>
      </div>

      <!-- Mobile panel: show the sidebar as a fullscreen overlay below
           3xl (1100px) when the user taps the "Índice" tab. The article
           panel replaces it via the routed outlet. -->
      @if (mobileActive() === 'index') {
        <div class="3xl:hidden fixed inset-x-0 bottom-0 top-[7.5rem] z-10 bg-white dark:bg-gray-900 overflow-y-auto px-4 pb-6">
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
    `,
  ],
})
export class DocsLayoutComponent implements OnInit, AfterViewInit {
  readonly store = inject(DocsShellStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  readonly ChevronLeftIcon = ChevronLeft;
  readonly ChevronRightIcon = ChevronRight;
  readonly BookOpenIcon = BookOpen;

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
