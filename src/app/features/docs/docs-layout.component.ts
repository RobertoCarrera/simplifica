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
  templateUrl: './docs-layout.component.html',
  styleUrl: './docs-layout.component.css',
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
   * Grid columns class, computed from whether we're on the article
   * view (3 cols, with ToC) or the index/category view (2 cols,
   * no ToC column wasted).
   *
   * The sidebar / ToC track sizes use `clamp()` so they grow
   * smoothly with the viewport instead of jumping at a breakpoint:
   *   - Sidebar: 180px (mobile-md) → 260px (3xl) via 18vw.
   *   - ToC:     160px (xl)        → 220px (3xl) via 16vw.
   * The middle (main content) is `minmax(0, 1fr)` so it always
   * fills the remaining space and the inner card grid (e.g.
   * `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) has room to breathe.
   */
  readonly gridColsClass = computed(() => {
    if (this.activeArticleSlug()) {
      // Article view: 3 cols (sidebar + main + ToC).
      return 'grid-cols-1 md:grid-cols-[clamp(180px,18vw,260px)_minmax(0,1fr)]';
    }
    // Index or category view: 2 cols (sidebar + main, no ToC).
    return 'grid-cols-1 md:grid-cols-[clamp(180px,18vw,240px)_minmax(0,1fr)]';
  });

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
    if (!m) return null;
    // Reserved top-level segments that aren't real article slugs.
    // The docs route tree only defines `:category` and `:category/:slug`,
    // so a non-empty match is always a real article — but we keep this
    // guard so a future sub-route like `/docs/admin/foo` doesn't leak
    // through and render an empty ToC slot.
    if (m[1] === 'admin' || m[1] === 'categorias' || m[1] === 'index') return null;
    return m[2];
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
