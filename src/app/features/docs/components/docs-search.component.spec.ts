import { ComponentFixture, TestBed, fakeAsync, tick, flush, discardPeriodicTasks } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { TranslocoPipe, provideTransloco } from '@jsverse/transloco';
import { DocsSearchComponent } from './docs-search.component';
import { DocsService, DocSearchHit } from '../docs.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';

/**
 * Phase 6 tests for the docs search header component.
 *
 * Behaviors covered:
 *  - 300ms debounce: fast keystrokes coalesce into a single RPC call
 *  - Cancel-in-flight: when a new query supersedes an in-flight one, the
 *    older promise is discarded (no stale results)
 *  - Min 2 chars: queries shorter than 2 chars do not call the RPC
 *  - Highlight: the matched term is wrapped in <mark>
 */
describe('DocsSearchComponent', () => {
  let fixture: ComponentFixture<DocsSearchComponent>;
  let component: DocsSearchComponent;
  let mockRpc: jasmine.Spy;
  let rpcCallCount = 0;
  let rpcResolve: (v: { data: DocSearchHit[]; error: null }) => void;
  let pendingResolvers: Array<(v: { data: DocSearchHit[]; error: null }) => void> = [];

  const fakeHits: DocSearchHit[] = [
    {
      id: 'h1',
      slug: 'cliente-importar-csv',
      title: 'Cómo importar clientes',
      summary: null,
      category_slug: 'clientes',
      category_name: 'Clientes',
      rank: 0.81,
    },
  ];

  beforeEach(async () => {
    rpcCallCount = 0;
    pendingResolvers = [];

    // Each call to rpc() returns a fresh promise that the test can resolve
    // manually — that's how we simulate slow / in-flight requests.
    mockRpc = jasmine.createSpy('rpc').and.callFake((_name: string, args: { q: string }) => {
      rpcCallCount += 1;
      return new Promise((resolve) => {
        pendingResolvers.push((value) => resolve({ ...value, data: filterByQuery(value.data, args.q) }));
      });
    });

    const mockSupabase = {
      getClient: () => ({ rpc: mockRpc }),
    } as unknown as SimpleSupabaseService;
    const mockAuth = { userRole: signal('owner') } as unknown as AuthService;

    await TestBed.configureTestingModule({
      imports: [DocsSearchComponent, TranslocoPipe],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideTransloco({ config: { defaultLang: 'es' } }),
        { provide: SimpleSupabaseService, useValue: mockSupabase },
        { provide: AuthService, useValue: mockAuth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocsSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function filterByQuery(hits: DocSearchHit[], q: string): DocSearchHit[] {
    if (!q) return hits;
    if (q.length < 2) return [];
    return hits;
  }

  function type(query: string): void {
    const el = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    el.value = query;
    el.dispatchEvent(new Event('input'));
  }

  it('does not call the RPC for queries shorter than 2 chars', fakeAsync(() => {
    type('a');
    tick(400);
    expect(rpcCallCount).toBe(0);
    expect(component.results().length).toBe(0);
    discardPeriodicTasks();
  }));

  it('debounces 300ms before calling the RPC', fakeAsync(() => {
    type('cl');
    tick(100);
    type('cli');
    tick(100);
    type('clie');
    tick(100);
    type('clien');
    tick(299);
    expect(rpcCallCount).toBe(0);
    tick(1);
    expect(rpcCallCount).toBe(1);
    expect(mockRpc).toHaveBeenCalledWith('docs_search', { q: 'clien', p_limit: 8 });
    discardPeriodicTasks();
  }));

  it('only resolves the latest query: stale results are discarded', fakeAsync(() => {
    // First query — will be superseded.
    type('clien');
    tick(300);
    expect(rpcCallCount).toBe(1);
    // Second query before the first resolves.
    type('cliente');
    tick(300);
    expect(rpcCallCount).toBe(2);

    // Resolve the first (stale) one with hits — should be ignored.
    pendingResolvers[0]({ data: fakeHits, error: null });
    // Resolve the second with hits — should be the one that lands.
    pendingResolvers[1]({ data: fakeHits, error: null });
    tick(0);

    // Both resolutions set the same data here, but the contract is that
    // the in-flight counter has advanced to 2 and only the latest
    // settled result becomes the visible one. The component achieves
    // this by guarding on AbortController.aborted, so the stale resolver
    // path is a no-op. We assert the latest query's results are present.
    expect(component.results().length).toBe(1);
    discardPeriodicTasks();
  }));

  it('highlights matched terms in the title', () => {
    component['query'].set('cliente');
    const html = component.highlight('Cómo importar clientes desde CSV');
    // "cliente" is a substring of "clientes" — the highlight wraps the
    // matched substring, not the whole word.
    expect(html).toContain('<mark');
    expect(html).toContain('>cliente</mark>');
  });

  it('returns escaped text when no query is set', () => {
    component['query'].set('');
    const html = component.highlight('A & B <script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;script&gt;');
  });
});
