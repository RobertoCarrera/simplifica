import {
  Component,
  ElementRef,
  inject,
  NgZone,
  OnInit,
  signal,
  ViewChild,
  AfterViewChecked,
  PLATFORM_ID,
  computed,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, BookOpen, ChevronRight, AlertCircle, List, Copy, Check } from 'lucide-angular';
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
import { MarkdownService, MarkdownHeading } from './markdown.service';

/**
 * Article view for /docs/:category/:slug.
 *
 * Phase 5: renders the article's `content_markdown` through the
 * `MarkdownService` (marked → DOMPurify → SafeHtml), runs Prism
 * over the rendered code blocks, and exposes a `headings` signal
 * that the Phase 4 3-column shell reads to build the ToC.
 */
@Component({
  selector: 'app-docs-article',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
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
          </header>

          <!--
            Rendered markdown. The 'headings' signal is exposed for
            the 3-col shell (Phase 4). '[innerHTML]' consumes a
            SafeHtml from the MarkdownService (already through
            DOMPurify), so we never have to trust raw user input.
          -->
          @if (renderedHtml()) {
            <div
              #articleBody
              class="prose prose-slate dark:prose-invert max-w-none docs-article-body"
              [innerHTML]="renderedHtml()"
            ></div>
          } @else {
            <div
              class="prose prose-slate dark:prose-invert max-w-none docs-article-body"
            >
              <pre
                class="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg"
              >{{ a.content_markdown }}</pre>
            </div>
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
export class DocsArticleComponent implements OnInit, AfterViewChecked {
  private route = inject(ActivatedRoute);
  private docsService = inject(DocsService);
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

  /**
   * Per-block copy state. We track the `pre` element (by reference)
   * that the user just clicked so the "Copied!" affordance can flip
   * back to "Copy" after 1.5 s. Using a Map keyed by element avoids
   * a re-render storm on every click.
   */
  private copyResetTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  copiedBlock = signal<HTMLElement | null>(null);

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
        const a = await this.docsService.getArticle(cat, slug);
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
