import { TestBed } from '@angular/core/testing';
import { DocsLayoutComponent } from './docs-layout.component';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { DocsService } from './docs.service';

/**
 * Layout shell smoke test. The full route-aware render is covered by
 * e2e tests; here we just confirm the component mounts and exposes
 * the 3-column template skeleton.
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
});
