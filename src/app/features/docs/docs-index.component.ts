import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, BookOpen, FileText, Plus, GripVertical, Edit3, Archive, ArchiveRestore, Trash2, X, Check } from 'lucide-angular';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { DocsService, DocsCategory, DocsArticle } from './docs.service';
import { DocsAdminService } from './docs-admin.service';
import { DocsShellStore } from './docs-shell.store';
import { EditModeService } from './edit-mode.service';
import { DocsCategoryCardComponent } from './components/docs-category-card.component';
import { DocsArticleRowComponent } from './components/docs-article-row.component';
import { DocsNewEntityFormComponent } from './components/docs-new-entity-form.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

/**
 * `/docs` landing + category article list.
 *
 * This component is the route-level shell for the index view. It
 * owns ALL state and CRUD operations; the visual representation
 * of each card and row is delegated to focused subcomponents
 * (`DocsCategoryCardComponent`, `DocsArticleRowComponent`, and the
 * shared `DocsNewEntityFormComponent`).
 *
 * Read mode (default):
 *   - `/docs`         → category card grid.
 *   - `/docs/:cat`    → article list within that category.
 *
 * Edit mode (EditModeService.editMode === true, superadmin only):
 *   - Same routes render the same data, but every card becomes
 *     inline-editable, drag handles appear on each row, and "+"
 *     buttons appear to add new content in the right position.
 *
 * Edits are flushed through DocsAdminService. RLS at the database
 * level is the real source of truth.
 */
@Component({
  selector: 'app-docs-index',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    LucideAngularModule,
    DocsCategoryCardComponent,
    DocsArticleRowComponent,
    DocsNewEntityFormComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './docs-index.component.html',
  styleUrl: './docs-index.component.css',
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
  readonly PlusIcon = Plus;
  readonly GripVerticalIcon = GripVertical;
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

  // ── Article drag&drop + new-article inline form ─────────────────────
  readonly newArticleSlot = signal<number | null>(null);
  readonly newArticleTitle = signal('');
  readonly newArticleSlug = signal('');
  readonly newArticleSummary = signal('');
  readonly newArticleError = signal<string | null>(null);

  // ── Delete-category confirm dialog state ───────────────────────────
  readonly deleteDialog = signal<{ isOpen: boolean; category: DocsCategory | null }>({
    isOpen: false,
    category: null,
  });
  readonly deleteDialogMessage = computed(() => {
    const name = this.deleteDialog().category?.name ?? '';
    return `Esta acción no se puede deshacer. Se eliminará la categoría "${name}" y todos sus artículos.`;
  });

  // ── Drag state ──────────────────────────────────────────────────────
  readonly draggingCategoryId = signal<string | null>(null);
  readonly dragOverCategoryId = signal<string | null>(null);
  readonly draggingArticleId = signal<string | null>(null);
  readonly dragOverArticleId = signal<string | null>(null);

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

  cancelEditOrNewCategory(): void {
    if (this.editingCategoryId() !== null) {
      this.cancelEditCategory();
    } else {
      this.cancelNewCategory();
    }
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

  askDeleteCategory(c: DocsCategory): void {
    this.deleteDialog.set({ isOpen: true, category: c });
  }

  async confirmDeleteCategory(): Promise<void> {
    const c = this.deleteDialog().category;
    this.deleteDialog.set({ isOpen: false, category: null });
    if (!c) return;
    try {
      await this.adminService.deleteCategory(c.id);
      await this.load();
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se pudo eliminar (¿tiene artículos?)');
    }
  }

  cancelDeleteCategory(): void {
    this.deleteDialog.set({ isOpen: false, category: null });
  }

  onNewCategoryNameChange(name: string): void {
    this.newCategoryName.set(name);
    // Auto-suggest slug only if the user hasn't manually edited it.
    if (!this.newCategorySlug() || this.newCategorySlug() === this.slugify(this.newCategoryName())) {
      this.newCategorySlug.set(this.slugify(name));
    }
  }

  /**
   * Unified handler for both the inline rename form and the
   * inline new-category form (they share the form component).
   * The current `editingCategoryId()` tells us which mode.
   */
  async onCategoryFormSubmit(c: DocsCategory | null, values: { name: string; slug: string; description: string }): Promise<void> {
    if (c) {
      this.editingCategoryName.set(values.name);
      this.editingCategorySlug.set(values.slug);
      this.editingCategoryDescription.set(values.description);
      await this.saveEditCategory(c);
    } else {
      this.newCategoryName.set(values.name);
      this.newCategorySlug.set(values.slug);
      this.newCategoryDescription.set(values.description);
      await this.submitNewCategory();
    }
  }

  /**
   * Same handler but used from the "create first category" flow
   * (no associated category, fresh signals).
   */
  async onSubmitNewCategoryFromForm(values: { name: string; slug: string; description: string }): Promise<void> {
    this.newCategoryName.set(values.name);
    this.newCategorySlug.set(values.slug);
    this.newCategoryDescription.set(values.description);
    await this.submitNewCategory();
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

  async onArticleFormSubmit(catSlug: string, values: { name: string; slug: string; description: string }): Promise<void> {
    this.newArticleTitle.set(values.name);
    this.newArticleSlug.set(values.slug);
    this.newArticleSummary.set(values.description);
    await this.submitNewArticle(catSlug);
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
