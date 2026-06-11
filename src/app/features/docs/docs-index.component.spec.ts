import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';

import { DocsIndexComponent } from './docs-index.component';
import { DocsService, DocsCategory, DocsArticle } from './docs.service';
import { DocsShellStore } from './docs-shell.store';

/**
 * Tests for the `/docs` landing + category article list.
 *
 * Phase 4 (Fase 4 — UI Shell) added:
 *   - An article list view at `/docs/:category` (was a no-op stub
 *     before, rendering the same category grid regardless of route).
 *   - The "Esta categoría no tiene artículos todavía" empty state
 *     when the role hides everything in the category.
 *
 * We stub the DocsService and the DocsShellStore directly so the
 * tests don't need a Supabase client.
 */
describe('DocsIndexComponent', () => {
  // ── Test fixtures ──────────────────────────────────────────────
  const categories: DocsCategory[] = [
    {
      id: 'cat-1',
      slug: 'clientes',
      name: 'Clientes',
      description: 'Gestión de clientes del CRM',
      icon: null,
      sort_order: 1,
      parent_id: null,
    },
    {
      id: 'cat-2',
      slug: 'admin',
      name: 'Administración',
      description: null,
      icon: null,
      sort_order: 2,
      parent_id: null,
    },
  ];

  const articlesInClientes: DocsArticle[] = [
    {
      id: 'art-1',
      slug: 'como-crear-cliente',
      title: 'Cómo crear un cliente',
      summary: 'Alta manual desde el panel CRM',
      content_markdown: '',
      content_html: null,
      category_id: 'cat-1',
      status: 'published',
      author_user_id: null,
      published_at: '2026-01-15T00:00:00Z',
      sort_in_category: 1,
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-01-15T00:00:00Z',
    },
    {
      id: 'art-2',
      slug: 'importar-clientes-csv',
      title: 'Importar clientes desde CSV',
      summary: null,
      content_markdown: '',
      content_html: null,
      category_id: 'cat-1',
      status: 'published',
      author_user_id: null,
      published_at: '2026-02-01T00:00:00Z',
      sort_in_category: 2,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    },
  ];

  // ── Mocks ──────────────────────────────────────────────────────
  function makeMocks(opts: {
    categoryParam: string | null;
    articlesByCat?: Record<string, DocsArticle[]>;
  }) {
    const articlesByCat = opts.articlesByCat ?? {};

    const docsService = {
      listCategories: async () =>
        opts.categoryParam === null ? categories : categories,
      listArticlesByCategory: async (slug: string) =>
        articlesByCat[slug] ?? [],
    };

    // Tiny stub of the shell store so the component can resolve the
    // current category name + ensureLoaded() is a no-op.
    const shellStore = {
      categories: signal<DocsCategory[]>(categories),
      ensureLoaded: async () => undefined,
    };

    const fakeRoute = {
      paramMap: of({
        get: (k: string) => (k === 'category' ? opts.categoryParam : null),
      }),
      snapshot: {
        paramMap: {
          get: (k: string) => (k === 'category' ? opts.categoryParam : null),
        },
      },
    };

    return { docsService, shellStore, fakeRoute };
  }

  // ── Helpers ────────────────────────────────────────────────────
  async function setup(opts: {
    categoryParam: string | null;
    articlesByCat?: Record<string, DocsArticle[]>;
  }) {
    const { docsService, shellStore, fakeRoute } = makeMocks(opts);
    await TestBed.configureTestingModule({
      imports: [DocsIndexComponent, TranslocoTestingModule.forRoot({})],
      providers: [
        provideRouter([]),
        { provide: DocsService, useValue: docsService },
        { provide: DocsShellStore, useValue: shellStore },
        { provide: ActivatedRoute, useValue: fakeRoute },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocsIndexComponent);
    fixture.detectChanges();
    // Flush microtasks so the effect() that calls loadArticles runs.
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  // ── Tests ──────────────────────────────────────────────────────

  it('renders the category card grid on /docs (no :category param)', async () => {
    const fixture = await setup({ categoryParam: null });
    const el: HTMLElement = fixture.nativeElement;
    // Both category names should appear in the card grid.
    expect(el.textContent).toContain('Clientes');
    expect(el.textContent).toContain('Administración');
    // No empty state for a category list.
    expect(el.querySelector('[data-testid="docs-category-empty"]')).toBeNull();
  });

  it('renders the article list when /docs/:category is active', async () => {
    const fixture = await setup({
      categoryParam: 'clientes',
      articlesByCat: { clientes: articlesInClientes },
    });
    const el: HTMLElement = fixture.nativeElement;
    // Article titles in the list.
    expect(el.textContent).toContain('Cómo crear un cliente');
    expect(el.textContent).toContain('Importar clientes desde CSV');
    // The category name appears in the page header.
    expect(el.textContent).toContain('Clientes');
  });

  it('shows the empty state when the active category has no articles', async () => {
    const fixture = await setup({
      categoryParam: 'admin',
      articlesByCat: { admin: [] },
    });
    const el: HTMLElement = fixture.nativeElement;
    const empty = el.querySelector('[data-testid="docs-category-empty"]');
    expect(empty).toBeTruthy();
    // Article cards are NOT rendered in the empty branch.
    expect(el.textContent).not.toContain('Cómo crear un cliente');
  });
});
