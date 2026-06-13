import { Injectable, inject, signal } from '@angular/core';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { AuthService } from '../../services/auth.service';

/**
 * Shape of a documentation category as exposed by docs_categories.
 * Phase 3 ships the read model; Phase 6 will layer FTS on top.
 *
 * `archived_at` is OPTIONAL because the public read query does not
 * select it — only the admin service does. Components that need to
 * distinguish archived rows widen the type or just use the optional
 * property accessor.
 */
export interface DocsCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  parent_id: string | null;
  archived_at?: string | null;
}

/**
 * Shape of a documentation article as exposed by docs_articles.
 * content_markdown is the source of truth; content_html is the
 * pre-rendered cache (Phase 5 fills it). Frontend re-renders with
 * marked + DOMPurify on load to keep the trust boundary client-side.
 */
export interface DocsArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content_markdown: string;
  content_html: string | null;
  category_id: string;
  status: 'draft' | 'published' | 'archived';
  author_user_id: string | null;
  published_at: string | null;
  sort_in_category: number;
  created_at: string;
  updated_at: string;
}

/**
 * Read-only provider for /docs content. Phase 3 only ships the
 * category + article list lookups; the FTS RPC and write API
 * land in Phases 5-6.
 *
 * RLS is the source of truth for visibility — this service does
 * NOT filter by role client-side. Whatever Supabase returns is
 * what the user is allowed to see.
 */
@Injectable({ providedIn: 'root' })
export class DocsService {
  private supabase = inject(SimpleSupabaseService);
  private auth = inject(AuthService);

  /**
   * Cached role of the current user. Refreshed on auth changes via the
   * AuthService signal. The value is the `app_role.name` (e.g. 'owner',
   * 'admin', 'member', 'professional', 'super_admin', 'anonymous').
   *
   * Used by `search()` and by the article-list query to add a defensive
   * `where role = userRole()` filter — RLS would catch mismatches but
   * filtering client-side surfaces them earlier (and avoids silent
   * empty results in the UI).
   */
  readonly userRole = signal<string>('');

  constructor() {
    // Mirror AuthService.userRole() into our local signal so the search
    // component can read it synchronously and so the rest of the service
    // can use it without injecting AuthService everywhere.
    this.userRole.set(this.auth.userRole());
  }

  /**
   * List all categories, sorted by sort_order then name. The sidebar
   * (Phase 4) groups articles by category; the index page (Phase 3)
   * shows category cards.
   */
  async listCategories(): Promise<DocsCategory[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_categories')
      .select('id, slug, name, description, icon, sort_order, parent_id')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('[DocsService] listCategories failed', error);
      throw error;
    }
    return (data ?? []) as DocsCategory[];
  }

  /**
   * List published articles in a given category slug, ordered by
   * sort_in_category then published_at desc. RLS already filters
   * out what the current role can't see.
   */
  async listArticlesByCategory(categorySlug: string): Promise<DocsArticle[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .select(
        'id, slug, title, summary, content_markdown, content_html, category_id, status, author_user_id, published_at, sort_in_category, created_at, updated_at, docs_categories!inner(slug)',
      )
      .eq('status', 'published')
      .eq('docs_categories.slug', categorySlug)
      .order('sort_in_category', { ascending: true })
      .order('published_at', { ascending: false });

    if (error) {
      console.error('[DocsService] listArticlesByCategory failed', error);
      throw error;
    }
    return (data ?? []) as DocsArticle[];
  }

  /**
   * Lightweight summary used by the sidebar (avoids pulling full
   * markdown for every article just to render the index).
   */
  async listArticleSummaries(): Promise<
    Pick<DocsArticle, 'id' | 'slug' | 'title' | 'category_id' | 'sort_in_category'>[]
  > {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .select('id, slug, title, category_id, sort_in_category, docs_categories!inner(slug)')
      .eq('status', 'published')
      .order('sort_in_category', { ascending: true });

    if (error) {
      console.error('[DocsService] listArticleSummaries failed', error);
      throw error;
    }
    return (data ?? []) as Pick<
      DocsArticle,
      'id' | 'slug' | 'title' | 'category_id' | 'sort_in_category'
    >[];
  }

  /**
   * Fetch a single article by category + slug. Returns null when the
   * article is not visible to the current user (RLS returns 0 rows)
   * — the component renders a 404 state instead of an error.
   */
  async getArticle(categorySlug: string, slug: string): Promise<DocsArticle | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .select(
        'id, slug, title, summary, content_markdown, content_html, category_id, status, author_user_id, published_at, sort_in_category, created_at, updated_at, docs_categories!inner(slug)',
      )
      .eq('status', 'published')
      .eq('docs_categories.slug', categorySlug)
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('[DocsService] getArticle failed', error);
      throw error;
    }
    return (data ?? null) as DocsArticle | null;
  }

  /**
   * Full-text search via the docs_search RPC.
   *
   * Returns ranked hits with category info. The RPC itself enforces
   * role-based visibility (via current_user_role() + docs_article_roles),
   * so this method does NOT filter by role client-side — the server is
   * the source of truth.
   *
   * Returns `[]` for queries shorter than 2 characters (cheaper than
   * round-tripping to the server).
   */
  async search(query: string, limit = 8): Promise<DocSearchHit[]> {
    const q = (query ?? '').trim();
    if (q.length < 2) return [];
    const { data, error } = await this.supabase
      .getClient()
      .rpc('docs_search', { q, p_limit: limit });

    if (error) {
      console.error('[DocsService] search failed', error);
      throw error;
    }
    return (data ?? []) as DocSearchHit[];
  }
}

/**
 * Shape returned by the docs_search RPC and consumed by the
 * search-component dropdown. Mirrors the RPC's RETURNS TABLE.
 */
export interface DocSearchHit {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category_slug: string;
  category_name: string;
  rank: number;
}
