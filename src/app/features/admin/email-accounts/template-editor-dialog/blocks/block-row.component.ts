/**
 * BlockRowComponent (PR-wysiwyg email-block-editor)
 *
 * Divi/Gutenberg-style canvas row. Renders the block VISUALLY (using
 * the per-block TS renderers via block-visual.ts), with a hover overlay
 * for drag/edit/duplicate/delete controls. Click the visual → expand
 * the inline editor IN PLACE; click "Done" in the editor or click
 * another row → collapse back to the visual.
 *
 * The drag handle is a separate `cdkDragHandle` button (top-left),
 * visible only on hover or while editing (`:hover` selector — no JS
 * needed). The handle is the ONLY trigger for `cdkDrag`; clicking the
 * visual expands the editor instead of dragging.
 *
 * `@switch (formGroup().controls.type.value)` was the prior PR2a+
 * expansion pattern (parent owned the expansion); that is replaced by
 * per-row expansion here. The parent (BlockListComponent) only tracks
 * WHICH id is currently expanded and passes the boolean back down.
 *
 * Plain HTML + custom CSS — no Angular Material dependency.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { BlockFormGroup } from './block-list.component';
import type { Block, BlockType } from './block-types';
import { renderBlockToHtmlString } from './block-visual';
import { BlockEditorHeaderComponent } from './block-editor-header.component';

function readProp(group: BlockFormGroup, key: string): unknown {
  const ctrl = group.controls.props.controls[key];
  if (!ctrl) return undefined;
  return ctrl.value;
}

@Component({
  selector: 'app-block-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CdkDrag,
    CdkDragHandle,
    BlockEditorHeaderComponent,
  ],
  template: `
    <div
      class="br-row"
      [class.br-row--editing]="expanded()"
      cdkDrag
      [attr.data-testid]="'block-row-' + index()"
      [attr.data-block-id]="formGroup().controls.id.value"
    >
      <!-- Drag handle (top-left, visible on hover or editing) -->
      <button
        type="button"
        class="br-handle"
        cdkDragHandle
        aria-label="Mover bloque"
        title="Arrastrar para reordenar"
        (click)="$event.stopPropagation()"
        data-testid="block-row-drag-handle"
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>

      <!-- Action overlay (top-right, visible on hover or editing) -->
      <div
        class="br-actions"
        (click)="$event.stopPropagation()"
        data-testid="block-row-actions"
      >
        <button
          type="button"
          class="br-icon-btn"
          (click)="onEditClick()"
          aria-label="Editar"
          title="Editar"
          data-testid="block-row-edit"
        >
          <span aria-hidden="true">✏️</span>
        </button>
        <button
          type="button"
          class="br-icon-btn"
          (click)="onDuplicate()"
          aria-label="Duplicar"
          title="Duplicar"
          data-testid="block-row-duplicate"
        >
          <span aria-hidden="true">⎘</span>
        </button>
        <button
          type="button"
          class="br-icon-btn br-icon-btn--danger"
          (click)="onDelete()"
          aria-label="Eliminar"
          title="Eliminar"
          data-testid="block-row-delete"
        >
          <span aria-hidden="true">🗑</span>
        </button>
      </div>

      <!-- Visual (default) OR inline editor (expanded) -->
      @if (expanded()) {
        <div
          class="br-editor"
          data-testid="block-row-editor"
          (click)="$event.stopPropagation()"
        >
          <app-block-editor-header
            [formGroup]="formGroup()"
            [primaryColor]="primaryColor()"
            (closeEditor)="onCloseEditor()"
          />
        </div>
      } @else {
        <button
          type="button"
          class="br-visual-trigger"
          (click)="onVisualClick()"
          aria-label="Editar bloque"
          data-testid="block-row-visual"
        >
          <div
            class="br-visual"
            [innerHTML]="renderedHtml()"
          ></div>
          @if (summaryBadge()) {
            <p class="br-badge" data-testid="block-row-summary">{{ summaryBadge() }}</p>
          }
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .br-row {
      position: relative;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 12px;
      background: #ffffff;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .br-row:hover {
      border-color: #cbd5e1;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
    }
    .br-row--editing {
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
    }

    /* Drag handle — only visible on hover or editing */
    .br-handle {
      position: absolute;
      top: 6px;
      left: 6px;
      opacity: 0;
      background: #4f46e5;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      width: 24px;
      height: 24px;
      cursor: grab;
      font-size: 14px;
      line-height: 1;
      transition: opacity 120ms ease;
      z-index: 2;
    }
    .br-handle:active { cursor: grabbing; }
    .br-row:hover .br-handle,
    .br-row--editing .br-handle { opacity: 1; }

    /* Action overlay — only visible on hover or editing */
    .br-actions {
      position: absolute;
      top: 6px;
      right: 6px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 120ms ease;
      z-index: 2;
    }
    .br-row:hover .br-actions,
    .br-row--editing .br-actions { opacity: 1; }

    .br-icon-btn {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      width: 28px;
      height: 28px;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .br-icon-btn:hover { background: #f3f4f6; }
    .br-icon-btn--danger:hover { background: #fef2f2; color: #b91c1c; }

    /* Visual trigger — full-width button so click-anywhere expands */
    .br-visual-trigger {
      width: 100%;
      background: transparent;
      border: none;
      padding: 20px 12px 8px;
      cursor: pointer;
      text-align: left;
      font: inherit;
      color: inherit;
      border-radius: 6px;
      display: block;
    }
    .br-visual-trigger:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
    }

    /* The rendered HTML — neutral container so each block's own styles
       (h1 color, p color, button bg…) shine through. pointer-events:none
       so the parent button catches clicks; the rendered <a> tags inside
       buttons would otherwise swallow them. */
    .br-visual {
      pointer-events: none;
      padding: 4px 0 8px;
    }
    .br-visual :global(table) { margin-left: auto; margin-right: auto; }

    /* Compact "click to edit" hint when the block has no recognisable
       visual content (e.g. an empty heading). Shows under the visual. */
    .br-badge {
      margin: 4px 0 0;
      font-size: 12px;
      color: #6b7280;
      font-style: italic;
    }

    /* Inline editor wrapper — give the controls inside the typed
       editor room to breathe while expanded. */
    .br-editor {
      padding: 8px 4px 4px;
    }
  `],
})
export class BlockRowComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly formGroup = input.required<BlockFormGroup>();
  readonly index = input.required<number>();
  readonly expanded = input<boolean>(false);
  /** Brand primary color forwarded to the typed editors when the row
   *  is expanded. Optional — editors fall back to default palettes. */
  readonly primaryColor = input<string | null>(null);

  readonly expandedChange = output<boolean>();
  readonly duplicateBlock = output<void>();
  readonly deleteBlock = output<void>();

  /** Sanitized HTML for the block, ready for [innerHTML]. Recomputes
   *  when the FormGroup's props change (driven by typed-editor inputs
   *  and by per-row expansion toggles). */
  readonly renderedHtml = computed<SafeHtml>(() => {
    const g = this.formGroup();
    const type = g.controls.type.value as BlockType;
    const props: Record<string, unknown> = {};
    const controls = g.controls.props.controls as Record<string, { value: unknown }>;
    for (const k of Object.keys(controls)) props[k] = controls[k].value;
    // Build a minimal `Block` shape so we can route through the same
    // dispatcher the SQL path uses.
    const block = {
      id: g.controls.id.value as string,
      type,
      version: 1 as const,
      props: props as unknown as Block['props'],
    } as Block;
    const html = renderBlockToHtmlString(block);
    // bypassSecurityTrustHtml is safe here: renderBlockToHtmlString is
    // OWASP-escaped at the prop boundary (escapeHtml in renderBlockLogo
    // / Heading / Paragraph / Button). The WYSIWYG canvas renders
    // user-typed text (h1/paragraph body) that has already been
    // escaped; URLs go through the SAFE_URL_RE pre-validation in
    // renderBlockButton. No inline event handlers are ever emitted.
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  /** Optional human-readable hint shown under the visual when the
   *  block has no recognisable inline content (e.g. an empty heading).
   *  Keeps the click-target large enough for users with no content. */
  readonly summaryBadge = computed<string>(() => {
    const g = this.formGroup();
    const type = g.controls.type.value as BlockType;
    if (type === 'heading') {
      const text = readProp(g, 'text');
      return text ? '' : 'Toca para añadir un encabezado';
    }
    if (type === 'paragraph') {
      const text = readProp(g, 'text');
      return text ? '' : 'Toca para añadir un párrafo';
    }
    if (type === 'button') {
      const text = readProp(g, 'text');
      return text ? '' : 'Toca para configurar el botón';
    }
    if (type === 'logo') {
      const src = readProp(g, 'src');
      return src ? '' : 'Toca para configurar el logo';
    }
    return '';
  });

  onVisualClick(): void {
    if (!this.expanded()) this.expandedChange.emit(true);
  }

  onEditClick(): void {
    this.expandedChange.emit(true);
  }

  onCloseEditor(): void {
    this.expandedChange.emit(false);
  }

  onDuplicate(): void {
    this.duplicateBlock.emit();
  }

  onDelete(): void {
    this.deleteBlock.emit();
  }
}
