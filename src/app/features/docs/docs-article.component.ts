import {
  Component,
  ElementRef,
  inject,
  NgZone,
  OnInit,
  OnDestroy,
  signal,
  ViewChild,
  AfterViewChecked,
  PLATFORM_ID,
  computed,
  effect,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, BookOpen, ChevronRight, AlertCircle, List, Copy, Check, Pencil, Save, Trash2, Archive, Eye } from 'lucide-angular';
import Prism from 'prismjs';
// Tree-shake: only pull in the language grammars we actually use.
// Bash covers shell snippets; SQL covers query examples; JSON for
// config/code; TypeScript for `.ts` blocks; Markup for HTML.
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup';

import { DocsService, DocsArticle } from './docs.service';
import { DocsAdminService } from './docs-admin.service';
import { EditModeService } from './edit-mode.service';
import { MarkdownService, MarkdownHeading } from './markdown.service';
import { tiptapHtmlToMarkdown, markdownToTiptapHtml } from './markdown-sync';
import { TiptapEditorComponent } from '../../shared/ui/tiptap-editor/tiptap-editor.component';

/**
 * Article view for /docs/:category/:slug.
 *
 * Phase 5: renders the article content through the MarkdownService
 * (marked + DOMPurify), runs Prism over the rendered code blocks,
 * and exposes a headings signal that the 3-column shell reads to
 * build the ToC. The Tiptap body editor is enabled in the edit
 * mode toggle added by the admin-docs-editor change.
 */
