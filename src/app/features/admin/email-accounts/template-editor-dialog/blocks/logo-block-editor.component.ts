/**
 * LogoBlockEditorComponent (PR2b email-block-editor)
 *
 * Renders the form controls for a single LogoBlock's `props` FormGroup.
 *
 * Per spec id 1945 §3 (Logo block):
 *   - src is READ-ONLY — derived from brand (companies.v_logo_url) and
 *     injected by the parent dialog. The user does not edit the src.
 *   - alt: free text (default = company name, maxlength 200)
 *   - max_height: slider 20-200 px (default 80)
 *   - max_width: slider 50-600 px (default 200)
 *
 * Layout: a read-only preview card (with the actual image when src is set,
 * or a placeholder when empty) + an "Editar" toggle that opens a popover
 * with the alt/size inputs. The popover is a plain inline panel — no
 * MatMenu dependency. The toggle stays "open" until the user clicks
 * "Listo" or the panel is dismissed.
 *
 * The "src is read-only" guarantee is enforced at the form level — the
 * factory in BlockEditorComponent (insertLogoBlock) creates `src` as a
 * non-disabled FormControl, but this UI never renders a text input for
 * it. The control exists for serialization parity.
 *
 * Plain HTML + custom CSS — no Angular Material dependency.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { VarInsertTargetDirective } from './var-insert-target.directive';

type LogoPropsFormGroup = FormGroup<{
  src: FormControl<string>;
  alt: FormControl<string>;
  max_height: FormControl<number>;
  max_width: FormControl<number>;
}>;

@Component({
  selector: 'app-logo-block-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, VarInsertTargetDirective],
  template: `
    <div
      class="lbe-root"
      [formGroup]="propsForm()"
      data-testid="logo-block-editor"
    >
      <div class="lbe-preview-card" data-testid="logo-preview-card">
        @if (hasImage()) {
          <img
            [src]="propsForm().controls.src.value"
            [alt]="propsForm().controls.alt.value || 'Logo'"
            [style.maxHeight.px]="propsForm().controls.max_height.value"
            [style.maxWidth.px]="propsForm().controls.max_width.value"
            class="lbe-preview-img"
            data-testid="logo-preview-img"
          />
        } @else {
          <span class="lbe-preview-empty" data-testid="logo-preview-empty">
            Sin logo configurado
          </span>
        }

        <button
          type="button"
          class="lbe-edit-toggle"
          (click)="togglePopover()"
          [attr.aria-expanded]="popoverOpen()"
          data-testid="logo-edit-toggle"
        >
          {{ popoverOpen() ? 'Cerrar' : 'Editar' }}
        </button>
      </div>

      @if (popoverOpen()) {
        <div class="lbe-popover" data-testid="logo-edit-popover">
          <label class="lbe-field">
            <span class="lbe-label">Texto alternativo (alt)</span>
            <input
              type="text"
              class="lbe-input"
              formControlName="alt"
              maxlength="200"
              appVarInsertTarget
              data-testid="logo-alt"
            />
            @if (
              propsForm().controls.alt.invalid &&
              propsForm().controls.alt.touched
            ) {
              <span class="lbe-error">Máximo 200 caracteres</span>
            }
          </label>

          <div class="lbe-slider-wrap">
            <label
              class="lbe-slider-label"
              for="logo-max-height"
            >
              Alto máximo: {{ propsForm().controls.max_height.value }}px
            </label>
            <input
              id="logo-max-height"
              type="range"
              min="20"
              max="200"
              step="1"
              formControlName="max_height"
              class="lbe-slider"
              data-testid="logo-max-height"
            />
          </div>

          <div class="lbe-slider-wrap">
            <label
              class="lbe-slider-label"
              for="logo-max-width"
            >
              Ancho máximo: {{ propsForm().controls.max_width.value }}px
            </label>
            <input
              id="logo-max-width"
              type="range"
              min="50"
              max="600"
              step="1"
              formControlName="max_width"
              class="lbe-slider"
              data-testid="logo-max-width"
            />
          </div>

          <button
            type="button"
            class="lbe-done-btn"
            (click)="togglePopover()"
            data-testid="logo-edit-done"
          >
            Listo
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .lbe-root {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .lbe-preview-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .lbe-preview-img {
      display: block;
      object-fit: contain;
      max-width: 100%;
    }
    .lbe-preview-empty {
      color: #9ca3af;
      font-size: 12px;
      font-style: italic;
    }
    .lbe-edit-toggle {
      margin-left: auto;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font: inherit;
      font-size: 12px;
      color: #334155;
      cursor: pointer;
    }
    .lbe-edit-toggle:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .lbe-popover {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .lbe-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .lbe-label {
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .lbe-input {
      font: inherit;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #0f172a;
      outline: none;
    }
    .lbe-input:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.18);
    }
    .lbe-error { color: #b91c1c; font-size: 11px; }
    .lbe-slider-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .lbe-slider-label { font-size: 11px; color: #6b7280; }
    .lbe-slider { width: 100%; }
    .lbe-done-btn {
      align-self: flex-end;
      background: #4f46e5;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .lbe-done-btn:hover { background: #4338ca; }
  `],
})
export class LogoBlockEditorComponent {
  readonly propsGroup = input.required<
    FormGroup<Record<string, AbstractControl<unknown>>>
  >();

  readonly propsForm = computed<LogoPropsFormGroup>(
    () => this.propsGroup() as unknown as LogoPropsFormGroup,
  );

  readonly popoverOpen = signal<boolean>(false);

  readonly hasImage = computed<boolean>(() => {
    const src = (this.propsForm().controls.src.value as string | null) ?? '';
    return /^https?:\/\//.test(src);
  });

  togglePopover(): void {
    this.popoverOpen.update((v) => !v);
  }
}
