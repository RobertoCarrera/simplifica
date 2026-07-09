/**
 * BlockListComponent (PR-wysiwyg email-block-editor)
 *
 * CDK drag-drop container that hosts the BlockRowComponent children
 * in Divi/Gutenberg mode. Each row renders its block visually; only
 * ONE row can be expanded at a time (tracked by `expandedBlockId`).
 *
 * Expansion is by stable block id (uuid v4), not by index, so reorder
 * or duplicate operations do not lose the expand state. The id survives
 * `moveItemInArray` because the FormGroup reference itself is moved;
 * the `id` value is immutable.
 *
 * Click-outside collapses the open row: a host listener on the drop
 * list detects clicks outside any `[data-block-id]` row and clears
 * `expandedBlockId`. This mirrors the Divi/Gutenberg UX where another
 * click on the canvas collapses the active block.
 *
 * Plain HTML + custom CSS — no Angular Material dependency (the
 * existing project uses CDK directly per design comments).
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
} from '@angular/forms';
import { BlockRowComponent } from './block-row.component';

// FormGroup typing mirrors the design id 1946 §3 contract: the props map
// is UNTYPED at the Angular FormGroup level because the 4 *Props interfaces
// are heterogeneous. id/type/version stay strongly typed.
export type BlockFormGroup = FormGroup<{
  id: FormControl<string>;
  type: FormControl<'logo' | 'heading' | 'paragraph' | 'button'>;
  version: FormControl<1>;
  props: FormGroup<Record<string, AbstractControl<unknown>>>;
}>;

function readId(group: BlockFormGroup): string {
  return group.controls.id.value as string;
}

@Component({
  selector: 'app-block-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CdkDropList, CdkDrag, BlockRowComponent],
  template: `
    <div
      class="bl-drop"
      cdkDropList
      (cdkDropListDropped)="onDrop($event)"
      data-testid="block-list"
    >
      @for (group of controls(); track trackById($index, group); let i = $index) {
        <app-block-row
          cdkDrag
          [formGroup]="group"
          [index]="i"
          [expanded]="isExpanded(group)"
          [primaryColor]="primaryColor()"
          (expandedChange)="onExpandedChange(group, $event)"
          (duplicateBlock)="duplicate.emit(i)"
          (deleteBlock)="delete.emit(i)"
          [attr.data-testid]="'block-list-item-' + i"
        ></app-block-row>
      } @empty {
        <p class="bl-empty" data-testid="block-list-empty">
          Aún no hay bloques. Usa «+ Añadir bloque» para empezar.
        </p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .bl-drop {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 40px;
    }
    .bl-empty {
      color: #6b7280;
      font-size: 13px;
      text-align: center;
      padding: 16px 8px;
      border: 1px dashed #d1d5db;
      border-radius: 6px;
      margin: 0;
    }
    :host ::ng-deep .cdk-drag-preview {
      box-sizing: border-box;
      box-shadow: 0 5px 15px rgba(0,0,0,0.15);
      background: white;
    }
    :host ::ng-deep .cdk-drag-placeholder {
      opacity: 0.3;
    }
    :host ::ng-deep .cdk-drag-animating {
      transition: transform 200ms cubic-bezier(0,0,0.2,1);
    }
  `],
})
export class BlockListComponent {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  readonly formArray = input.required<FormArray<BlockFormGroup>>();
  /** Brand primary color forwarded to each row → typed editors. */
  readonly primaryColor = input<string | null>(null);
  /** Kept for API compatibility with the parent; not consumed in the
   *  WYSIWYG canvas (the AddBlockDropdown lives in the parent component
   *  and gates the Logo entry on its own). */
  readonly hasLogoUrl = input<boolean>(false);

  readonly duplicate = output<number>();
  readonly delete = output<number>();

  /** Stable id of the currently-expanded row, or null when none is
   *  expanded. Tracking by id (not index) keeps the expanded state
   *  stable across reorders — `moveItemInArray` moves the FormGroup
   *  reference but does not mutate `id.value`. */
  readonly expandedBlockId = signal<string | null>(null);

  /** Computed snapshot of the array's controls (signal-friendly view). */
  readonly controls = computed<readonly BlockFormGroup[]>(
    () => this.formArray().controls as readonly BlockFormGroup[]
  );

  trackById(index: number, group: BlockFormGroup): string {
    return readId(group) ?? `__pending-${index}`;
  }

  isExpanded(group: BlockFormGroup): boolean {
    return this.expandedBlockId() === readId(group);
  }

  /**
   * Called by BlockRowComponent when its (expandedChange) fires.
   * - expanded=true  → set this row's id as the active expanded row.
   * - expanded=false → if this row was the active one, clear it
   *   (otherwise another row toggled off, ignore).
   */
  onExpandedChange(group: BlockFormGroup, expanded: boolean): void {
    if (expanded) {
      this.expandedBlockId.set(readId(group));
      return;
    }
    if (this.expandedBlockId() === readId(group)) {
      this.expandedBlockId.set(null);
    }
  }

  /** Drop handler: reorder FormArray in place via moveItemInArray, then
   *  notify the FormArray so the parent's valueChanges pipeline fires
   *  (the preview re-renders). */
  onDrop(event: CdkDragDrop<BlockFormGroup[]>): void {
    const arr = this.formArray();
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(
      arr.controls as unknown as BlockFormGroup[],
      event.previousIndex,
      event.currentIndex,
    );
    arr.updateValueAndValidity({ emitEvent: true });
  }

  /**
   * Click-outside-to-collapse: any click inside the host that does NOT
   * land on an `[data-block-id]` ancestor collapses the active row.
   * This mirrors the Divi/Gutenberg UX (click the canvas = deselect the
   * block). The row's own click handler does NOT bubble up to here
   * because the inline editor's `click)="$event.stopPropagation()"`
   * stops propagation when the user is mid-edit.
   */
  @HostListener('click', ['$event'])
  onHostClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // A click within any row (including its handle, actions, or inner
    // controls) is "inside" — leave the row's own click handlers to
    // manage expansion.
    if (target.closest('[data-block-id]')) return;
    if (this.expandedBlockId() === null) return;
    this.expandedBlockId.set(null);
  }

  /** Programmatic API for the parent (BlockEditorComponent) to expand
   *  the first row after auto-seed without needing a separate event. */
  expandById(id: string | null): void {
    this.expandedBlockId.set(id);
  }
}
