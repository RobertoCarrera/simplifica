import { Pipe, PipeTransform, inject } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

import { MarkdownService } from './markdown.service';

/**
 * `markdown` pipe — turns raw `content_markdown` into sanitised
 * SafeHtml ready for `[innerHTML]`. Drop-in replacement for the
 * project-wide `safeHtml` pipe in contexts where the input is
 * markdown, not pre-built HTML.
 *
 * Usage:
 *   <div [innerHTML]="article.content_markdown | markdown"></div>
 *
 * The pipe is marked `pure: true` (the default) because `marked`
 * output is deterministic for a given input string; Angular will
 * re-evaluate it whenever the bound expression changes.
 *
 * Heading extraction is intentionally not exposed via this pipe —
 * the article component calls `MarkdownService.render()` directly
 * to get both `html` and `headings` in one pass.
 */
@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  private md = inject(MarkdownService);

  transform(value: string | null | undefined): SafeHtml {
    return this.md.renderHtml(value);
  }
}
