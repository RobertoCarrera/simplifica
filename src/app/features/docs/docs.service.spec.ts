import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DocsService, DocSearchHit } from './docs.service';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { AuthService } from '../../services/auth.service';

/**
 * Phase 6 tests for the docs service.
 *
 * We mock SimpleSupabaseService (so we don't need a real connection) and
 * AuthService (heavy DI). The RPC is a security-invoker function in
 * Supabase — its row filter happens in SQL, not in the client, so the
 * service can only guarantee:
 *   - trims the query
 *   - short-circuits to [] when query.length < 2
 *   - calls supabase.rpc('docs_search', { q, p_limit }) with the trimmed
 *     query and the requested limit
 *
 * Role-based filtering is verified separately by the SQL test fixtures
 * (see supabase/tests/docs_search.test.sql, run via psql).
 */
describe('DocsService', () => {
  let service: DocsService;
  let mockRpc: jasmine.Spy;
  let mockFrom: jasmine.Spy;
  let mockUserRole: ReturnType<typeof signal<string>>;

  const rpcHits: DocSearchHit[] = [
    {
      id: 'a1',
      slug: 'crear-un-presupuesto',
      title: 'Cómo crear un presupuesto',
      summary: null,
      category_slug: 'presupuestos',
      category_name: 'Presupuestos',
      rank: 0.86,
    },
    {
      id: 'a2',
      slug: 'cliente-importar-csv',
      title: 'Cómo importar clientes desde CSV',
      summary: null,
      category_slug: 'clientes',
      category_name: 'Clientes',
      rank: 0.71,
    },
  ];

  beforeEach(() => {
    mockUserRole = signal<string>('owner');
    mockRpc = jasmine.createSpy('rpc').and.resolveTo({ data: rpcHits, error: null });
    mockFrom = jasmine.createSpy('from');

    const fromChain = {
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    };
    mockFrom.and.returnValue(fromChain);

    const mockSupabase = {
      getClient: () => ({
        rpc: mockRpc,
        from: mockFrom,
      }),
    } as unknown as SimpleSupabaseService;

    const mockAuth = {
      userRole: mockUserRole,
    } as unknown as AuthService;

    TestBed.configureTestingModule({
      providers: [
        DocsService,
        { provide: SimpleSupabaseService, useValue: mockSupabase },
        { provide: AuthService, useValue: mockAuth },
      ],
    });
    service = TestBed.inject(DocsService);
  });

  it('should be created and mirror userRole from AuthService', () => {
    expect(service).toBeTruthy();
    expect(service.userRole()).toBe('owner');
  });

  it('search() returns [] without calling RPC when query is shorter than 2 chars', async () => {
    const r1 = await service.search('');
    const r2 = await service.search('a');
    const r3 = await service.search('   '); // whitespace only → trimmed length 0
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
    expect(r3).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('search() calls docs_search RPC with trimmed query and default limit 8', async () => {
    await service.search('  cliente  ');
    expect(mockRpc).toHaveBeenCalledOnceWith('docs_search', { q: 'cliente', p_limit: 8 });
  });

  it('search() honours the requested limit', async () => {
    await service.search('factura', 3);
    expect(mockRpc).toHaveBeenCalledOnceWith('docs_search', { q: 'factura', p_limit: 3 });
  });

  it('search() returns the hits from the RPC', async () => {
    const r = await service.search('cliente');
    expect(r.length).toBe(2);
    expect(r[0].slug).toBe('crear-un-presupuesto');
    expect(r[1].category_slug).toBe('clientes');
  });

  it('search() rejects when the RPC errors so the component can show a toast', async () => {
    mockRpc.and.resolveTo({ data: null, error: { message: 'boom' } });
    // Swallow the rejection — we just want to confirm it propagates, not
    // whether the service hides it. The component catches it and shows an
    // empty state in the UI; a future toast layer will surface the error.
    let caught: unknown = null;
    try {
      await service.search('cliente');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();
  });

  it('search() with a null/undefined query behaves like empty', async () => {
    const r1 = await service.search(null as unknown as string);
    const r2 = await service.search(undefined as unknown as string);
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
