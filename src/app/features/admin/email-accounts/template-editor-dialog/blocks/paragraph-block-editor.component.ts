/**
 * ParagraphBlockEditorComponent (PR2b email-block-editor)
 *
 * Renders the form controls for a single ParagraphBlock's `props` FormGroup.
 *
 * Per spec id 1945 §3 (Paragraph block):
 *   - text: textarea, maxlength 5000 chars
 *   - align: 4-value select (left/center/right/justify)
 *   - color: 12-swatch curated palette (primary_color at index 0)
 *   - font_size: slider 12-32 px (default 16)
 *   - italic: boolean toggle
 *
 * The palette is a local copy of the heading editor's palette to keep
 * this component self-contained. A future PR can extract PALETTE to a
 * shared module if a third block type needs it.
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
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';

interface PaletteSwatch {
  hex: string;
  label: string;
}

const PALETTE_FALLBACK: ReadonlyArray<PaletteSwatch> = [
  { hex: '#111827', label: 'Negro' },
  { hex: '#4f46e5', label: 'Índigo' },
  { hex: '#0ea5e9', label: 'Cielo' },
  { hex: '#10b981', label: 'Verde' },
  { hex: '#f59e0b', label: 'Ámbar' },
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#8b5cf6', label: 'Violeta' },
  { hex: '#374151', label: 'Grafito' },
  { hex: '#6b7280', label: 'Gris' },
  { hex: '#f97316', label: 'Naranja' },
  { hex: '#ffffff', label: 'Blanco' },
];

type ParagraphPropsFormGroup = FormGroup<{
  text: FormControl<string>;
  align: FormControl<'left' | 'center' | 'right' | 'justify'>;
  color: FormControl<string>;
  font_size: FormControl<number>;
  italic: FormControl<boolean>;
}>;

@Component({
  selector: 'app-paragraph-block-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div
      class="pbe-root"
      [formGroup]="propsForm()"
      data-testid="paragraph-block-editor"
    >
      <label class="pbe-field">
        <span class="pbe-label">Texto</span>
        <textarea
          class="pbe-textarea"
          formControlName="text"
          rows="4"
          maxlength="5000"
          data-testid="paragraph-text"
        ></textarea>
        @if (
          propsForm().controls.text.invalid &&
          propsForm().controls.text.touched
        ) {
          <span class="pbe-error">Máximo 5000 caracteres</span>
        }
      </label>

      <div class="pbe-color-row">
        <span class="pbe-label">Color</span>
        <div class="pbe-palette" role="radiogroup" aria-label="Color del párrafo">
          @for (swatch of palette(); track swatch.hex) {
            <button
              type="button"
              class="pbe-swatch"
              [class.pbe-swatch--active]="propsForm().controls.color.value === swatch.hex"
              [style.background]="swatch.hex"
              [attr.aria-label]="swatch.label"
              [title]="swatch.label"
              (click)="propsForm().controls.color.setValue(swatch.hex)"
              [attr.data-testid]="'paragraph-color-' + swatch.hex"
            ></button>
          }
        </div>
      </div>

      <div class="pbe-row">
        <label class="pbe-field pbe-field--small">
          <span class="pbe-label">Alineación</span>
          <select
            class="pbe-select"
            formControlName="align"
            data-testid="paragraph-align"
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
            <option value="justify">Justificado</option>
          </select>
        </label>

        <div class="pbe-slider-wrap">
          <label class="pbe-slider-label" for="paragraph-fontsize">
            Tamaño: {{ propsForm().controls.font_size.value }}px
          </label>
          <input
            id="paragraph-fontsize"
            type="range"
            min="12"
            max="32"
            step="1"
            formControlName="font_size"
            class="pbe-slider"
            data-testid="paragraph-font-size"
          />
        </div>
      </div>

      <label class="pbe-italic-toggle">
        <input
          type="checkbox"
          formControlName="italic"
          data-testid="paragraph-italic"
        />
        <span>Cursiva</span>
      </label>

      @if (showEmptyWarning()) {
        <p class="pbe-warn" data-testid="paragraph-empty-warning">
          El bloque está vacío.
        </p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .pbe-root {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .pbe-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pbe-field--small { flex: 0 0 160px; }
    .pbe-label {
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pbe-textarea,
    .pbe-select {
      font: inherit;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #0f172a;
      outline: none;
      resize: vertical;
    }
    .pbe-textarea:focus,
    .pbe-select:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79,70,229,0.18);
    }
    .pbe-error { color: #b91c1c; font-size: 11px; }
    .pbe-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .pbe-slider-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 200px;
    }
    .pbe-slider-label { font-size: 11px; color: #6b7280; }
    .pbe-slider { width: 100%; }
    .pbe-color-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pbe-palette {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 6px;
    }
    .pbe-swatch {
      width: 100%;
      aspect-ratio: 1;
      border: 2px solid #e5e7eb;
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
    }
    .pbe-swatch--active {
      border-color: #4f46e5;
      box-shadow: 0 0 0 2px rgba(79,70,229,0.25);
    }
    .pbe-italic-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #374151;
    }
    .pbe-warn {
      margin: 0;
      color: #b45309;
      font-size: 12px;
    }
  `],
})
export class ParagraphBlockEditorComponent {
  readonly propsGroup = input.required<
    FormGroup<Record<string, AbstractControl<unknown>>>
  >();
  readonly propsForm = computed<ParagraphPropsFormGroup>(
    () => this.propsGroup() as unknown as ParagraphPropsFormGroup,
  );

  readonly primaryColor = input<string | null>(null);

  readonly palette = computed<ReadonlyArray<PaletteSwatch>>(() => {
    const primary = this.primaryColor();
    if (!primary) return PALETTE_FALLBACK;
    const rest = PALETTE_FALLBACK.filter(
      (s) => s.hex.toLowerCase() !== primary.toLowerCase(),
    );
    return [{ hex: primary, label: 'Principal' }, ...rest];
  });

  readonly showEmptyWarning = computed<boolean>(() => {
    const text = (this.propsForm().controls.text.value as string | undefined) ?? '';
    return text.trim().length === 0;
  });
}