@Component({
  selector: 'app-docs-article',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, TiptapEditorComponent],
  template: `
    <div class="p-6 md:p-8 max-w-4xl mx-auto">
      <!-- Note: the layout's sticky header already renders the breadcrumb
           (Inicio › Documentación › Categoría › Artículo); the article
           page only renders the article body and the mobile-only ToC
           disclosure (the 3-col shell handles the desktop ToC). -->

      <!-- Loading -->
      @if (loading()) {
        <div class="space-y-4 animate-pulse">
          <div class="h-8 w-2/3 rounded bg-gray-200 dark:bg-gray-700"></div>
          <div class="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700"></div>
          <div class="h-64 w-full rounded bg-gray-200 dark:bg-gray-700"></div>
        </div>
      }

      <!-- 404 -->
      @if (!loading() && !article() && !error()) {
        <div class="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <lucide-icon
            [name]="BookOpenIcon"
            [size]="32"
            class="mx-auto text-gray-400 mb-3"
          ></lucide-icon>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Artículo no encontrado o no visible para tu rol.
          </p>
          <a
            routerLink="/docs"
            class="mt-4 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Volver al índice
          </a>
        </div>
      }

      <!-- Error -->
      @if (error() && !loading()) {
        <div
          class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300"
        >
          <div class="flex items-start gap-3">
            <lucide-icon [name]="AlertCircleIcon" [size]="18"></lucide-icon>
            <div>
              <p class="font-medium mb-1">No se pudo cargar el artículo.</p>
              <p class="text-sm opacity-80">{{ error() }}</p>
            </div>
          </div>
        </div>
      }

      <!-- Article -->
      @if (article(); as a) {
        <article>
          <header class="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            @if (editing()) {
              <!-- Editable metadata -->
              <div class="space-y-3 mb-4" data-testid="article-edit-meta">
                <input
                  type="text"
                  class="w-full text-3xl font-bold bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded px-2 py-1 text-gray-900 dark:text-white"
                  [ngModel]="editTitle()"
                  (ngModelChange)="editTitle.set($event)"
                  placeholder="Título"
                  data-testid="edit-article-title"
                />
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500">/docs/{{ a.category_id }}/</span>
                  @if (isSlugLocked()) {
                    <span class="text-sm font-mono text-gray-700 dark:text-gray-300" data-testid="article-slug-locked">{{ editSlug() }}</span>
                    <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">Bloqueado (publicado)</span>
                  } @else {
                    <input
                      type="text"
                      class="flex-1 text-sm font-mono bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded px-2 py-1 text-gray-900 dark:text-white"
                      [ngModel]="editSlug()"
                      (ngModelChange)="editSlug.set($event)"
                      placeholder="slug"
                      data-testid="edit-article-slug"
                    />
                  }
                </div>
                <textarea
                  class="w-full text-base bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded px-2 py-1 text-gray-900 dark:text-white"
                  [ngModel]="editSummary()"
                  (ngModelChange)="editSummary.set($event)"
                  placeholder="Resumen (opcional)"
                  rows="2"
                  data-testid="edit-article-summary"
                ></textarea>
                <div class="flex flex-wrap items-center gap-2 pt-2">
                  <button type="button" (click)="saveDraft()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-700 text-white text-xs font-medium hover:bg-gray-800" data-testid="save-article-draft">
                    <lucide-icon [name]="SaveIcon" [size]="12"></lucide-icon>
                    <span>Guardar borrador</span>
                  </button>
                  @if (a.status !== 'published') {
                    <button type="button" (click)="publish()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700" data-testid="publish-article">
                      <lucide-icon [name]="EyeIcon" [size]="12"></lucide-icon>
                      <span>Publicar</span>
                    </button>
                  } @else {
                    <button type="button" (click)="unpublish()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600" data-testid="unpublish-article">
                      <lucide-icon [name]="EyeIcon" [size]="12"></lucide-icon>
                      <span>Volver a borrador</span>
                    </button>
                  }
                  @if (a.status !== 'archived') {
                    <button type="button" (click)="archive()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600" data-testid="archive-article">
                      <lucide-icon [name]="ArchiveIcon" [size]="12"></lucide-icon>
                      <span>Archivar</span>
                    </button>
                  } @else {
                    <button type="button" (click)="restore()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600" data-testid="restore-article">
                      <lucide-icon [name]="ArchiveIcon" [size]="12"></lucide-icon>
                      <span>Restaurar</span>
                    </button>
                    <button type="button" (click)="hardDelete()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700" data-testid="hard-delete-article">
                      <lucide-icon [name]="Trash2Icon" [size]="12"></lucide-icon>
                      <span>Eliminar definitivamente</span>
                    </button>
                  }
                  <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    [class.bg-green-100]="a.status === 'published'"
                    [class.text-green-700]="a.status === 'published'"
                    [class.bg-yellow-100]="a.status === 'draft'"
                    [class.text-yellow-700]="a.status === 'draft'"
                    [class.bg-gray-100]="a.status === 'archived'"
                    [class.text-gray-600]="a.status === 'archived'">
                    {{ a.status }}
                  </span>
                  @if (articleEditError()) { <span class="text-xs text-red-600">{{ articleEditError() }}</span> }
                </div>
                <p class="text-xs text-amber-700 dark:text-amber-300 italic">El editor de cuerpo (Tiptap) llega en la próxima fase. Por ahora, el body es solo lectura.</p>
              </div>
            } @else {
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {{ a.title }}
              </h1>
              @if (a.summary) {
                <p class="text-base text-gray-600 dark:text-gray-400">
                  {{ a.summary }}
                </p>
              }
              @if (a.published_at) {
                <p class="text-xs text-gray-500 dark:text-gray-500 mt-3">
                  Publicado: {{ a.published_at | date: 'longDate' }}
                </p>
              }
            }
          </header>

          <!--
            Body rendering.
            - In read mode: rendered markdown (Phase 5) via MarkdownService
              + DOMPurify. The "headings" signal is exposed for the 3-col
              shell (Phase 4).
            - In edit mode: the existing Tiptap editor component is
              bound to editBodyHtml (one-way via contentChange). The
              article content_html is the live editing surface; we
              also keep content_markdown in sync via the markdown-sync
              helper at save time.
          -->
          @if (editing()) {
            <div class="docs-article-editor border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden" data-testid="article-body-editor">
              <app-tiptap-editor
                [content]="editBodyHtml()"
                placeholder="Escribí el contenido del artículo…"
                (contentChange)="editBodyHtml.set($event)"
              ></app-tiptap-editor>
              <div class="px-3 py-2 bg-amber-50/40 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between">
                <span class="text-xs text-amber-800 dark:text-amber-200" [attr.data-state]="bodySaveState()">
                  {{ bodySaveStateLabel() }}
                </span>
                <button
                  type="button"
                  (click)="saveBody()"
                  [disabled]="bodySaveState() === 'saving' || bodySaveState() === 'clean'"
                  class="docs-article-save inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="save-body"
                >
                  <lucide-icon [name]="SaveIcon" [size]="12"></lucide-icon>
                  <span>Guardar cuerpo</span>
                </button>
              </div>
            </div>
          } @else {
            @if (renderedHtml()) {
              <div
                #articleBody
                class="prose prose-slate dark:prose-invert max-w-none docs-article-body"
                [innerHTML]="renderedHtml()"
              ></div>
            } @else {
              <div class="prose prose-slate dark:prose-invert max-w-none docs-article-body">
                <pre
                  class="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg"
                >{{ a.content_markdown }}</pre>
              </div>
            }
          }

          <!--
            Mobile ToC trigger: a compact "En esta página" disclosure.
            The full sidebar ToC lives in the 3-col shell (Phase 4);
            this is the fallback when the shell isn't wrapping us.
          -->
          @if (headings().length > 0) {
            <details
              class="mt-10 rounded-lg border border-gray-200 dark:border-gray-700 p-4 lg:hidden"
            >
              <summary
                class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
              >
                <lucide-icon [name]="ListIcon" [size]="16"></lucide-icon>
                En esta página
              </summary>
              <ul class="mt-3 space-y-1.5 text-sm">
                @for (h of headings(); track h.id) {
                  <li [class.pl-3]="h.level === 3" [class.pl-6]="h.level === 4">
                    <a
                      [href]="'#' + h.id"
                      class="text-blue-600 dark:text-blue-400 hover:underline"
                      >{{ h.text }}</a
                    >
                  </li>
                }
              </ul>
            </details>
          }
        </article>
      }
    </div>
  `,
})
export class DocsArticleComponent implements OnInit, AfterViewChecked, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private docsService = inject(DocsService);
  private adminService = inject(DocsAdminService);
  readonly editModeSvc = inject(EditModeService);
  private md = inject(MarkdownService);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);

  @ViewChild('articleBody') articleBody?: ElementRef<HTMLElement>;

  readonly BookOpenIcon = BookOpen;
  readonly ChevronRightIcon = ChevronRight;
  readonly AlertCircleIcon = AlertCircle;
  readonly ListIcon = List;
  readonly CopyIcon = Copy;
  readonly CheckIcon = Check;
  readonly PencilIcon = Pencil;
  readonly SaveIcon = Save;
  readonly Trash2Icon = Trash2;
  readonly ArchiveIcon = Archive;
  readonly EyeIcon = Eye;

  readonly editing = this.editModeSvc.editMode;

  // Edit-mode form state (metadata only in this phase; body TBD)
  readonly editTitle = signal('');
  readonly editSlug = signal('');
  readonly editSummary = signal('');
  readonly editBodyHtml = signal('');
  readonly bodySaveState = signal<'clean' | 'dirty' | 'saving' | 'saved' | 'error'>('clean');
  readonly bodySaveStateLabel = computed(() => {
    switch (this.bodySaveState()) {
      case 'dirty': return 'Cambios sin guardar.';
      case 'saving': return 'Guardando…';
      case 'saved': return 'Guardado.';
      case 'error': return 'Error al guardar.';
      default: return '';
    }
  });
  readonly articleEditError = signal<string | null>(null);

  readonly isSlugLocked = computed(() => !!this.article()?.published_at);

  /**
   * Per-block copy state. We track the `pre` element (by reference)
   * that the user just clicked so the "Copied!" affordance can flip
   * back to "Copy" after 1.5 s. Using a Map keyed by element avoids
   * a re-render storm on every click.
   */
  private copyResetTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  copiedBlock = signal<HTMLElement | null>(null);

  // ── Edit-mode actions (metadata only in this phase) ─────────────────

  /**
   * Sync the form fields whenever the loaded article changes. Done in an
   * effect rather than at load time so that switching between articles
   * via the prev/next nav updates the form correctly.
   */
  private lastSyncedArticleId: string | null = null;
  private readonly _syncForm = effect(() => {
    const a = this.article();
    if (!a) return;
    // Only resync the form when we switch to a different article.
    // Saving metadata for the current article must NOT clobber the
    // Tiptap body the user is actively editing.
    if (this.lastSyncedArticleId === a.id) return;
    this.lastSyncedArticleId = a.id;
    this.cancelAutosaveTimer();
    this.editTitle.set(a.title);
    this.editSlug.set(a.slug);
    this.editSummary.set(a.summary ?? '');
    this.editBodyHtml.set(a.content_html ?? markdownToTiptapHtml(a.content_markdown ?? ''));
    this.bodySaveState.set('clean');
  });

  /**
   * Debounced autosave. Watches the body signal: if the body diverges
   * from the last saved html, marks dirty and arms a 1200ms timer that
   * calls `saveBody()`. Any further typing resets the timer (debounce).
   * If the user navigates away or leaves edit mode, the timer is
   * cancelled and any pending dirty state is flushed by the route
   * subscription / effect below.
   */
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _watchBodyDirty = effect(() => {
    const html = this.editBodyHtml();
    const a = this.article();
    if (!a) return;

    // Don't react to programmatic changes during save (the save flow
    // re-syncs editBodyHtml via _syncForm but we only want to react
    // to the user's keystrokes, not to the post-save state).
    if (this.bodySaveState() === 'saving') return;

    const matchesSaved = html === (a.content_html ?? '');
    if (matchesSaved) {
      this.bodySaveState.set('clean');
      this.cancelAutosaveTimer();
      return;
    }
    this.bodySaveState.set('dirty');
    this.armAutosave();
  });

  private armAutosave(): void {
    this.cancelAutosaveTimer();
    // Don't autosave if we're not in edit mode (e.g. the user toggled
    // edit off after typing — the dirty state is just informational).
    if (!this.editing()) return;
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.saveBody();
    }, 1200);
  }

  private cancelAutosaveTimer(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  /**
   * Reload the article when editMode toggles. Reason: the public read
   * service only returns published articles; in edit mode we need to
   * also see drafts and archived rows.
   */
  private readonly _reloadOnEditToggle = effect(() => {
    const isEditing = this.editing();
    const cat = this.categorySlug();
    // Leaving edit mode: cancel any pending autosave so we don't fire
    // a save after the user toggled edit off. The dirty state is just
    // a visual hint at that point and we don't want to surprise the
    // user with a network call.
    if (!isEditing) {
      this.cancelAutosaveTimer();
      this.bodySaveState.set('clean');
    }
    if (!cat) return;
    // Defer the reload to next microtask so the first effect (the one
    // called from the paramMap subscription) doesn't race.
    queueMicrotask(() => {
      void this.reloadCurrentArticle(cat, isEditing);
    });
  });

  private async reloadCurrentArticle(cat: string, isEditing: boolean): Promise<void> {
    // Find the current article slug from the URL.
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const a = isEditing
        ? await this.loadArticleForAdmin(cat, slug)
        : await this.docsService.getArticle(cat, slug);
      this.article.set(a);
      if (a) {
        const result = this.md.render(a.content_markdown);
        this.headings.set(result.headings);
      } else {
        this.headings.set([]);
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      this.error.set(msg);
    } finally {
      this.loading.set(false);
      this.highlightedFor = null;
    }
  }

  async saveDraft(): Promise<void> {
    const a = this.article();
    if (!a) return;
    const title = this.editTitle().trim();
    const slug = this.editSlug().trim();
    if (!title) { this.articleEditError.set('El título es obligatorio'); return; }
    if (!slug) { this.articleEditError.set('El slug es obligatorio'); return; }
    this.articleEditError.set(null);
    try {
      const updated = await this.adminService.updateArticle(a.id, {
        title,
        slug,
        summary: this.editSummary() || null,
      });
      this.article.set(updated);
    } catch (e: any) {
      this.articleEditError.set(e?.message ?? 'No se pudo guardar');
    }
  }

  async publish(): Promise<void> {
    const a = this.article();
    if (!a) return;
    try {
      // Persist metadata changes first.
      await this.saveDraft();
      const updated = await this.adminService.setArticleStatus(a.id, 'published');
      this.article.set(updated);
    } catch (e: any) {
      this.articleEditError.set(e?.message ?? 'No se pudo publicar');
    }
  }

  async unpublish(): Promise<void> {
    const a = this.article();
    if (!a) return;
    try {
      const updated = await this.adminService.setArticleStatus(a.id, 'draft');
      this.article.set(updated);
    } catch (e: any) {
      this.articleEditError.set(e?.message ?? 'No se pudo volver a borrador');
    }
  }

  async archive(): Promise<void> {
    const a = this.article();
    if (!a) return;
    try {
      const updated = await this.adminService.setArticleStatus(a.id, 'archived');
      this.article.set(updated);
    } catch (e: any) {
      this.articleEditError.set(e?.message ?? 'No se pudo archivar');
    }
  }

  async restore(): Promise<void> {
    const a = this.article();
    if (!a) return;
    try {
      const updated = await this.adminService.setArticleStatus(a.id, 'draft');
      this.article.set(updated);
    } catch (e: any) {
      this.articleEditError.set(e?.message ?? 'No se pudo restaurar');
    }
  }

  /**
   * Persist the Tiptap body. Updates `content_html` (the live
   * editing surface) and recomputes `content_markdown` from it via
   * the markdown-sync helper so the public read path (which still
   * renders from `content_markdown` in some places) stays in sync.
   */
  async saveBody(): Promise<void> {
    const a = this.article();
    if (!a) return;
    this.bodySaveState.set('saving');
    this.articleEditError.set(null);
    try {
      const html = this.editBodyHtml();
      const md = tiptapHtmlToMarkdown(html);
      const updated = await this.adminService.updateArticle(a.id, {
        content_html: html,
        content_markdown: md,
      });
      this.article.set(updated);
      this.bodySaveState.set('saved');
    } catch (e: any) {
      this.bodySaveState.set('error');
      this.articleEditError.set(e?.message ?? 'No se pudo guardar el cuerpo');
    }
  }

  async hardDelete(): Promise<void> {
    const a = this.article();
    if (!a) return;
    const typed = prompt(`Para confirmar, escribí "${a.title}":`);
    if (typed !== a.title) return;
    try {
      await this.adminService.deleteArticle(a.id);
      // Navigate back to the category index after a hard delete.
      void this.router.navigate(['/docs']);
    } catch (e: any) {
      this.articleEditError.set(e?.message ?? 'No se pudo eliminar');
    }
  }

  /**
   * Helper: in edit mode, look up an article by category slug + article
   * slug (the route shape) and return it with full body + status, via
   * the admin service. Returns null if not found.
   */
  private async loadArticleForAdmin(catSlug: string, artSlug: string): Promise<DocsArticle | null> {
    const list = await this.adminService.listArticlesForAdmin(catSlug);
    return list.find((a) => a.slug === artSlug) ?? null;
  }

  copyCode(pre: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const code = pre.querySelector('code');
    const text = code?.textContent ?? pre.textContent ?? '';
    if (!text) return;

    // The button is appended by `enhanceCodeBlocks` next to the
    // pre; we look it up by walking up to the wrapper.
    const wrap = pre.parentElement?.classList.contains('code-block')
      ? pre.parentElement
      : pre;
    const btn = wrap?.querySelector<HTMLButtonElement>('button.code-copy');

    const showCopied = () => {
      if (btn) {
        btn.classList.add('is-copied');
        const label = btn.querySelector('span');
        if (label) label.textContent = '¡Copiado!';
      }
      this.copiedBlock.set(pre);
      const existing = this.copyResetTimers.get(pre);
      if (existing) clearTimeout(existing);
      this.copyResetTimers.set(
        pre,
        setTimeout(() => {
          if (btn) {
            btn.classList.remove('is-copied');
            const label = btn.querySelector('span');
            if (label) label.textContent = 'Copiar';
          }
          if (this.copiedBlock() === pre) this.copiedBlock.set(null);
        }, 1500),
      );
    };

    // Prefer the async Clipboard API where available; fall back to
    // a hidden textarea + execCommand for older WebViews (the
    // Angular Material host pages run on Chromium >= 110 in dev,
    // but production is open to whatever the agent's browser ships).
    const write = (navigator as Navigator & { clipboard?: { writeText: (s: string) => Promise<void> } }).clipboard?.writeText;
    if (write) {
      write.call((navigator as Navigator & { clipboard: { writeText: (s: string) => Promise<void> } }).clipboard, text)
        .then(showCopied)
        .catch(() => this.fallbackCopy(text, showCopied));
    } else {
      this.fallbackCopy(text, showCopied);
    }
  }

  private fallbackCopy(text: string, onDone: () => void): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      onDone();
    } catch {
      // Silent: the button visually stays in the unclicked state.
    } finally {
      document.body.removeChild(ta);
    }
  }

  isCopied(pre: HTMLElement | null | undefined): boolean {
    return !!pre && this.copiedBlock() === pre;
  }

  article = signal<DocsArticle | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  categorySlug = signal<string | null>(null);

  /** Rendered sanitised HTML; null when no article or no client. */
  renderedHtml = computed(() => {
    const a = this.article();
    if (!a) return null;
    return this.md.renderHtml(a.content_markdown);
  });

  /** Headings extracted from the rendered article (ToC source). */
  headings = signal<MarkdownHeading[]>([]);

  /**
   * Prism re-highlight guard. We track which article id we've
   * highlighted so route changes between articles in the same
   * component instance re-run Prism exactly once.
   */
  private highlightedFor: string | null = null;

  ngOnDestroy(): void {
    this.cancelAutosaveTimer();
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(async (params) => {
      const cat = params.get('category');
      const slug = params.get('slug');
      this.categorySlug.set(cat);
      if (!cat || !slug) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      this.error.set(null);
      this.article.set(null);
      this.headings.set([]);
      this.highlightedFor = null;
      try {
        // In edit mode, draft and archived articles must also be visible.
        // The public getArticle() filters by status='published', so for
        // edit mode we go through the admin service which returns all
        // statuses (gated by RLS on super_admin).
        const a = this.editing()
          ? await this.loadArticleForAdmin(cat, slug)
          : await this.docsService.getArticle(cat, slug);
        this.article.set(a);
        if (a) {
          // Recompute headings in lockstep with the render. We do
          // this here (not in a computed) because the article
          // resource is async and the heading list is consumed by
          // sibling shell components that subscribe to this signal.
          const result = this.md.render(a.content_markdown);
          this.headings.set(result.headings);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido';
        this.error.set(msg);
      } finally {
        this.loading.set(false);
      }
    });
  }

  /**
   * Per-block enhancement version. Bumped on every article swap so
   * the enhancement pass runs once per article.
   */
  private enhancedFor: string | null = null;

  ngAfterViewChecked(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const a = this.article();
    const el = this.articleBody?.nativeElement;
    if (!a || !el) return;
    if (this.highlightedFor === a.id) return;

    // Prism touches the DOM; keep it out of Angular's change
    // detection so the highlight pass doesn't loop the view
    // checker on every cycle.
    this.zone.runOutsideAngular(() => {
      try {
        Prism.highlightAllUnder(el);
      } catch (e) {
        // Prism throwing is non-fatal: the article still renders
        // unhighlighted. Log so we notice in dev.
        console.warn('[docs] Prism highlight failed', e);
      }
      // Wrap each <pre> in a container and inject a copy button.
      // We do this in the same outside-Angular pass to keep the
      // enhancement out of change detection. The guard ensures we
      // run exactly once per article id.
      this.enhanceCodeBlocks(el);
    });
    this.highlightedFor = a.id;
  }

  /**
   * Walk every `<pre>` in the rendered article body and:
   *  - wrap it in `<div class="code-block">` for positioning
   *  - inject a "Copiar" / "Copiado!" toggle button
   *  - wire the click to `copyCode()` (which uses the clipboard API)
   *
   * Idempotent: skips `<pre>`s that are already wrapped. Safe to
   * call on every view-check (we no-op on the second pass thanks
   * to the `enhancedFor` guard in `ngAfterViewChecked`).
   */
  private enhanceCodeBlocks(root: HTMLElement): void {
    const pres = root.querySelectorAll<HTMLPreElement>('pre');
    pres.forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-block')) return;

      const wrap = document.createElement('div');
      wrap.className = 'code-block';
      pre.parentElement?.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.setAttribute('aria-label', 'Copiar bloque de código');
      btn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copiar</span>';
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.zone.run(() => this.copyCode(pre));
      });
      wrap.appendChild(btn);
    });
  }
}
