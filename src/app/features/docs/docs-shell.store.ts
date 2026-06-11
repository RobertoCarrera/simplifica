import { Injectable, signal, computed, inject } from '@angular/core';
import { DocsService, DocsArticle, DocsCategory } from './docs.service';

/**
 * Shape used by the sidebar tree. Each entry is a category with its
 * published articles attached (RLS already filters what the user can
 * see — we just project into a usable tree).
 */
export interface DocsSidebarCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  articles: { id: string; slug: string; title: string; sort_in_category: number }[];
}

/**
 * Loaded by DocsLayoutComponent once per session and shared with the
 * sidebar, breadcrumbs, ToC nav and prev/next footer via signal reads.
 *
 * Why a service: the layout owns the data, child components read it.
 * Reloads are idempotent (cached after the first load) so navigating
 * between articles does not refetch the full tree.
 */
@Injectable({ providedIn: 'root' })
export class DocsShellStore {
  private docs = inject(DocsService);

  readonly categories = signal<DocsCategory[]>([]);
  readonly articles = signal<DocsArticle[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);

  /** Tree: categories in `sort_order` with their articles attached. */
  readonly sidebarTree = computed<DocsSidebarCategory[]>(() => {
    const cats = this.categories();
    const arts = this.articles();
    return cats.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      sort_order: c.sort_order,
      articles: arts
        .filter((a) => a.category_id === c.id)
        .map((a) => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          sort_in_category: a.sort_in_category,
        }))
        .sort((a, b) => a.sort_in_category - b.sort_in_category),
    }));
  });

  /** Flat ordered list — used for prev/next. */
  readonly flatArticles = computed(() => {
    const cats = [...this.categories()].sort((a, b) => a.sort_order - b.sort_order);
    const out: { category: DocsCategory; article: DocsArticle }[] = [];
    for (const c of cats) {
      const items = this.articles()
        .filter((a) => a.category_id === c.id)
        .sort((a, b) => a.sort_in_category - b.sort_in_category);
      for (const a of items) out.push({ category: c, article: a });
    }
    return out;
  });

  /** Ensure the tree is loaded. Safe to call from any layout child. */
  async ensureLoaded(): Promise<void> {
    if (this.loaded() || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [cats, arts] = await Promise.all([
        this.docs.listCategories(),
        this.docs.listArticleSummaries() as unknown as Promise<DocsArticle[]>,
      ]);
      this.categories.set(cats);
      this.articles.set(arts);
      this.loaded.set(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  /** Compute prev/next neighbours for an article inside a category. */
  neighbours(
    categorySlug: string,
    articleSlug: string,
  ): { prev: { category: DocsCategory; article: DocsArticle } | null; next: { category: DocsCategory; article: DocsArticle } | null } {
    const flat = this.flatArticles();
    const idx = flat.findIndex(
      (x) => x.category.slug === categorySlug && x.article.slug === articleSlug,
    );
    if (idx < 0) return { prev: null, next: null };
    return {
      prev: idx > 0 ? flat[idx - 1] : null,
      next: idx < flat.length - 1 ? flat[idx + 1] : null,
    };
  }
}
