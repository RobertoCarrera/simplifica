import { TestBed } from '@angular/core/testing';
import { DocsLayoutComponent } from './docs-layout.component';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { DocsService } from './docs.service';

/**
 * Layout shell smoke test. The full route-aware render is covered by
 * e2e tests; here we just confirm the component mounts, exposes the
 * 3-column template skeleton, and uses the 3xl (>=1100px) breakpoint
 * for the 3-column grid + ToC + sidebar.
 *
 * Why a class assertion (not a real media query): Karma + jsdom does
 * not run Tailwind's CSS engine, so we cannot actually measure
 * computed styles. The classes themselves are the contract — Tailwind
 * compiles `3xl:grid-cols-[240px_1fr_220px]` into a `min-width:
 * 1100px` media query at build time.
 */
describe('DocsLayoutComponent', () => {
  beforeEach(() => {
    // Stub DocsService so the upstream SupabaseClientService
    // construction chain doesn't crash. The layout mounts the child
    // components (sidebar, search, breadcrumbs, ToC) but doesn't
    // trigger network calls at construction time.
    TestBed.configureTestingModule({
      imports: [DocsLayoutComponent, TranslocoTestingModule.forRoot({})],
      providers: [
        provideRouter([]),
        {
          provide: DocsService,
          useValue: {
            listCategories: async () => [],
            listArticleSummaries: async () => [],
          },
        },
      ],
    });
  });

  it('mounts without throwing', () => {
    const fixture = TestBed.createComponent(DocsLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el).toBeTruthy();
    // The 3-column grid wrapper class is always present
    expect(el.querySelector('.docs-shell')).toBeTruthy();
  });

  it('uses the 3xl (>=1100px) breakpoint for the 3-column grid', () => {
    const fixture = TestBed.createComponent(DocsLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const grid = el.querySelector('.grid.3xl\\:grid-cols-\\[240px_1fr_220px\\]');
    expect(grid).toBeTruthy();
  });

  it('hides the sidebar below 3xl (< 1100px)', () => {
    const fixture = TestBed.createComponent(DocsLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // The sidebar's parent column has the `hidden 3xl:block` pair.
    // We assert the class is present on a wrapper around <app-docs-sidebar>.
    const sidebar = el.querySelector('app-docs-sidebar');
    expect(sidebar).toBeTruthy();
    // Walk up to the column container.
    const col = sidebar?.parentElement;
    expect(col?.classList.contains('hidden')).toBeTrue();
    expect(col?.classList.contains('3xl:block')).toBeTrue();
  });

  it('hides the mobile tabs at 3xl (>= 1100px)', () => {
    const fixture = TestBed.createComponent(DocsLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const tabs = el.querySelector('app-docs-mobile-tabs');
    expect(tabs).toBeTruthy();
    // The tabs have a 3xl:hidden class attached to the <app-docs-mobile-tabs>
    // host element (we set it via `class="3xl:hidden"` on the tag).
    expect(tabs?.classList.contains('3xl:hidden')).toBeTrue();
  });

  it('hides the ToC below 3xl (< 1100px)', () => {
    const fixture = TestBed.createComponent(DocsLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const toc = el.querySelector('app-docs-toc');
    expect(toc).toBeTruthy();
    const col = toc?.parentElement;
    expect(col?.classList.contains('hidden')).toBeTrue();
    expect(col?.classList.contains('3xl:block')).toBeTrue();
  });
});
