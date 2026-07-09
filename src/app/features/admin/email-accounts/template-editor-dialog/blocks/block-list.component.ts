/**
 * BlockListComponent (PR2a email-block-editor)
 *
 * CDK drag-drop container that hosts the BlockRowComponent children.
 * Owns no state — reads the FormArray via signal input, mutates it on drop,
 * and emits via the FormArray's valueChanges pipeline (no separate output
 * for reorder — the FormArray mutation triggers the parent's pipeline).
 *
 * Mirrors the pattern in src/app/features/calendar/calendar.component.ts
 * (cdkDropList + moveItemInArray), but operates on a Reactive Forms
 * FormArray instead of a plain array.
 *
 * Plain HTML + custom CSS — no Angular Material dependency (the project
 * uses CDK directly per design comments in template-editor-dialog.component.ts).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
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
          [hasLogoUrl]="hasLogoUrl()"
          (edit)="edit.emit(i)"
          (duplicate)="duplicate.emit(i)"
          (delete)="delete.emit(i)"
          [attr.data-testid]="'block-row-' + i"
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
  readonly formArray = input.required<FormArray<BlockFormGroup>>();
  readonly hasLogoUrl = input.required<boolean>();

  // Outputs for row actions — emitted with the row index.
  readonly edit = output<number>();
  readonly duplicate = output<number>();
  readonly delete = output<number>();

  // Computed snapshot of the array's controls (signal-friendly view).
  readonly controls = computed<readonly BlockFormGroup[]>(
    () => this.formArray().controls as readonly BlockFormGroup[]
  );

  /**
   * Track-by function: by stable id (uuid v4), not by index. CDK's
   * `cdkDrag` preserves DOM identity across reorder, and Angular's
   * `@for ... track` keeps FormGroup references stable across CD.
   */
  trackById(index: number, group: BlockFormGroup): string {
    return (group.controls.id.value as string) ?? `__pending-${index}`;
  }

  /**
   * Drop handler: reorder FormArray in place via moveItemInArray, then
   * notify the FormArray so the parent's valueChanges pipeline fires
   * (the preview re-renders).
   */
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
}