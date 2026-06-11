import { Component, Input, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule, ChevronRight, Home, FileText } from 'lucide-angular';

import { DocsShellStore } from '../docs-shell.store';

/**
 * Breadcrumb for the /docs shell.
 *
 * Path: `Inicio > Documentación > [Categoría] > [Artículo]`
 *
 * - Every crumb except the last is a `<a routerLink>`.
 * - Emits Schema.org `BreadcrumbList` JSON-LD for SEO so Google
 *   surfaces the path in search results.
 */
@Component({
  selector: 'app-docs-breadcrumbs',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe, LucideAngularModule],
  template: `
    <nav
      class="flex flex-wrap items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
      aria-label="Breadcrumb"
    >
      <a
        routerLink="/inicio"
        class="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <lucide-icon [name]="HomeIcon" [size]="14"></lucide-icon>
        <span>{{ 'nav.inicio' | transloco }}</span>
      </a>
      <lucide-icon [name]="ChevronRightIcon" [size]="14"></lucide-icon>

      <a
        routerLink="/docs"
        class="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <lucide-icon [name]="FileTextIcon" [size]="14"></lucide-icon>
        <span>{{ 'nav.docs' | transloco }}</span>
      </a>

      @if (categoryName()) {
        <lucide-icon [name]="ChevronRightIcon" [size]="14"></lucide-icon>
        @if (categorySlug && !articleTitleInput) {
          <a
            [routerLink]="['/docs', categorySlug]"
            class="hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {{ categoryName() }}
          </a>
        } @else {
          <span class="text-gray-700 dark:text-gray-300">{{ categoryName() }}</span>
        }
      }

      @if (articleTitleInput) {
        <lucide-icon [name]="ChevronRightIcon" [size]="14"></lucide-icon>
        <span class="text-gray-900 dark:text-white font-medium truncate max-w-[60ch]">
          {{ articleTitleInput }}
        </span>
      }
    </nav>

    @if (jsonLd()) {
      <script type="application/ld+json" [textContent]="jsonLd()"></script>
    }
  `,
})
export class DocsBreadcrumbsComponent {
  private store = inject(DocsShellStore);
  private transloco = inject(TranslocoService);

  readonly HomeIcon = Home;
  readonly ChevronRightIcon = ChevronRight;
  readonly FileTextIcon = FileText;

  /** Category slug, e.g. "clientes". Null on the index page. */
  @Input() categorySlug: string | null = null;
  /** Article slug, e.g. "como-crear-un-cliente". Null on index/category pages. */
  @Input() articleSlug: string | null = null;
  /** Display title for the article (passed by parent so we don't refetch). */
  @Input() articleTitleInput: string | null = null;

  categoryName = computed<string | null>(() => {
    if (!this.categorySlug) return null;
    return (
      this.store
        .categories()
        .find((c) => c.slug === this.categorySlug)?.name ?? this.categorySlug
    );
  });

  jsonLd = computed<string>(() => {
    const items: { '@type': string; position: number; name: string; item: string }[] = [
      {
        '@type': 'ListItem',
        position: 1,
        name: this.transloco.translate('nav.inicio'),
        item: '/inicio',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: this.transloco.translate('nav.docs'),
        item: '/docs',
      },
    ];
    let pos = 3;
    const catName = this.categoryName();
    if (catName && this.categorySlug) {
      items.push({
        '@type': 'ListItem',
        position: pos++,
        name: catName,
        item: `/docs/${this.categorySlug}`,
      });
    }
    if (this.articleTitleInput && this.categorySlug && this.articleSlug) {
      items.push({
        '@type': 'ListItem',
        position: pos,
        name: this.articleTitleInput,
        item: `/docs/${this.categorySlug}/${this.articleSlug}`,
      });
    }
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items,
    });
  });
}

