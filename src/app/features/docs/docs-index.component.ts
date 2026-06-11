import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, BookOpen, FileText, ChevronRight } from 'lucide-angular';

import { DocsService, DocsCategory } from './docs.service';

/**
 * Landing for /docs. Phase 3 ships a category-card grid; Phase 4
 * will wrap it in the 3-column shell (sidebar of categories +
 * content + ToC). For now it lists categories fetched live from
 * docs_categories via RLS-protected reads.
 */
@Component({
  selector: 'app-docs-index',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe, LucideAngularModule],
  template: `
    <div class="p-6 md:p-8 max-w-6xl mx-auto">
      <!-- Header. Note: the layout's sticky header already renders the
           breadcrumb (Inicio › Documentación › [Categoría]); the index
           page only contributes the title and lead paragraph. -->
      <header class="mb-8">
        <div class="flex items-center gap-3 mb-2">
          <div
            class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center"
          >
            <lucide-icon [name]="BookOpenIcon" [size]="20"></lucide-icon>
          </div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ 'nav.docs' | transloco }}
          </h1>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          Guías, manuales y procedimientos del CRM. Selecciona una categoría
          para ver los artículos disponibles para tu rol.
        </p>
      </header>

      <!-- Loading -->
      @if (loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div
              class="h-32 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
            ></div>
          }
        </div>
      }

      <!-- Error -->
      @if (error() && !loading()) {
        <div
          class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300"
        >
          <p class="font-medium mb-1">No se pudo cargar la documentación.</p>
          <p class="text-sm opacity-80">{{ error() }}</p>
          <button
            type="button"
            (click)="load()"
            class="mt-3 text-sm font-medium underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      }

      <!-- Empty (categories exist in DB but role hides them) -->
      @if (!loading() && !error() && categories().length === 0) {
        <div
          class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center"
        >
          <lucide-icon
            [name]="BookOpenIcon"
            [size]="32"
            class="mx-auto text-gray-400 mb-3"
          ></lucide-icon>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            No hay contenido visible para tu rol todavía.
          </p>
        </div>
      }

      <!-- Category grid -->
      @if (!loading() && !error() && categories().length > 0) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (cat of categories(); track cat.id) {
            <a
              [routerLink]="['/docs', cat.slug]"
              class="group block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:border-blue-500/50 transition-colors"
            >
              <div class="flex items-start gap-3 mb-3">
                <div
                  class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
                >
                  <lucide-icon [name]="FileTextIcon" [size]="16"></lucide-icon>
                </div>
                <h3
                  class="text-base font-semibold text-gray-900 dark:text-white leading-snug"
                >
                  {{ cat.name }}
                </h3>
              </div>
              @if (cat.description) {
                <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                  {{ cat.description }}
                </p>
              }
              <div
                class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400"
              >
                Ver artículos
                <lucide-icon [name]="ChevronRightIcon" [size]="12"></lucide-icon>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class DocsIndexComponent implements OnInit {
  private docsService = inject(DocsService);

  readonly BookOpenIcon = BookOpen;
  readonly FileTextIcon = FileText;
  readonly ChevronRightIcon = ChevronRight;

  categories = signal<DocsCategory[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const cats = await this.docsService.listCategories();
      this.categories.set(cats);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }
}
