import {
  Component,
  inject,
  signal,
  PLATFORM_ID,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LucideAngularModule, Search, X } from 'lucide-angular';
import { Subject, debounceTime, takeUntil } from 'rxjs';

import { DocsService, DocSearchHit } from '../docs.service';

/**
 * Header search input for /docs.
 *
 * Behaviour (Fase 6):
 *  - 300ms debounce on the input
 *  - Cancel-in-flight: AbortController on every keystroke discards the
 *    previous in-flight request so only the latest query wins
 *  - Min 2 characters before hitting the server
 *  - Top 8 results ranked by ts_rank
 *  - Server-side role filter (the docs_search RPC uses
 *    current_user_role() + docs_article_roles)
 *  - Click on a result navigates to the article
 *  - Keyboard nav: ↑/↓ to move, Enter to navigate, Esc to close
 *  - Highlight of the matched term in the title (case-insensitive)
 *  - Empty state: "No hay resultados para X"
 */
@Component({
  selector: 'app-docs-search',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe, LucideAngularModule],
  template: `
    <div class="relative w-full max-w-md" #host>
      <div
        class="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 h-9 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 transition-colors"
      >
        <lucide-icon [name]="SearchIcon" [size]="14" class="text-gray-400 shrink-0"></lucide-icon>
        <input
          #input
          type="text"
          [placeholder]="'docs.search.placeholder' | transloco"
          [value]="query()"
          (input)="onInput($event)"
          (focus)="open()"
          (keydown)="onKey($event)"
          class="flex-1 bg-transparent border-0 outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
          autocomplete="off"
          spellcheck="false"
          aria-label="Buscar documentación"
          role="combobox"
          [attr.aria-expanded]="openState()"
          aria-controls="docs-search-listbox"
        />
        @if (query()) {
          <button
            type="button"
            (click)="clear()"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Limpiar búsqueda"
          >
            <lucide-icon [name]="XIcon" [size]="14"></lucide-icon>
          </button>
        }
      </div>

      @if (openState() && (query() || pending())) {
        <div
          class="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden"
        >
          @if (pending() && results().length === 0) {
            <div class="p-3 text-xs text-gray-500 dark:text-gray-400">
              Buscando…
            </div>
          } @else if (results().length === 0 && query() && !pending()) {
            <div class="p-3 text-xs text-gray-500 dark:text-gray-400">
              {{ 'docs.search.empty' | transloco: { q: query() } }}
            </div>
          } @else if (results().length > 0) {
            <ul
              id="docs-search-listbox"
              role="listbox"
              class="max-h-80 overflow-y-auto py-1"
            >
              @for (r of results(); track r.id; let i = $index) {
                <li role="option" [attr.aria-selected]="i === selectedIdx()">
                  <a
                    [routerLink]="['/docs', r.category_slug, r.slug]"
                    (click)="close()"
                    (mouseenter)="selectedIdx.set(i)"
                    class="block px-3 py-2 transition-colors"
                    [class.bg-blue-50]="i === selectedIdx()"
                    [class.dark:bg-blue-900]="i === selectedIdx()"
                    [class.bg-gray-50]="i !== selectedIdx()"
                    [class.dark:hover:bg-gray-700]="i !== selectedIdx()"
                    [class.dark:bg-gray-700]="i !== selectedIdx()"
                  >
                    <div
                      class="text-sm font-medium text-gray-900 dark:text-white truncate"
                      [innerHTML]="highlight(r.title)"
                    ></div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5">
                      <span class="capitalize">{{ r.category_name }}</span>
                      <span aria-hidden="true">›</span>
                      <span class="truncate">{{ r.slug }}</span>
                    </div>
                  </a>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
})
export class DocsSearchComponent implements AfterViewInit, OnDestroy {
  private docs = inject(DocsService);
  private platformId = inject(PLATFORM_ID);

  @ViewChild('host') hostRef?: ElementRef<HTMLElement>;
  @ViewChild('input') inputRef?: ElementRef<HTMLInputElement>;

  readonly SearchIcon = Search;
  readonly XIcon = X;

  readonly query = signal('');
  readonly pending = signal(false);
  readonly openState = signal(false);
  readonly results = signal<DocSearchHit[]>([]);
  readonly selectedIdx = signal(-1);

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();
  private currentAbort: AbortController | null = null;
  private docClickHandler = (e: MouseEvent) => {
    if (this.hostRef && !this.hostRef.nativeElement.contains(e.target as Node)) {
      this.close();
    }
  };

  ngAfterViewInit(): void {
    this.search$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe((q) => this.runSearch(q));

    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('click', this.docClickHandler);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('click', this.docClickHandler);
    }
    this.currentAbort?.abort();
  }

  onInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.query.set(v);
    this.selectedIdx.set(-1);
    this.open();
    this.search$.next(v);
  }

  onKey(e: KeyboardEvent): void {
    const max = this.results().length - 1;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.close();
        return;
      case 'ArrowDown':
        e.preventDefault();
        if (max < 0) return;
        this.selectedIdx.update((i) => (i >= max ? 0 : i + 1));
        this.scrollSelectedIntoView();
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (max < 0) return;
        this.selectedIdx.update((i) => (i <= 0 ? max : i - 1));
        this.scrollSelectedIntoView();
        return;
      case 'Enter': {
        const i = this.selectedIdx();
        if (i < 0) return;
        e.preventDefault();
        const r = this.results()[i];
        if (!r) return;
        this.close();
        // Router navigation via <a> click is preferred for accessibility;
        // we let the user click with the mouse and we just call the
        // router programmatically here for keyboard-only users.
        this.inputRef?.nativeElement.blur();
        // Dispatch a real navigation; the <a> in the template has the
        // [routerLink] binding, so we just need to navigate.
        // Using window.location to be SSR-safe.
        if (isPlatformBrowser(this.platformId)) {
          window.location.assign(`/docs/${r.category_slug}/${r.slug}`);
        }
        return;
      }
    }
  }

  clear(): void {
    this.query.set('');
    this.results.set([]);
    this.selectedIdx.set(-1);
    this.currentAbort?.abort();
    this.pending.set(false);
    this.inputRef?.nativeElement.focus();
  }

  open(): void {
    this.openState.set(true);
  }

  close(): void {
    this.openState.set(false);
  }

  /**
   * Highlight all occurrences of the search term in `text` with a
   * <mark> tag. Case-insensitive; uses the raw query (not the cleaned
   * one) so a trailing space doesn't mangle the highlight.
   *
   * Returns safe HTML — the input is plain text (article titles) so no
   * XSS surface here. DOMPurify is overkill for this one-liner.
   */
  highlight(text: string): string {
    const q = this.query().trim();
    if (!q) return this.escape(text);
    // Split into terms so "crear factura" highlights both words.
    const terms = q
      .split(/\s+/)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);
    if (terms.length === 0) return this.escape(text);
    const re = new RegExp(`(${terms.join('|')})`, 'gi');
    return this.escape(text).replace(
      re,
      '<mark class="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded px-0.5">$1</mark>',
    );
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private scrollSelectedIntoView(): void {
    queueMicrotask(() => {
      const el = this.hostRef?.nativeElement.querySelector(
        '[aria-selected="true"] a',
      );
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private async runSearch(q: string): Promise<void> {
    // Cancel any in-flight request so only the latest query wins.
    this.currentAbort?.abort();
    const ac = new AbortController();
    this.currentAbort = ac;
    this.pending.set(true);
    try {
      const res = await this.docs.search(q, 8);
      if (ac.signal.aborted) return;
      this.results.set(res);
      this.selectedIdx.set(res.length > 0 ? 0 : -1);
    } catch {
      if (ac.signal.aborted) return;
      this.results.set([]);
    } finally {
      if (this.currentAbort === ac) {
        this.pending.set(false);
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKey(e: KeyboardEvent): void {
    // Slash key opens the search (common pattern: GitHub, Algolia DocSearch)
    if (e.key === '/' && this.inputRef && document.activeElement !== this.inputRef.nativeElement) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      this.inputRef.nativeElement.focus();
      this.open();
    }
  }
}
