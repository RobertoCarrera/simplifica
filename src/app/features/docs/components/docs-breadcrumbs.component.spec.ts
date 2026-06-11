import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocsBreadcrumbsComponent } from './docs-breadcrumbs.component';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { provideRouter } from '@angular/router';
import { DocsService } from '../docs.service';

describe('DocsBreadcrumbsComponent', () => {
  let fixture: ComponentFixture<DocsBreadcrumbsComponent>;
  let component: DocsBreadcrumbsComponent;

  beforeEach(() => {
    // Stub DocsService so the upstream SupabaseClientService
    // construction chain doesn't crash in the unit-test env (no
    // runtime URL). The breadcrumbs component only reads
    // store.categories() to resolve a category name, so an empty
    // list is fine.
    TestBed.configureTestingModule({
      imports: [DocsBreadcrumbsComponent, TranslocoTestingModule.forRoot({})],
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
    fixture = TestBed.createComponent(DocsBreadcrumbsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('mounts and shows the home + docs root crumbs', () => {
    const nav: HTMLElement | null = fixture.nativeElement.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute('aria-label')).toBe('Breadcrumb');
  });

  it('omits the article crumb when articleTitleInput is null', () => {
    component.articleTitleInput = null;
    fixture.detectChanges();
    const ld = component.jsonLd();
    const parsed = JSON.parse(ld);
    // Home + docs only = 2 items
    expect(parsed.itemListElement.length).toBe(2);
  });

  it('includes the article crumb when given a slug + title', () => {
    component.categorySlug = 'clientes';
    component.articleSlug = 'crear-cliente';
    component.articleTitleInput = 'Cómo crear un cliente';
    fixture.detectChanges();
    const ld = component.jsonLd();
    const parsed = JSON.parse(ld);
    expect(parsed.itemListElement.length).toBe(4);
    expect(parsed['@type']).toBe('BreadcrumbList');
  });
});
