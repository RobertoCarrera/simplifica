import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, BookOpen, FileText, ChevronRight, Plus, GripVertical, MoreVertical, Edit3, Archive, ArchiveRestore, Trash2, X, Check } from 'lucide-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { DocsService, DocsCategory, DocsArticle } from './docs.service';
import { DocsAdminService } from './docs-admin.service';
import { DocsShellStore } from './docs-shell.store';
import { EditModeService } from './edit-mode.service';

/**
 * `/docs` landing + category article list.
 *
 * Read mode (default):
 *   - `/docs`         → category card grid.
 *   - `/docs/:cat`    → article list within that category.
 *
 * Edit mode (EditModeService.editMode === true, superadmin only):
 *   - Same routes render the same data, but every card becomes
 *     inline-editable: name/description are click-to-edit, each
 *     row has a drag handle and a "more" menu (archive/restore/
 *     hard delete), and "+" buttons appear between cards to add
 *     new content in the right position.
 *
 * Edits are flushed through DocsAdminService. RLS at the database
 * level is the real source of truth.
 */
@Component({
  selector: 'app-docs-index',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslocoPipe, LucideAngularModule],
  template: `
    <div class="p-6 md:p-8 max-w-6xl mx-auto">
      <!-- LANDING: category card grid (route is /docs with no :category) -->
      @if (!activeCategorySlug()) {
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

        @if (loading()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            @for (i of [1,2,3,4,5,6]; track i) {
              <div class="h-32 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"></div>
            }
          </div>
        }

        @if (error() && !loading()) {
          <div class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300">
            <p class="font-medium mb-1">No se pudo cargar la documentación.</p>
            <p class="text-sm opacity-80">{{ error() }}</p>
            <button type="button" (click)="load()" class="mt-3 text-sm font-medium underline hover:no-underline">Reintentar</button>
          </div>
        }

        @if (!loading() && !error() && categories().length === 0 && !editing()) {
          <div class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
            <lucide-icon [name]="BookOpenIcon" [size]="32" class="mx-auto text-gray-400 mb-3"></lucide-icon>
            <p class="text-sm text-gray-600 dark:text-gray-400">No hay contenido visible para tu rol todavía.</p>
          </div>
        }

        <!-- EDIT MODE: empty state with the new-category form INLINE -->
        @if (editing() && !loading() && !error() && categories().length === 0) {
          <div class="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 p-8 text-center bg-amber-50/30 dark:bg-amber-900/10">
            @if (newCategorySlot() !== null) {
              <div class="text-left max-w-md mx-auto">
                <p class="text-sm text-gray-700 dark:text-gray-300 mb-3">Creá la primera categoría. Después vas a poder agregarle artículos.</p>
                <input
                  type="text"
                  class="w-full mb-2 px-3 py-2 text-base font-semibold bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  [ngModel]="newCategoryName()"
                  (ngModelChange)="onNewCategoryNameChange($event)"
                  placeholder="Nombre de la categoría"
                  data-testid="new-category-name-first"
                  autofocus
                />
                <input
                  type="text"
                  class="w-full mb-2 px-3 py-1.5 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-500 dark:text-gray-400"
                  [ngModel]="newCategorySlug()"
                  (ngModelChange)="newCategorySlug.set($event)"
                  placeholder="slug"
                />
                <textarea
                  class="w-full mb-3 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  [ngModel]="newCategoryDescription()"
                  (ngModelChange)="newCategoryDescription.set($event)"
                  placeholder="Descripción (opcional)"
                  rows="2"
                ></textarea>
                <div class="flex items-center gap-2">
                  <button type="button" (click)="submitNewCategory()" class="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700" data-testid="create-first-category">
                    <lucide-icon [name]="PlusIcon" [size]="14"></lucide-icon>
                    <span>Crear categoría</span>
                  </button>
                  <button type="button" (click)="cancelNewCategory()" class="inline-flex items-center gap-1 px-3 py-1.5 rounded text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
                    <lucide-icon [name]="XIcon" [size]="14"></lucide-icon>
                    <span>Cancelar</span>
                  </button>
                </div>
                @if (newCategoryError()) { <span class="block mt-2 text-xs text-red-600">{{ newCategoryError() }}</span> }
              </div>
            } @else {
              <lucide-icon [name]="BookOpenIcon" [size]="32" class="mx-auto text-amber-500 mb-3"></lucide-icon>
              <p class="text-sm text-gray-700 dark:text-gray-300 mb-4">No hay categorías. Empezá creando la primera.</p>
              <button type="button" (click)="startNewCategory()" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600" data-testid="add-first-category">
                <lucide-icon [name]="PlusIcon" [size]="14"></lucide-icon>
                <span>Crear primera categoría</span>
              </button>
            }
          </div>
        }

        @if (!loading() && !error() && categories().length > 0) {
          <!-- Edit-mode + button at the top of the grid -->
          @if (editing()) {
            <div class="mb-4 flex items-center justify-between">
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ categories().length }} categoría(s) · arrastrá para reordenar</p>
              <button type="button" (click)="startNewCategory()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600" data-testid="add-category-top">
                <lucide-icon [name]="PlusIcon" [size]="12"></lucide-icon>
                <span>Nueva categoría</span>
              </button>
            </div>
          }

          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            @for (cat of categories(); track cat.id; let i = $index) {
              <div
                class="docs-card-wrapper group relative transition-all duration-150"
                [class.docs-card-wrapper--editing]="editing()"
                [class.docs-card-wrapper--archived]="!!cat.archived_at"
                [class.docs-card-wrapper--dragging]="draggingCategoryId() === cat.id"
                [class.docs-card-wrapper--drag-over]="dragOverCategoryId() === cat.id && draggingCategoryId() !== cat.id"
                [attr.data-testid]="'card-' + cat.slug"
                [attr.draggable]="editing()"
                (dragstart)="onDragStartCategory($event, cat.id)"
                (dragover)="onDragOver($event, cat.id)"
                (dragleave)="onDragLeave(cat.id)"
                (dragend)="onDragEnd()"
                (drop)="onDropCategory($event, cat.id)"
              >
                <!-- Edit-mode handle + actions -->
                @if (editing()) {
                  <div class="absolute top-2 left-2 z-10 flex items-center gap-1">
                    <button
                      type="button"
                      class="inline-flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors cursor-grab active:cursor-grabbing"
                      title="Arrastrá para reordenar"
                      aria-label="Reordenar categoría"
                    >
                      <lucide-icon [name]="GripVerticalIcon" [size]="14"></lucide-icon>
                    </button>
                    @if (cat.archived_at) {
                      <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Archivada</span>
                    }
                  </div>
                  <div class="absolute top-2 right-2 z-10 flex items-center gap-1">
                    <button type="button" (click)="startEditCategory(cat)" class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Renombrar">
                      <lucide-icon [name]="Edit3Icon" [size]="12"></lucide-icon>
                    </button>
                    @if (cat.archived_at) {
                      <button type="button" (click)="restoreCategory(cat)" class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Restaurar">
                        <lucide-icon [name]="ArchiveRestoreIcon" [size]="12"></lucide-icon>
                      </button>
                      <button type="button" (click)="askDeleteCategory(cat)" class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600" title="Eliminar definitivamente">
                        <lucide-icon [name]="Trash2Icon" [size]="12"></lucide-icon>
                      </button>
                    } @else {
                      <button type="button" (click)="archiveCategory(cat)" class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Archivar">
                        <lucide-icon [name]="ArchiveIcon" [size]="12"></lucide-icon>
                      </button>
                    }
                  </div>
                }

                <!-- Card body: view OR edit -->
                @if (editingCategoryId() === cat.id) {
                  <div class="block rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50/30 dark:bg-amber-900/10 p-5">
                    <input
                      type="text"
                      class="w-full mb-2 px-2 py-1.5 text-base font-semibold bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      [ngModel]="editingCategoryName()"
                      (ngModelChange)="editingCategoryName.set($event)"
                      placeholder="Nombre"
                      data-testid="edit-category-name"
                    />
                    <input
                      type="text"
                      class="w-full mb-2 px-2 py-1 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-500 dark:text-gray-400"
                      [ngModel]="editingCategorySlug()"
                      (ngModelChange)="editingCategorySlug.set($event)"
                      placeholder="slug"
                    />
                    <textarea
                      class="w-full mb-3 px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      [ngModel]="editingCategoryDescription()"
                      (ngModelChange)="editingCategoryDescription.set($event)"
                      placeholder="Descripción (opcional)"
                      rows="2"
                    ></textarea>
                    <div class="flex items-center gap-2">
                      <button type="button" (click)="saveEditCategory(cat)" class="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700" data-testid="save-category">
                        <lucide-icon [name]="CheckIcon" [size]="12"></lucide-icon>
                        <span>Guardar</span>
                      </button>
                      <button type="button" (click)="cancelEditCategory()" class="inline-flex items-center gap-1 px-3 py-1.5 rounded text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
                        <lucide-icon [name]="XIcon" [size]="12"></lucide-icon>
                        <span>Cancelar</span>
                      </button>
                      @if (categoryEditError()) { <span class="text-xs text-red-600">{{ categoryEditError() }}</span> }
                    </div>
                  </div>
                } @else if (newCategorySlot() === i && editing()) {
                  <!-- Inline new category form -->
                  <div class="block rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/40 dark:bg-amber-900/10 p-5">
                    <input
                      type="text"
                      class="w-full mb-2 px-2 py-1.5 text-base font-semibold bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      [ngModel]="newCategoryName()"
                      (ngModelChange)="onNewCategoryNameChange($event)"
                      placeholder="Nombre"
                      data-testid="new-category-name"
                      autofocus
                    />
                    <input
                      type="text"
                      class="w-full mb-2 px-2 py-1 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-500 dark:text-gray-400"
                      [ngModel]="newCategorySlug()"
                      (ngModelChange)="newCategorySlug.set($event)"
                      placeholder="slug"
                    />
                    <textarea
                      class="w-full mb-3 px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      [ngModel]="newCategoryDescription()"
                      (ngModelChange)="newCategoryDescription.set($event)"
                      placeholder="Descripción (opcional)"
                      rows="2"
                    ></textarea>
                    <div class="flex items-center gap-2">
                      <button type="button" (click)="submitNewCategory()" class="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700" data-testid="create-category">
                        <lucide-icon [name]="CheckIcon" [size]="12"></lucide-icon>
                        <span>Crear</span>
                      </button>
                      <button type="button" (click)="cancelNewCategory()" class="inline-flex items-center gap-1 px-3 py-1.5 rounded text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
                        <lucide-icon [name]="XIcon" [size]="12"></lucide-icon>
                        <span>Cancelar</span>
                      </button>
                      @if (newCategoryError()) { <span class="text-xs text-red-600">{{ newCategoryError() }}</span> }
                    </div>
                  </div>
                } @else {
                  <a
                    [routerLink]="['/docs', cat.slug]"
                    class="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:border-blue-500/50 transition-colors h-full"
                    [class.opacity-60]="!!cat.archived_at"
                  >
                    <div class="flex items-start gap-3 mb-3">
                      <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <lucide-icon [name]="FileTextIcon" [size]="16"></lucide-icon>
                      </div>
                      <h3 class="text-base font-semibold text-gray-900 dark:text-white leading-snug">{{ cat.name }}</h3>
                    </div>
                    @if (cat.description) {
                      <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{{ cat.description }}</p>
                    }
                    <div class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                      Ver artículos
                      <lucide-icon [name]="ChevronRightIcon" [size]="12"></lucide-icon>
                    </div>
                  </a>
                }
              </div>
            }
            <!-- "Add new" card at the end (edit mode only) -->
            @if (editing() && newCategorySlot() === null) {
              <button
                type="button"
                (click)="startNewCategory()"
                class="flex flex-col items-center justify-center min-h-[8rem] rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                data-testid="add-category-bottom"
              >
                <lucide-icon [name]="PlusIcon" [size]="20"></lucide-icon>
                <span class="mt-1 text-sm font-medium">Nueva categoría</span>
              </button>
            }
          </div>
        }
      }

      <!-- CATEGORY: article list (route is /docs/:category) -->
      @if (activeCategorySlug(); as catSlug) {
        <header class="mb-8">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ category()?.name ?? catSlug }}
          </h1>
          @if (category()?.description) {
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
              {{ category()?.description }}
            </p>
          }
        </header>

        @if (articlesLoading()) {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"></div>
            }
          </div>
        }

        @if (articlesError() && !articlesLoading()) {
          <div class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300">
            <p class="font-medium mb-1">No se pudo cargar los artículos.</p>
            <p class="text-sm opacity-80">{{ articlesError() }}</p>
            <button type="button" (click)="loadArticles()" class="mt-3 text-sm font-medium underline hover:no-underline">Reintentar</button>
          </div>
        }

        @if (!articlesLoading() && !articlesError() && articlesInCategory().length === 0) {
          <div class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center" data-testid="docs-category-empty">
            <lucide-icon [name]="FileTextIcon" [size]="32" class="mx-auto text-gray-400 mb-3"></lucide-icon>
            <p class="text-sm text-gray-600 dark:text-gray-400">{{ 'docs.categoryEmpty' | transloco }}</p>
            <a routerLink="/docs" class="mt-4 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
              {{ 'docs.backToIndex' | transloco }}
            </a>
          </div>
        }

        @if (!articlesLoading() && !articlesError() && articlesInCategory().length > 0) {
          <ul class="space-y-2">
            @for (art of articlesInCategory(); track art.id; let i = $index) {
              <li
                class="docs-article-row group transition-all duration-150"
                [class.docs-article-row--editing]="editing()"
                [class.docs-article-row--drag-over]="dragOverArticleId() === art.id && draggingArticleId() !== art.id"
                [attr.draggable]="editing()"
                (dragstart)="onDragStartArticle($event, art.id)"
                (dragover)="onDragOverArticle($event, art.id)"
                (dragleave)="onDragLeaveArticle(art.id)"
                (dragend)="onDragEndArticle()"
                (drop)="onDropArticle($event, art.id)"
                [attr.data-testid]="'article-row-' + art.slug"
              >
                @if (editing()) {
                  <button
                    type="button"
                    class="docs-article-grip inline-flex items-center justify-center w-6 h-6 mt-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 transition-colors cursor-grab active:cursor-grabbing shrink-0"
                    title="Arrastrá para reordenar"
                    aria-label="Reordenar artículo"
                  >
                    <lucide-icon [name]="GripVerticalIcon" [size]="14"></lucide-icon>
                  </button>
                }
                <a
                  [routerLink]="['/docs', catSlug, art.slug]"
                  class="flex-1 min-w-0 flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:border-blue-500/50 transition-colors"
                >
                  <div class="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <lucide-icon [name]="FileTextIcon" [size]="14"></lucide-icon>
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {{ art.title }}
                    </h3>
                    @if (art.summary) {
                      <p class="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{{ art.summary }}</p>
                    }
                  </div>
                  <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-1"
                    [class.bg-green-100]="art.status === 'published'"
                    [class.text-green-700]="art.status === 'published'"
                    [class.bg-yellow-100]="art.status === 'draft'"
                    [class.text-yellow-700]="art.status === 'draft'"
                    [class.bg-gray-100]="art.status === 'archived'"
                    [class.text-gray-600]="art.status === 'archived'">
                    {{ art.status }}
                  </span>
                  <lucide-icon [name]="ChevronRightIcon" [size]="16" class="text-gray-400 group-hover:text-blue-500 shrink-0 mt-1.5"></lucide-icon>
                </a>
                <!-- Smart "+" between articles in edit mode -->
                @if (editing() && newArticleSlot() === i + 1) {
                  <div class="docs-new-article-slot mt-1 ml-6 p-4 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50/30 dark:bg-amber-900/10" data-testid="new-article-slot">
                    <input
                      type="text"
                      class="w-full mb-2 px-2 py-1.5 text-sm font-semibold bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      [ngModel]="newArticleTitle()"
                      (ngModelChange)="onNewArticleTitleChange($event)"
                      placeholder="Título"
                      data-testid="new-article-title"
                      autofocus
                    />
                    <input
                      type="text"
                      class="w-full mb-2 px-2 py-1 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-500 dark:text-gray-400"
                      [ngModel]="newArticleSlug()"
                      (ngModelChange)="newArticleSlug.set($event)"
                      placeholder="slug"
                    />
                    <textarea
                      class="w-full mb-3 px-2 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      [ngModel]="newArticleSummary()"
                      (ngModelChange)="newArticleSummary.set($event)"
                      placeholder="Resumen (opcional)"
                      rows="2"
                    ></textarea>
                    <div class="flex items-center gap-2">
                      <button type="button" (click)="submitNewArticle(catSlug)" class="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700" data-testid="create-article">
                        <lucide-icon [name]="CheckIcon" [size]="12"></lucide-icon>
                        <span>Crear</span>
                      </button>
                      <button type="button" (click)="cancelNewArticle()" class="inline-flex items-center gap-1 px-3 py-1.5 rounded text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
                        <lucide-icon [name]="XIcon" [size]="12"></lucide-icon>
                        <span>Cancelar</span>
                      </button>
                      @if (newArticleError()) { <span class="text-xs text-red-600">{{ newArticleError() }}</span> }
                    </div>
                  </div>
                }
              </li>
              <!-- "Add new" row between articles (smart + button) -->
              @if (editing() && newArticleSlot() === null && i < articlesInCategory().length - 1) {
                <li class="flex justify-center -my-1">
                  <button
                    type="button"
                    (click)="startNewArticle(i + 1)"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/40 border border-amber-200 dark:border-amber-800"
                    data-testid="add-article-between"
                    title="Nuevo artículo entre estos dos"
                  >
                    <lucide-icon [name]="PlusIcon" [size]="10"></lucide-icon>
                    <span>+</span>
                  </button>
                </li>
              }
            }
            <!-- "Add new" row at the end -->
            @if (editing() && newArticleSlot() === null) {
              <li class="flex justify-center mt-2">
                <button
                  type="button"
                  (click)="startNewArticle(articlesInCategory().length)"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-xs font-medium"
                  data-testid="add-article-bottom"
                >
                  <lucide-icon [name]="PlusIcon" [size]="12"></lucide-icon>
                  <span>Nuevo artículo</span>
                </button>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: [
    `
      .docs-card-wrapper--editing { padding-top: 1.75rem; }
      .docs-card-wrapper--editing.docs-card-wrapper--archived a { opacity: 0.6; }
      .docs-card-wrapper--editing[draggable="true"] { cursor: grab; user-select: none; }
      .docs-card-wrapper--editing[draggable="true"]:active { cursor: grabbing; }
      /* Drag visual feedback: source fades + tilts + lifts (kanban feel),
         target gets a thick amber ring + slight scale. */
      .docs-card-wrapper--dragging {
        opacity: 0.5;
        transform: rotate(-1.5deg) scale(0.97);
        box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.18), 0 4px 10px -2px rgba(0, 0, 0, 0.08);
        transition: transform 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms;
      }
      .docs-card-wrapper--drag-over {
        transform: scale(1.04);
        transition: transform 150ms cubic-bezier(0.2, 0, 0, 1);
      }
      .docs-card-wrapper--drag-over > a,
      .docs-card-wrapper--drag-over > .docs-new-cat-form {
        box-shadow: 0 0 0 3px rgb(245 158 11), 0 12px 28px -4px rgba(245, 158, 11, 0.25);
      }
      /* Article row drag polish */
      .docs-article-row--editing[draggable="true"] { cursor: grab; user-select: none; }
      .docs-article-row--editing[draggable="true"]:active { cursor: grabbing; }
      .docs-article-row--drag-over > a {
        box-shadow: 0 0 0 3px rgb(245 158 11), 0 12px 28px -4px rgba(245, 158, 11, 0.25);
        transform: scale(1.02);
        transition: transform 150ms cubic-bezier(0.2, 0, 0, 1);
      }
    `,
  ],
})
export class DocsIndexComponent implements OnInit {
  private docsService = inject(DocsService);
  private adminService = inject(DocsAdminService);
  private shellStore = inject(DocsShellStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly editModeSvc = inject(EditModeService);

  readonly BookOpenIcon = BookOpen;
  readonly FileTextIcon = FileText;
  readonly ChevronRightIcon = ChevronRight;
  readonly PlusIcon = Plus;
  readonly GripVerticalIcon = GripVertical;
  readonly MoreVerticalIcon = MoreVertical;
  readonly Edit3Icon = Edit3;
  readonly ArchiveIcon = Archive;
  readonly ArchiveRestoreIcon = ArchiveRestore;
  readonly Trash2Icon = Trash2;
  readonly XIcon = X;
  readonly CheckIcon = Check;

  readonly editing = this.editModeSvc.editMode;

  // ── Read state ───────────────────────────────────────────────────────
  categories = signal<DocsCategory[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  private articlesByCategory = signal<DocsArticle[]>([]);
  articlesLoading = signal(false);
  articlesError = signal<string | null>(null);

  private params = toSignal(
    this.route.paramMap.pipe(map((m) => m.get('category'))),
    { initialValue: this.route.snapshot.paramMap.get('category') },
  );
  readonly activeCategorySlug = computed(() => this.params());
  readonly category = computed<DocsCategory | null>(() => {
    const slug = this.activeCategorySlug();
    if (!slug) return null;
    return this.shellStore.categories().find((c) => c.slug === slug) ?? null;
  });
  readonly articlesInCategory = computed<DocsArticle[]>(() => {
    const slug = this.activeCategorySlug();
    if (!slug) return [];
    return [...this.articlesByCategory()].sort(
      (a, b) => a.sort_in_category - b.sort_in_category,
    );
  });

  // ── Edit state (in-place category editor) ────────────────────────────
  readonly editingCategoryId = signal<string | null>(null);
  readonly editingCategoryName = signal('');
  readonly editingCategorySlug = signal('');
  readonly editingCategoryDescription = signal('');
  readonly categoryEditError = signal<string | null>(null);

  /** When set to a numeric index, the inline new-category form is rendered
   *  in that slot (between cards). null means no new form is open. */
  readonly newCategorySlot = signal<number | null>(null);
  readonly newCategoryName = signal('');
  readonly newCategorySlug = signal('');
  readonly newCategoryDescription = signal('');
  readonly newCategoryError = signal<string | null>(null);

  constructor() {
    // Keep the article list in sync with the URL.
    effect(() => {
      const slug = this.activeCategorySlug();
      this.shellStore.ensureLoaded();
      if (slug) {
        void this.loadArticles(slug);
      }
    });

    // Whenever edit mode toggles, reload categories (so we see archived ones)
    // and the article list (so drafts/archived show up).
    effect(() => {
      const isEditing = this.editing();
      void isEditing;
      void this.load();
      const cat = this.activeCategorySlug();
      if (cat) void this.loadArticles(cat);
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.editing()) {
        const cats = await this.adminService.listAllCategoriesForAdmin();
        this.categories.set(cats);
      } else {
        const cats = await this.docsService.listCategories();
        this.categories.set(cats);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async loadArticles(slug?: string): Promise<void> {
    const cat = slug ?? this.activeCategorySlug();
    if (!cat) return;
    this.articlesLoading.set(true);
    this.articlesError.set(null);
    try {
      if (this.editing()) {
        const list = await this.adminService.listArticlesForAdmin(cat);
        this.articlesByCategory.set(list);
      } else {
        const list = await this.docsService.listArticlesByCategory(cat);
        this.articlesByCategory.set(list);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      this.articlesError.set(msg);
    } finally {
      this.articlesLoading.set(false);
    }
  }

  // ── New category inline form ────────────────────────────────────────

  startNewCategory(): void {
    this.newCategorySlot.set(this.categories().length);
    this.newCategoryName.set('');
    this.newCategorySlug.set('');
    this.newCategoryDescription.set('');
    this.newCategoryError.set(null);
  }

  cancelNewCategory(): void {
    this.newCategorySlot.set(null);
  }

  // ── Category editing (inline rename + archive + hard delete) ─────

  startEditCategory(c: DocsCategory): void {
    this.editingCategoryId.set(c.id);
    this.editingCategoryName.set(c.name);
    this.editingCategorySlug.set(c.slug);
    this.editingCategoryDescription.set(c.description ?? '');
    this.categoryEditError.set(null);
  }

  cancelEditCategory(): void {
    this.editingCategoryId.set(null);
    this.categoryEditError.set(null);
  }

  async saveEditCategory(c: DocsCategory): Promise<void> {
    const name = this.editingCategoryName().trim();
    const slug = this.editingCategorySlug().trim();
    if (!name) { this.categoryEditError.set('El nombre es obligatorio'); return; }
    if (!slug) { this.categoryEditError.set('El slug es obligatorio'); return; }
    try {
      const updated = await this.adminService.updateCategory(c.id, {
        name,
        slug,
        description: this.editingCategoryDescription() || null,
      });
      this.categories.update((arr) => arr.map((x) => (x.id === c.id ? updated : x)));
      this.editingCategoryId.set(null);
    } catch (e: any) {
      this.categoryEditError.set(e?.message ?? 'No se pudo guardar');
    }
  }

  async archiveCategory(c: DocsCategory): Promise<void> {
    try {
      await this.adminService.archiveCategory(c.id, true);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo archivar');
    }
  }

  async restoreCategory(c: DocsCategory): Promise<void> {
    try {
      await this.adminService.archiveCategory(c.id, false);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo restaurar');
    }
  }

  async askDeleteCategory(c: DocsCategory): Promise<void> {
    const typed = prompt(`Para confirmar, escribí "${c.name}":`);
    if (typed !== c.name) return;
    try {
      await this.adminService.deleteCategory(c.id);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo eliminar (¿tiene artículos?)');
    }
  }

  onNewCategoryNameChange(name: string): void {
    this.newCategoryName.set(name);
    // Auto-suggest slug only if the user hasn't manually edited it
    // (we keep it simple: always re-derive unless they've typed a different value).
    if (!this.newCategorySlug() || this.newCategorySlug() === this.slugify(this.newCategoryName())) {
      this.newCategorySlug.set(this.slugify(name));
    }
  }

  async submitNewCategory(): Promise<void> {
    const name = this.newCategoryName().trim();
    const slug = this.newCategorySlug().trim();
    if (!name) { this.newCategoryError.set('El nombre es obligatorio'); return; }
    if (!slug) { this.newCategoryError.set('El slug es obligatorio'); return; }
    try {
      const created = await this.adminService.createCategory({
        name,
        slug,
        description: this.newCategoryDescription() || null,
        sort_order: this.categories().length,
      });
      this.categories.update((arr) => [...arr, created]);
      this.newCategorySlot.set(null);
    } catch (e: any) {
      this.newCategoryError.set(e?.message ?? 'No se pudo crear la categoría');
    }
  }

  // ── Drag & drop reordering ─────────────────────────────────────────

  /** Which card is currently being dragged. */
  readonly draggingCategoryId = signal<string | null>(null);
  /** Which card has the drag indicator on it (drop preview). */
  readonly dragOverCategoryId = signal<string | null>(null);

  onDragStartCategory(ev: DragEvent, id: string): void {
    this.draggingCategoryId.set(id);
    ev.dataTransfer?.setData('text/plain', id);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(ev: DragEvent, targetId: string): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    this.dragOverCategoryId.set(targetId);
  }

  onDragLeave(targetId: string): void {
    if (this.dragOverCategoryId() === targetId) {
      this.dragOverCategoryId.set(null);
    }
  }

  onDragEnd(): void {
    this.draggingCategoryId.set(null);
    this.dragOverCategoryId.set(null);
  }

  async onDropCategory(ev: DragEvent, targetId: string): Promise<void> {
    ev.preventDefault();
    const sourceId = this.draggingCategoryId() ?? ev.dataTransfer?.getData('text/plain');
    this.draggingCategoryId.set(null);
    this.dragOverCategoryId.set(null);
    if (!sourceId || sourceId === targetId) return;
    const arr = [...this.categories()];
    const from = arr.findIndex((c) => c.id === sourceId);
    const to = arr.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    this.categories.set(arr);
    try {
      await this.adminService.reorderCategories(arr.map((c) => c.id));
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo reordenar');
      void this.load(); // rollback
    }
  }

  // ── Article drag&drop + new-article inline form ─────────────────────

  readonly draggingArticleId = signal<string | null>(null);
  readonly dragOverArticleId = signal<string | null>(null);

  onDragStartArticle(ev: DragEvent, id: string): void {
    this.draggingArticleId.set(id);
    ev.dataTransfer?.setData('text/plain', id);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  onDragOverArticle(ev: DragEvent, targetId: string): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    this.dragOverArticleId.set(targetId);
  }

  onDragLeaveArticle(targetId: string): void {
    if (this.dragOverArticleId() === targetId) {
      this.dragOverArticleId.set(null);
    }
  }

  onDragEndArticle(): void {
    this.draggingArticleId.set(null);
    this.dragOverArticleId.set(null);
  }

  async onDropArticle(ev: DragEvent, targetId: string): Promise<void> {
    ev.preventDefault();
    const sourceId = this.draggingArticleId() ?? ev.dataTransfer?.getData('text/plain');
    this.draggingArticleId.set(null);
    this.dragOverArticleId.set(null);
    if (!sourceId || sourceId === targetId) return;
    const arr = [...this.articlesByCategory()];
    const from = arr.findIndex((a) => a.id === sourceId);
    const to = arr.findIndex((a) => a.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    this.articlesByCategory.set(arr);
    const cat = this.activeCategorySlug();
    if (!cat) return;
    try {
      // Resolve the category id from the slug via the loaded categories list.
      const category = this.shellStore.categories().find((c) => c.slug === cat);
      if (!category) return;
      await this.adminService.reorderArticles(category.id, arr.map((a) => a.id));
    } catch (e: any) {
      this.articlesError.set(e?.message ?? 'No se pudo reordenar');
      void this.loadArticles(); // rollback
    }
  }

  /** Inline new-article form (smart "+" button). */
  readonly newArticleSlot = signal<number | null>(null);
  readonly newArticleTitle = signal('');
  readonly newArticleSlug = signal('');
  readonly newArticleSummary = signal('');
  readonly newArticleError = signal<string | null>(null);

  startNewArticle(slot: number): void {
    this.newArticleSlot.set(slot);
    this.newArticleTitle.set('');
    this.newArticleSlug.set('');
    this.newArticleSummary.set('');
    this.newArticleError.set(null);
  }

  cancelNewArticle(): void {
    this.newArticleSlot.set(null);
  }

  onNewArticleTitleChange(title: string): void {
    this.newArticleTitle.set(title);
    if (!this.newArticleSlug() || this.newArticleSlug() === this.slugify(this.newArticleTitle())) {
      this.newArticleSlug.set(this.slugify(title));
    }
  }

  async submitNewArticle(catSlug: string): Promise<void> {
    const title = this.newArticleTitle().trim();
    const slug = this.newArticleSlug().trim();
    if (!title) { this.newArticleError.set('El título es obligatorio'); return; }
    if (!slug) { this.newArticleError.set('El slug es obligatorio'); return; }
    const category = this.shellStore.categories().find((c) => c.slug === catSlug);
    if (!category) { this.newArticleError.set('Categoría no encontrada'); return; }
    try {
      const created = await this.adminService.createArticle({
        category_id: category.id,
        title,
        slug,
        summary: this.newArticleSummary() || null,
        body_html: '',
        body_markdown: '',
        status: 'draft',
      });
      this.articlesByCategory.update((arr) => [...arr, created]);
      this.newArticleSlot.set(null);
      // Navigate to the new article so the superadmin can edit the body.
      void this.router.navigate(['/docs', catSlug, slug]);
    } catch (e: any) {
      this.newArticleError.set(e?.message ?? 'No se pudo crear el artículo');
    }
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 64);
  }
}
