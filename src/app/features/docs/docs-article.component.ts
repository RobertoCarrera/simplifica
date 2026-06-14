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
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

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
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, TiptapEditorComponent, ConfirmDialogComponent],
  templateUrl: './docs-article.component.html',
  styleUrl: './docs-article.component.css',
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

  // ── Delete-article confirm dialog state ─────────────────────────────
  readonly deleteDialog = signal<boolean>(false);
  readonly deleteDialogMessage = computed(() => {
    const title = this.article()?.title ?? '';
    return `Esta acción no se puede deshacer. Se eliminará el artículo "${title}" y todo su contenido.`;
  });

  hardDelete(): void {
    this.deleteDialog.set(true);
  }

  async confirmHardDelete(): Promise<void> {
    const a = this.article();
    this.deleteDialog.set(false);
    if (!a) return;
    try {
      await this.adminService.deleteArticle(a.id);
      // Navigate back to the category index after a hard delete.
      void this.router.navigate(['/docs']);
    } catch (e: any) {
      this.articleEditError.set(e?.message ?? 'No se pudo eliminar');
    }
  }

  cancelHardDelete(): void {
    this.deleteDialog.set(false);
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
