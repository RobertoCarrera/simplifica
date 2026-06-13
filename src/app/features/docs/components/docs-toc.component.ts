import {
  Component,
  Input,
  ElementRef,
  OnDestroy,
  OnInit,
  OnChanges,
  SimpleChanges,
  PLATFORM_ID,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Right-rail Table of Contents.
 *
 * Reads the rendered article from `contentRef` (an ElementRef
 * pointing at the article container), scans for `<h2>` and `<h3>`,
 * adds stable `id`s, and tracks the active section via
 * IntersectionObserver so the active link gets a highlight.
 *
 * Hidden on mobile by the parent grid (`hidden md:block`).
 * Hidden entirely when fewer than 2 H2 sections are found.
 */
@Component({
  selector: 'app-docs-toc',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  template: `
    @if (entries().length >= 2) {
      <aside
        class="docs-toc"
        [attr.aria-label]="'docs.toc.label' | transloco"
      >
        <p class="docs-toc-title">{{ 'docs.toc.title' | transloco }}</p>
        <ul class="docs-toc-list">
          @for (e of entries(); track e.id) {
            <li [class.docs-toc-item-h3]="e.level === 3">
              <a
                [href]="'#' + e.id"
                (click)="onClick($event, e.id)"
                [class.docs-toc-link]="true"
                [class.docs-toc-link--active]="e.id === activeId()"
              >
                {{ e.text }}
              </a>
            </li>
          }
        </ul>
      </aside>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-width: 0;
      }
      .docs-toc {
        position: sticky;
        top: 5rem;
        max-height: calc(100vh - 6rem);
        overflow-y: auto;
        padding: 0.5rem 0 0.5rem 1rem;
        font-size: 0.8125rem;
        line-height: 1.4;
      }
      .docs-toc-title {
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 0.6875rem;
        font-weight: 600;
        color: rgb(107 114 128);
        margin-bottom: 0.5rem;
      }
      :host-context(.dark) .docs-toc-title {
        color: rgb(156 163 175);
      }
      .docs-toc-list {
        list-style: none;
        margin: 0;
        padding: 0;
        border-left: 1px solid rgb(229 231 235);
      }
      :host-context(.dark) .docs-toc-list {
        border-left-color: rgb(55 65 81);
      }
      .docs-toc-item-h3 {
        padding-left: 0.75rem;
      }
      .docs-toc-link {
        display: block;
        padding: 0.25rem 0.75rem;
        margin-left: -1px;
        border-left: 2px solid transparent;
        color: rgb(107 114 128);
        text-decoration: none;
        transition: color 150ms, border-color 150ms;
      }
      .docs-toc-link:hover {
        color: rgb(29 78 216);
      }
      .docs-toc-link--active {
        color: rgb(29 78 216);
        border-left-color: rgb(29 78 216);
        font-weight: 500;
      }
      :host-context(.dark) .docs-toc-link {
        color: rgb(156 163 175);
      }
      :host-context(.dark) .docs-toc-link:hover,
      :host-context(.dark) .docs-toc-link--active {
        color: rgb(147 197 253);
        border-left-color: rgb(96 165 250);
      }
    `,
  ],
})
export class DocsTocComponent implements OnInit, OnDestroy, OnChanges {
  /** ElementRef pointing at the rendered article DOM. */
  @Input() contentRef?: ElementRef;

  private platformId = inject(PLATFORM_ID);

  readonly entries = signal<TocEntry[]>([]);
  readonly activeId = signal<string | null>(null);

  private observer?: IntersectionObserver;

  ngOnInit(): void {
    // First scan after Angular has rendered the content. We use an
    // effect-like microtask so the parent has stamped the DOM.
    queueMicrotask(() => this.rescan());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['contentRef']) {
      queueMicrotask(() => this.rescan());
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  onClick(event: MouseEvent, id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  }

  private rescan(): void {
    if (!this.contentRef) return;
    const root = this.contentRef.nativeElement;
    if (!root) return;

    const headingList: HTMLElement[] = Array.from(
      root.querySelectorAll('h2, h3'),
    ).filter((n): n is HTMLElement => n instanceof HTMLElement);
    const found: TocEntry[] = [];
    headingList.forEach((h, idx) => {
      // Phase 5 may pre-render with explicit ids; if missing, mint a
      // stable one from the heading text. Strip diacritics and
      // punctuation so the anchor URL is shareable.
      if (!h.id) {
        h.id = this.slugify(h.textContent ?? `section-${idx}`);
      }
      found.push({ id: h.id, text: h.textContent ?? '', level: h.tagName === 'H3' ? 3 : 2 });
    });
    this.entries.set(found);
    this.setupObserver(root, found);
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'section';
  }

  private setupObserver(root: HTMLElement, entries: TocEntry[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.observer?.disconnect();
    if (entries.length === 0) return;

    const visibility = new Map<string, number>();
    this.observer = new IntersectionObserver(
      (records) => {
        for (const r of records) {
          visibility.set(r.target.id, r.intersectionRatio);
        }
        // Pick the heading with the highest ratio that is > 0; fall
        // back to the first one if all are invisible.
        let best: { id: string; ratio: number } | null = null;
        for (const [id, ratio] of visibility) {
          if (!best || ratio > best.ratio) best = { id, ratio };
        }
        if (best && best.ratio > 0) {
          this.activeId.set(best.id);
        }
      },
      {
        // Track when a heading enters the upper third of the viewport.
        rootMargin: '-80px 0px -66% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const e of entries) {
      const el = root.querySelector(`#${CSS.escape(e.id)}`) as HTMLElement | null;
      if (el) this.observer.observe(el);
    }
  }
}
