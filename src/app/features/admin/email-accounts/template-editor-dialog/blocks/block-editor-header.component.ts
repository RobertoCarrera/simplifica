/**
 * BlockEditorHeaderComponent (PR-wysiwyg email-block-editor)
 *
 * `@switch (formGroup().controls.type.value)` router that delegates the
 * `props` FormGroup to the appropriate typed editor. In the WYSIWYG
 * canvas (per-row expansion), this component is rendered INSIDE the
 * BlockRowComponent when the row is expanded — replacing the visual
 * of the block with the typed form controls.
 *
 * Adds a "✓ Done" button at the top of the editor. Clicking it (or
 * emitting the same intent via the `closeEditor` output) collapses
 * the row back to its visual rendering via the parent BlockListComponent.
 *
 * Plain HTML + custom CSS — no Angular Material dependency.
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
  AbstractControl,
  FormGroup,
} from '@angular/forms';
import { HeadingBlockEditorComponent } from './heading-block-editor.component';
import { ParagraphBlockEditorComponent } from './paragraph-block-editor.component';
import { ButtonBlockEditorComponent } from './button-block-editor.component';
import { LogoBlockEditorComponent } from './logo-block-editor.component';
import { BlockFormGroup } from './block-list.component';

@Component({
  selector: 'app-block-editor-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    HeadingBlockEditorComponent,
    ParagraphBlockEditorComponent,
    ButtonBlockEditorComponent,
    LogoBlockEditorComponent,
  ],
  template: `
    <div class="beh-root" data-testid="block-editor-header">
      <header class="beh-toolbar" data-testid="block-editor-toolbar">
        <span class="beh-title">{{ typeLabel() }}</span>
        <button
          type="button"
          class="beh-done"
          (click)="onDoneClick()"
          aria-label="Cerrar editor"
          title="Cerrar editor"
          data-testid="block-editor-done"
        >
          <span aria-hidden="true">✓</span> Listo
        </button>
      </header>

      <div class="beh-body" data-testid="block-editor-body">
        @switch (formGroup().controls.type.value) {
          @case ('heading') {
            <app-heading-block-editor
              [propsGroup]="typedProps()"
              [primaryColor]="primaryColor()"
            ></app-heading-block-editor>
          }
          @case ('paragraph') {
            <app-paragraph-block-editor
              [propsGroup]="typedProps()"
              [primaryColor]="primaryColor()"
            ></app-paragraph-block-editor>
          }
          @case ('button') {
            <app-button-block-editor
              [propsGroup]="typedProps()"
              [primaryColor]="primaryColor()"
            ></app-button-block-editor>
          }
          @case ('logo') {
            <app-logo-block-editor
              [propsGroup]="typedProps()"
            ></app-logo-block-editor>
          }
          @default {
            <div class="beh-placeholder" data-testid="unknown-type-placeholder">
              Tipo de bloque desconocido.
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .beh-root {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .beh-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      background: #eef2ff;     /* indigo-50 — matches the editor frame */
      border: 1px solid #c7d2fe;
    }
    .beh-title {
      font-size: 12px;
      font-weight: 600;
      color: #4338ca;          /* indigo-700 */
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .beh-done {
      background: #4f46e5;     /* indigo-600 */
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font: inherit;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background 120ms ease;
    }
    .beh-done:hover { background: #4338ca; }
    .beh-done:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
    }
    .beh-body { padding: 4px 2px; }
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
  /** Brand primary color used by the typed editors (heading/paragraph/
   *  button) to seed the first swatch in their color palettes. Optional;
   *  editors fall back to their default palette when null. */
  readonly primaryColor = input<string | null>(null);
  /** Emits when the user clicks "✓ Done" (or any other close intent).
   *  Parent BlockListComponent listens and toggles the row's expansion
   *  back to false via the matching BlockFormGroup id. */
  readonly closeEditor = output<void>();

  /** Spanish label for the block type (matches the editor header). */
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
   * Cast the `props` FormGroup to the typed view that the typed editors
   * expect. The cast is intentional — see design id 1946 §3 for why
   * `props` is untyped at the FormGroup level (heterogeneous Props union
   * collapses to `never`).
   */
  readonly typedProps = computed<FormGroup<Record<string, AbstractControl<unknown>>>>(
    () => this.formGroup().controls.props,
  );

  onDoneClick(): void {
    this.closeEditor.emit();
  }
}
