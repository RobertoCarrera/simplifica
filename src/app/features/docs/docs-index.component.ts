import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, BookOpen, FileText, ChevronRight } from 'lucide-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { DocsService, DocsCategory, DocsArticle } from './docs.service';
import { DocsShellStore } from './docs-shell.store';

/**
 * `/docs` landing + category article list.
 *
 * - `/docs` (no params): category card grid.
 * - `/docs/:category`  : article list within that category, with the
 *                        empty state "Esta categoría no tiene artículos
 *                        todavía" when the role hides everything.
 *
 * The 3-column shell (sidebar + content + ToC) is owned by
 * `DocsLayoutComponent`; this component only renders the main
 * column. The breadcrumb is rendered in the layout's sticky header
 * so we don't duplicate it here.
 */
@Component({
  selector: 'app-docs-index',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe, LucideAngularModule],
  template: `
    <div class="p-6 md:p-8 max-w-6xl mx-auto">
      <!-- LANDING: category card grid (route is /docs with no :category) -->
      @if (!activeCategorySlug()) {
        <header class="mb-8">
          <div class="flex items-center gap-3 mb-2">
            <div
              class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center"
            >
              <lucide-icon [name]="BookOpenIcon" [size]="20"></lucide-icon>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ 'nav.docs' | transloco }}
            </h1>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
            Guías, manuales y procedimientos del CRM. Selecciona una categoría
            para ver los artículos disponibles para tu rol.
          </p>
        </header>

        @if (loading()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (i of [1,2,3,4,5,6]; track i) {
              <div
                class="h-32 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
              ></div>
            }
          </div>
        }

        @if (error() && !loading()) {
          <div
            class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300"
          >
            <p class="font-medium mb-1">No se pudo cargar la documentación.</p>
            <p class="text-sm opacity-80">{{ error() }}</p>
            <button
              type="button"
              (click)="load()"
              class="mt-3 text-sm font-medium underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        }

        @if (!loading() && !error() && categories().length === 0) {
          <div
            class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center"
          >
            <lucide-icon
              [name]="BookOpenIcon"
              [size]="32"
              class="mx-auto text-gray-400 mb-3"
            ></lucide-icon>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              No hay contenido visible para tu rol todavía.
            </p>
          </div>
        }

        @if (!loading() && !error() && categories().length > 0) {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (cat of categories(); track cat.id) {
              <a
                [routerLink]="['/docs', cat.slug]"
                class="group block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:border-blue-500/50 transition-colors"
              >
                <div class="flex items-start gap-3 mb-3">
                  <div
                    class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                  >
                    <lucide-icon [name]="FileTextIcon" [size]="16"></lucide-icon>
                  </div>
                  <h3
                    class="text-base font-semibold text-gray-900 dark:text-white leading-snug"
                  >
                    {{ cat.name }}
                  </h3>
                </div>
                @if (cat.description) {
                  <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                    {{ cat.description }}
                  </p>
                }
                <div
                  class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400"
                >
                  Ver artículos
                  <lucide-icon [name]="ChevronRightIcon" [size]="12"></lucide-icon>
                </div>
              </a>
            }
          </div>
        }
      }

      <!-- CATEGORY: article list (route is /docs/:category) -->
      @if (activeCategorySlug(); as catSlug) {
        <header class="mb-8">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ category()?.name ?? catSlug }}
          </h1>
          @if (category()?.description) {
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
              {{ category()?.description }}
            </p>
          }
        </header>

        @if (articlesLoading()) {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"></div>
            }
          </div>
        }

        @if (articlesError() && !articlesLoading()) {
          <div
            class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300"
          >
            <p class="font-medium mb-1">No se pudo cargar los artículos.</p>
            <p class="text-sm opacity-80">{{ articlesError() }}</p>
            <button
              type="button"
              (click)="loadArticles()"
              class="mt-3 text-sm font-medium underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        }

        @if (!articlesLoading() && !articlesError() && articlesInCategory().length === 0) {
          <div
            class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center"
            data-testid="docs-category-empty"
          >
            <lucide-icon
              [name]="FileTextIcon"
              [size]="32"
              class="mx-auto text-gray-400 mb-3"
            ></lucide-icon>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ 'docs.categoryEmpty' | transloco }}
            </p>
            <a
              routerLink="/docs"
              class="mt-4 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {{ 'docs.backToIndex' | transloco }}
            </a>
          </div>
        }

        @if (!articlesLoading() && !articlesError() && articlesInCategory().length > 0) {
          <ul class="space-y-2">
            @for (art of articlesInCategory(); track art.id) {
              <li>
                <a
                  [routerLink]="['/docs', catSlug, art.slug]"
                  class="group flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:border-blue-500/50 transition-colors"
                >
                  <div
                    class="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5"
                  >
                    <lucide-icon [name]="FileTextIcon" [size]="14"></lucide-icon>
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3
                      class="text-sm font-semibold text-gray-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400"
                    >
                      {{ art.title }}
                    </h3>
                    @if (art.summary) {
                      <p class="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {{ art.summary }}
                      </p>
                    }
                  </div>
                  <lucide-icon
                    [name]="ChevronRightIcon"
                    [size]="16"
                    class="text-gray-400 group-hover:text-blue-500 shrink-0 mt-1.5"
                  ></lucide-icon>
                </a>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export class DocsIndexComponent implements OnInit {
  private docsService = inject(DocsService);
  private shellStore = inject(DocsShellStore);
  private route = inject(ActivatedRoute);

  readonly BookOpenIcon = BookOpen;
  readonly FileTextIcon = FileText;
  readonly ChevronRightIcon = ChevronRight;

  // ── Landing state ────────────────────────────────────────────────
  categories = signal<DocsCategory[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  // ── Category view state ──────────────────────────────────────────
  private articlesByCategory = signal<DocsArticle[]>([]);
  articlesLoading = signal(false);
  articlesError = signal<string | null>(null);

  // The current route's :category param, or null on the landing.
  private params = toSignal(
    this.route.paramMap.pipe(map((m) => m.get('category'))),
    { initialValue: this.route.snapshot.paramMap.get('category') },
  );
  readonly activeCategorySlug = computed(() => this.params());

  // Resolved category object (from the shell store cache).
  readonly category = computed<DocsCategory | null>(() => {
    const slug = this.activeCategorySlug();
    if (!slug) return null;
    return this.shellStore.categories().find((c) => c.slug === slug) ?? null;
  });

  // Filtered list of articles inside the active category, ordered by
  // sort_in_category. We hit the network for this so the article card
  // can show `summary`; the shell store only carries title-level data
  // for the sidebar.
  readonly articlesInCategory = computed<DocsArticle[]>(() => {
    const slug = this.activeCategorySlug();
    if (!slug) return [];
    return [...this.articlesByCategory()].sort(
      (a, b) => a.sort_in_category - b.sort_in_category,
    );
  });

  constructor() {
    // Keep the article list in sync with the URL. When the user clicks
    // a sidebar category, the route param changes, the effect fires,
    // and we re-fetch. We also keep the shell store's tree loaded so
    // the sidebar in the 3-col shell can highlight the active cat.
    effect(() => {
      const slug = this.activeCategorySlug();
      this.shellStore.ensureLoaded();
      if (slug) {
        this.loadArticles(slug);
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const cats = await this.docsService.listCategories();
      this.categories.set(cats);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  // Public so the (click)="loadArticles()" retry button in the
  // category error state can call it from the template.
  async loadArticles(slug?: string): Promise<void> {
    const cat = slug ?? this.activeCategorySlug();
    if (!cat) return;
    this.articlesLoading.set(true);
    this.articlesError.set(null);
    try {
      const list = await this.docsService.listArticlesByCategory(cat);
      this.articlesByCategory.set(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      this.articlesError.set(msg);
    } finally {
      this.articlesLoading.set(false);
    }
  }
}
