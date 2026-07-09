/**
 * BlockRowComponent (PR2a email-block-editor)
 *
 * A single row in the block list. Renders the drag handle, a type
 * icon (unicode glyph), a short summary of the block's primary content,
 * and the edit/duplicate/delete actions. The header (@switch router) and
 * inline-expanded typed editor are NOT rendered here — the parent
 * BlockEditorComponent owns expansion state and renders the
 * BlockEditorHeaderComponent below the row when expanded.
 *
 * Plain HTML + custom CSS — no Angular Material dependency. Icons are
 * unicode glyphs (matches the project's icon-light pattern).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { BlockFormGroup } from './block-list.component';
import type { Block } from './block-types';

function readProp<T = unknown>(group: BlockFormGroup, key: string): T | undefined {
  const ctrl = group.controls.props.controls[key];
  if (!ctrl) return undefined;
  return ctrl.value as T;
}

@Component({
  selector: 'app-block-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CdkDrag, CdkDragHandle],
  template: `
    <div class="br-row" [class.br-row--expanded]="expanded()" data-testid="block-row">
      <button
        type="button"
        class="br-drag"
        cdkDragHandle
        aria-label="Mover bloque"
        data-testid="block-row-drag-handle"
      >
        <span class="br-drag-icon">⋮⋮</span>
      </button>

      <span class="br-type-icon" data-testid="block-row-type-icon" [attr.aria-label]="typeLabel()">
        {{ typeIcon() }}
      </span>

      <span class="br-summary" data-testid="block-row-summary">
        {{ summary() || '(vacío)' }}
      </span>

      <span class="br-actions">
        <button
          type="button"
          class="br-icon-btn"
          (click)="edit.emit()"
          aria-label="Editar"
          title="Editar"
          data-testid="block-row-edit"
        >
          ✎
        </button>
        <button
          type="button"
          class="br-icon-btn"
          (click)="duplicate.emit()"
          aria-label="Duplicar"
          title="Duplicar"
          data-testid="block-row-duplicate"
        >
          ⎘
        </button>
        <button
          type="button"
          class="br-icon-btn br-icon-btn--danger"
          (click)="delete.emit()"
          aria-label="Eliminar"
          title="Eliminar"
          data-testid="block-row-delete"
        >
          🗑
        </button>
      </span>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .br-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      transition: box-shadow 150ms ease;
    }
    .br-row:hover { box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .br-row--expanded {
      border-color: #4f46e5;
      box-shadow: 0 0 0 2px rgba(79,70,229,0.10);
    }
    .br-drag {
      background: transparent;
      border: none;
      cursor: grab;
      color: #9ca3af;
      padding: 2px 4px;
      display: flex;
      align-items: center;
      font-size: 14px;
      line-height: 1;
    }
    .br-drag:active { cursor: grabbing; }
    .br-drag-icon { letter-spacing: -2px; }
    .br-type-icon {
      color: #4f46e5;
      flex: 0 0 auto;
      font-size: 16px;
      width: 20px;
      text-align: center;
    }
    .br-summary {
      flex: 1 1 auto;
      font-size: 14px;
      color: #111827;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .br-actions {
      flex: 0 0 auto;
      display: flex;
      gap: 0;
    }
    .br-icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      color: #6b7280;
      font-size: 14px;
      line-height: 1;
    }
    .br-icon-btn:hover { background: #f3f4f6; color: #111827; }
    .br-icon-btn--danger:hover { background: #fef2f2; color: #b91c1c; }
  `],
})
export class BlockRowComponent {
  readonly formGroup = input.required<BlockFormGroup>();
  readonly index = input.required<number>();
  readonly hasLogoUrl = input.required<boolean>();
  readonly expanded = input<boolean>(false);

  readonly edit = output<void>();
  readonly duplicate = output<void>();
  readonly delete = output<void>();

  /** Unicode glyph per block type. */
  readonly typeIcon = computed<string>(() => {
    switch (this.formGroup().controls.type.value) {
      case 'logo':
        return '🖼';
      case 'heading':
        return 'H';
      case 'paragraph':
        return '¶';
      case 'button':
        return '▶';
      default:
        return '?';
    }
  });

  /** Spanish label for the type (used by aria-label). */
  readonly typeLabel = computed<string>(() => {
    switch (this.formGroup().controls.type.value) {
      case 'logo':
        return 'Logo';
      case 'heading':
        return 'Encabezado';
      case 'paragraph':
        return 'Párrafo';
      case 'button':
        return 'Botón';
      default:
        return 'Bloque';
    }
  });

  /**
   * Human-readable summary per block type. Reads from the untyped
   * `props` FormGroup via `readProp` — falls back to '(vacío)' when
   * the block has no readable primary content.
   *
   * The first 30 chars match the spec id 1945 §4 layout convention.
   */
  readonly summary = computed<string>(() => {
    const g = this.formGroup();
    const type = g.controls.type.value as Block['type'];
    switch (type) {
      case 'heading': {
        const text = readProp<string>(g, 'text');
        return (text ?? '').toString().slice(0, 30);
      }
      case 'paragraph': {
        const text = readProp<string>(g, 'text');
        return (text ?? '').toString().slice(0, 30);
      }
      case 'button': {
        const text = readProp<string>(g, 'text');
        return (text ?? 'Botón').toString().slice(0, 30);
      }
      case 'logo': {
        const alt = readProp<string>(g, 'alt');
        return (alt ?? 'Logo').toString().slice(0, 30);
      }
      default:
        return '';
    }
  });
}