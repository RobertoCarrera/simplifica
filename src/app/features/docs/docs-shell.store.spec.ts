import { TestBed } from '@angular/core/testing';
import { DocsShellStore } from './docs-shell.store';
import { DocsService } from './docs.service';

/**
 * Smoke tests for the docs shell store. We don't hit Supabase here
 * (covered in docs.service.spec.ts); the store is exercised by the
 * layout, sidebar and footer-nav through signal reads.
 */
describe('DocsShellStore', () => {
  let store: DocsShellStore;

  beforeEach(() => {
    // Stub the upstream DocsService so its construction chain
    // (SimpleSupabaseService → SupabaseClientService → createClient)
    // doesn't try to call `createClient('', '')` at injection time
    // and crash the suite. The store's own tests below only touch
    // the in-memory signals + neighbours() helper.
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DocsService,
          useValue: {
            listCategories: async () => [],
            listArticleSummaries: async () => [],
          },
        },
      ],
    });
    store = TestBed.inject(DocsShellStore);
  });

  it('starts empty and unloaded', () => {
    expect(store.categories()).toEqual([]);
    expect(store.articles()).toEqual([]);
    expect(store.loading()).toBe(false);
    expect(store.loaded()).toBe(false);
    expect(store.sidebarTree()).toEqual([]);
    expect(store.flatArticles()).toEqual([]);
  });

  it('returns null prev/next for unknown article', () => {
    const result = store.neighbours('missing', 'missing');
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });
});
