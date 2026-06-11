import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { PLATFORM_ID, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { DocsArticleComponent } from './docs-article.component';
import { DocsService, DocsArticle } from './docs.service';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { AuthService } from '../../services/auth.service';

/**
 * Component tests for the /docs article view. Phase 5 ships:
 *  - markdown render via the service (component is a thin consumer)
 *  - ToC disclosure with H2/H3 entries
 *  - breadcrumb + title + summary
 *  - graceful empty/error states
 *
 * Prism highlight runs in `ngAfterViewChecked` — we don't assert on
 * it here, only that the component doesn't throw when the article
 * element is present.
 */
describe('DocsArticleComponent', () => {
  let fixture: ComponentFixture<DocsArticleComponent>;
  let component: DocsArticleComponent;
  let paramSubject: Subject<unknown>;

  const sampleArticle: DocsArticle = {
    id: 'a1',
    slug: 'instalacion',
    title: 'Cómo instalar el CRM',
    summary: 'Guía rápida de instalación',
    content_markdown: [
      '## Requisitos',
      '',
      'Necesitas Node 20+.',
      '',
      '```bash',
      'npm install',
      '```',
      '',
      '> [!INFO] Esto tarda un par de minutos.',
      '',
      '### Configuración',
      '',
      'Edita el archivo `config.json`.',
    ].join('\n'),
    content_html: null,
    category_id: 'c1',
    status: 'published',
    author_user_id: null,
    published_at: '2026-06-01T00:00:00Z',
    sort_in_category: 0,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  };

  function buildQueryChain(payload: unknown) {
    // Mimics the .from(...).select(...).eq(...).eq(...).maybeSingle()
    // chain that DocsService.getArticle uses. Every method returns
    // `this` for chaining; the terminal call returns a resolved
    // promise-like (thenable) so `await` works.
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve({ data: payload, error: null }),
    };
    return builder;
  }

  function setupRouter(): ActivatedRoute {
    paramSubject = new Subject();
    return {
      paramMap: paramSubject.asObservable(),
    } as unknown as ActivatedRoute;
  }

  beforeEach(async () => {
    const queryChain = buildQueryChain(sampleArticle);
    const supabaseStub = {
      getClient: () => ({
        from: () => queryChain,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [DocsArticleComponent],
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: SimpleSupabaseService, useValue: supabaseStub },
        // DocsService pulls AuthService at construction; stub it so
        // we don't drag the real SupabaseClientService chain
        // (which needs a runtime URL) into the unit test.
        {
          provide: AuthService,
          useValue: { userRole: signal('owner') } as unknown as AuthService,
        },
        { provide: ActivatedRoute, useFactory: setupRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DocsArticleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows a loading state initially', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders the article title, summary, and a published date', fakeAsync(() => {
    paramSubject.next({ get: (k: string) => (k === 'category' ? 'guia' : 'instalacion') });
    tick();
    fixture.detectChanges();
    tick();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Cómo instalar el CRM');
    expect(compiled.textContent).toContain('Guía rápida de instalación');
    expect(compiled.querySelector('h1')?.textContent).toContain('Cómo instalar el CRM');
  }));

  it('renders the markdown body via the service (headings, code, callouts)', fakeAsync(() => {
    paramSubject.next({ get: (k: string) => (k === 'category' ? 'guia' : 'instalacion') });
    tick();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const body = fixture.nativeElement.querySelector('.docs-article-body') as HTMLElement | null;
    expect(body).toBeTruthy();
    // Marked → DOMPurify should yield an H2 with an auto id.
    const h2 = body?.querySelector('h2');
    expect(h2?.textContent).toContain('Requisitos');
    expect(h2?.getAttribute('id')).toBe('requisitos');
    // Fenced code block with the bash language class.
    const pre = body?.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre?.querySelector('code')?.className).toContain('language-bash');
    // GitHub-like callout.
    const callout = body?.querySelector('.callout.callout--info');
    expect(callout).toBeTruthy();
    expect(callout?.textContent).toContain('Esto tarda un par de minutos');
  }));

  it('exposes the heading list for the in-page ToC', fakeAsync(() => {
    paramSubject.next({ get: (k: string) => (k === 'category' ? 'guia' : 'instalacion') });
    tick();
    fixture.detectChanges();
    tick();

    const headings = component.headings();
    const ids = headings.map((h) => h.id);
    const levels = headings.map((h) => h.level);
    expect(ids).toContain('requisitos');
    expect(ids).toContain('configuracion');
    expect(levels).toEqual(levels.map((l) => (l === 1 ? 2 : l))); // H1 stripped
    // No H1 from the source should leak into the ToC.
    expect(headings.find((h) => h.level === 1)).toBeUndefined();
  }));
});
