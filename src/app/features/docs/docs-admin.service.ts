import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { AuthService } from '../../services/auth.service';
import { DocsCategory, DocsArticle } from './docs.service';

/**
 * Admin-only write/read API for the documentation module.
 *
 * Only loaded / injected when `EditModeService` is active and the
 * current user is a superadmin. RLS at the database level is the
 * real source of truth — every write here is gated by
 * `current_user_role() = 'super_admin'`.
 *
 * The read methods (`listAllCategoriesForAdmin`, `listArticlesForAdmin`)
 * include archived rows, which require the `archived_at` column
 * added by the 20260612000000_docs_admin_rls.sql migration. If the
 * migration is not applied, the methods return [] (not throw) so
 * the in-place editor still loads in a usable state.
 */
@Injectable({ providedIn: 'root' })
export class DocsAdminService {
  private supabase = inject(SimpleSupabaseService);
  private auth = inject(AuthService);

  // ── categories ────────────────────────────────────────────────────────

  /**
   * Admin: list ALL categories (active + archived). Tolerant of the
   * pre-migration state (returns [] if `archived_at` is missing).
   */
  async listAllCategoriesForAdmin(): Promise<DocsCategory[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_categories')
      .select('id, slug, name, description, icon, sort_order, parent_id, archived_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      if (error.code === '42703') {
        console.warn(
          '[DocsAdminService] archived_at column missing. Apply 20260612000000_docs_admin_rls.sql.',
        );
        return [];
      }
      throw error;
    }
    return (data ?? []) as unknown as DocsCategory[];
  }

  async createCategory(input: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    parent_id?: string | null;
    sort_order?: number;
  }): Promise<DocsCategory> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_categories')
      .insert({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        icon: input.icon ?? null,
        parent_id: input.parent_id ?? null,
        sort_order: input.sort_order ?? 0,
      })
      .select('id, slug, name, description, icon, sort_order, parent_id, archived_at')
      .single();
    if (error) throw error;
    return data as DocsCategory;
  }

  async updateCategory(
    id: string,
    patch: Partial<{
      name: string;
      slug: string;
      description: string | null;
      icon: string | null;
      parent_id: string | null;
      sort_order: number;
      archived_at: string | null;
    }>,
  ): Promise<DocsCategory> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_categories')
      .update(patch)
      .eq('id', id)
      .select('id, slug, name, description, icon, sort_order, parent_id, archived_at')
      .single();
    if (error) throw error;
    return data as DocsCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('docs_categories')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async archiveCategory(id: string, archived: boolean): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('docs_categories')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw error;
  }

  async reorderCategories(ids: string[]): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .rpc('docs_reorder_categories', { p_ids: ids });
    if (error) throw error;
  }

  // ── articles ──────────────────────────────────────────────────────────

  /**
   * Admin: list ALL articles in a category (any status). Tolerant of
   * the pre-migration state for the rare case where category_id RLS
   * changes haven't been applied.
   */
  async listArticlesForAdmin(categorySlug: string): Promise<DocsArticle[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .select(
        'id, slug, title, summary, content_markdown, content_html, category_id, status, author_user_id, published_at, sort_in_category, created_at, updated_at, docs_categories!inner(slug)',
      )
      .eq('docs_categories.slug', categorySlug)
      .order('sort_in_category', { ascending: true })
      .order('updated_at', { ascending: false });
    if (error) {
      if (error.code === '42703') {
        console.warn(
          '[DocsAdminService] column missing in listArticlesForAdmin. Apply the migration.',
        );
        return [];
      }
      throw error;
    }
    return (data ?? []) as unknown as DocsArticle[];
  }

  async getArticleForAdmin(id: string): Promise<DocsArticle> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .select(
        'id, slug, title, summary, content_markdown, content_html, category_id, status, author_user_id, published_at, sort_in_category, created_at, updated_at',
      )
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as DocsArticle;
  }

  async createArticle(input: {
    category_id: string;
    title: string;
    slug: string;
    summary?: string | null;
    body_html: string;
    body_markdown: string;
    status: 'draft' | 'published' | 'archived';
  }): Promise<DocsArticle> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .insert({
        category_id: input.category_id,
        title: input.title,
        slug: input.slug,
        summary: input.summary ?? null,
        content_html: input.body_html,
        content_markdown: input.body_markdown,
        status: input.status,
        published_at: input.status === 'published' ? new Date().toISOString() : null,
      })
      .select(
        'id, slug, title, summary, content_markdown, content_html, category_id, status, author_user_id, published_at, sort_in_category, created_at, updated_at',
      )
      .single();
    if (error) throw error;
    return data as DocsArticle;
  }

  async updateArticle(
    id: string,
    patch: Partial<{
      category_id: string;
      title: string;
      slug: string;
      summary: string | null;
      content_html: string;
      content_markdown: string;
      sort_in_category: number;
      status: 'draft' | 'published' | 'archived';
      published_at: string | null;
    }>,
  ): Promise<DocsArticle> {
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .update(patch)
      .eq('id', id)
      .select(
        'id, slug, title, summary, content_markdown, content_html, category_id, status, author_user_id, published_at, sort_in_category, created_at, updated_at',
      )
      .single();
    if (error) throw error;
    return data as DocsArticle;
  }

  async deleteArticle(id: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Workflow helper: set status (draft | published | archived) and
   * stamp published_at on the first publish.
   */
  async setArticleStatus(
    id: string,
    status: 'draft' | 'published' | 'archived',
  ): Promise<DocsArticle> {
    const patch: Record<string, unknown> = { status };
    if (status === 'published') {
      patch['published_at'] = new Date().toISOString();
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('docs_articles')
      .update(patch)
      .eq('id', id)
      .select(
        'id, slug, title, summary, content_markdown, content_html, category_id, status, author_user_id, published_at, sort_in_category, created_at, updated_at',
      )
      .single();
    if (error) throw error;
    return data as DocsArticle;
  }

  async reorderArticles(categoryId: string, ids: string[]): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .rpc('docs_reorder_articles', { p_category_id: categoryId, p_ids: ids });
    if (error) throw error;
  }
}
