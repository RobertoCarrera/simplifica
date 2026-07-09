/**
 * BlockEditorHeaderComponent (PR2a email-block-editor)
 *
 * `@switch (formGroup().controls.type.value)` router that delegates the
 * `props` FormGroup to the appropriate typed editor. In PR2a only the
 * heading case is wired; the logo/paragraph/button cases render
 * placeholder cards that say "Disponible en la próxima versión" so the
 * user sees what's coming without breaking the form.
 *
 * The BlockEditorComponent owns the FormArray and passes one FormGroup
 * down here per row. We do NOT mutate the FormGroup here — typed
 * editors mutate it in place via FormControlName bindings.
 *
 * Plain HTML + custom CSS — no Angular Material dependency.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormGroup,
} from '@angular/forms';
import { HeadingBlockEditorComponent } from './heading-block-editor.component';
import { BlockFormGroup } from './block-list.component';

@Component({
  selector: 'app-block-editor-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, HeadingBlockEditorComponent],
  template: `
    <div class="beh-root" data-testid="block-editor-header">
      @switch (formGroup().controls.type.value) {
        @case ('heading') {
          <app-heading-block-editor
            [propsGroup]="typedProps()"
            [primaryColor]="primaryColor()"
          ></app-heading-block-editor>
        }
        @case ('paragraph') {
          <div class="beh-placeholder" data-testid="paragraph-placeholder">
            Editor de párrafo disponible en PR2b.
          </div>
        }
        @case ('button') {
          <div class="beh-placeholder" data-testid="button-placeholder">
            Editor de botón disponible en PR2b.
          </div>
        }
        @case ('logo') {
          <div class="beh-placeholder" data-testid="logo-placeholder">
            Editor de logo disponible en PR2b.
          </div>
        }
        @default {
          <div class="beh-placeholder">Tipo de bloque desconocido.</div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; margin-top: 8px; }
    .beh-root { display: block; }
    .beh-placeholder {
      padding: 12px;
      background: #f3f4f6;
      border-radius: 6px;
      color: #6b7280;
      font-size: 13px;
      text-align: center;
    }
  `],
})
export class BlockEditorHeaderComponent {
  readonly formGroup = input.required<BlockFormGroup>();
  readonly primaryColor = input<string | null>(null);

  /**
   * Cast the `props` FormGroup to the typed view that
   * HeadingBlockEditorComponent expects. The cast is intentional —
   * see design id 1946 §3 for why `props` is untyped at the FormGroup
   * level (heterogeneous Props union collapses to `never`).
   */
  readonly typedProps = computed<FormGroup<Record<string, AbstractControl<unknown>>>>(
    () => this.formGroup().controls.props,
  );
}