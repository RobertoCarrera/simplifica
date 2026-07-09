/**
 * BlockRowComponent (PR2a email-block-editor)
 *
 * A single row in the block list. Renders the drag handle, a type
 * icon, a short summary of the block's primary content, and the
 * edit/duplicate/delete actions. The header (@switch router) and
 * inline-expanded typed editor are NOT rendered here — the parent
 * BlockEditorComponent owns expansion state and renders the
 * BlockEditorHeaderComponent below the row when expanded.
 *
 * Props access: `props` is a FormGroup with an UNTYPED control map
 * (see design id 1946 §3). We cast through `unknown` to read the
 * concrete control values per block type.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDrag,
  CdkDragHandle,
} from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BlockFormGroup } from './block-list.component';
import type { Block } from './block-types';

/**
 * Helper: read a control value by key from the untyped props FormGroup.
 * Returns `undefined` when the control is missing (graceful forward-compat
 * for partial block arrays).
 */
function readProp<T = unknown>(group: BlockFormGroup, key: string): T | undefined {
  const ctrl = group.controls.props.controls[key];
  if (!ctrl) return undefined;
  return ctrl.value as T;
}

@Component({
  selector: 'app-block-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CdkDrag,
    CdkDragHandle,
    MatIconModule,
    MatIconButton,
    MatTooltipModule,
  ],
  template: `
    <div class="br-row" [class.br-row--expanded]="expanded()" data-testid="block-row">
      <button
        type="button"
        class="br-drag"
        cdkDragHandle
        [attr.aria-label]="'Mover bloque'"
        data-testid="block-row-drag-handle"
      >
        <mat-icon>drag_indicator</mat-icon>
      </button>

      <mat-icon class="br-type-icon" data-testid="block-row-type-icon">
        {{ typeIcon() }}
      </mat-icon>

      <span class="br-summary" data-testid="block-row-summary">
        {{ summary() || '(vacío)' }}
      </span>

      <span class="br-actions">
        <button
          mat-icon-button
          type="button"
          (click)="edit.emit()"
          matTooltip="Editar"
          data-testid="block-row-edit"
        >
          <mat-icon>edit</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          (click)="duplicate.emit()"
          matTooltip="Duplicar"
          data-testid="block-row-duplicate"
        >
          <mat-icon>content_copy</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          (click)="delete.emit()"
          matTooltip="Eliminar"
          data-testid="block-row-delete"
        >
          <mat-icon>delete</mat-icon>
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
      padding: 2px;
      display: flex;
    }
    .br-drag:active { cursor: grabbing; }
    .br-type-icon {
      color: #4f46e5;
      flex: 0 0 auto;
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

  /** Material icon name per block type. */
  readonly typeIcon = computed<string>(() => {
    switch (this.formGroup().controls.type.value) {
      case 'logo':
        return 'image';
      case 'heading':
        return 'title';
      case 'paragraph':
        return 'notes';
      case 'button':
        return 'smart_button';
      default:
        return 'help_outline';
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