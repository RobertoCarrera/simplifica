import { Routes } from '@angular/router';
import { DocsLayoutComponent } from './docs-layout.component';
import { DocsIndexComponent } from './docs-index.component';
import { DocsArticleComponent } from './docs-article.component';

/**
 * Lazy-loaded routes for the /docs feature.
 *
 * Layout: the parent path is wrapped in DocsLayoutComponent (the
 * 3-column shell — sidebar + content + ToC + breadcrumbs + search).
 * Children render inside the shell's <router-outlet>.
 *
 *  - `''`                → category grid (landing)
 *  - `:category`         → category-filtered article list
 *  - `:category/:slug`   → single article
 *
 * Auth is enforced by the parent route in app.routes.ts (StaffGuard).
 */
export const docsRoutes: Routes = [
  {
    path: '',
    component: DocsLayoutComponent,
    children: [
      { path: '', component: DocsIndexComponent, pathMatch: 'full' },
      { path: ':category/:slug', component: DocsArticleComponent },
      { path: ':category', component: DocsIndexComponent },
    ],
  },
];
