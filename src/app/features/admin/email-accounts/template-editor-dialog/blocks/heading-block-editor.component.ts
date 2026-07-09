/**
 * HeadingBlockEditorComponent (PR2a email-block-editor)
 *
 * The ONLY typed block editor implemented in PR2a. Renders the form
 * controls for a single HeadingBlock's `props` FormGroup:
 *
 *   - level select (1 | 2 | 3)
 *   - text input (maxlength=200)
 *   - color palette (12 swatches; primary_color at index 0)
 *   - align select (left | center | right)
 *   - font_size slider (12-72)
 *
 * Two-way binding is implicit through the FormControlName bindings — the
 * parent's FormGroup propagates valueChanges up to the FormArray which
 * triggers the BlockEditorComponent's debounced preview pipeline.
 *
 * PR2b adds LogoBlockEditorComponent / ParagraphBlockEditorComponent /
 * ButtonBlockEditorComponent. The BlockEditorHeaderComponent's @switch
 * (see block-editor-header.component.ts) routes to whichever typed
 * editor matches the block.type.
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

type HeadingPropsFormGroup = FormGroup<{
  level: FormControl<1 | 2 | 3>;
  text: FormControl<string>;
  color: FormControl<string>;
  align: FormControl<'left' | 'center' | 'right'>;
  font_size: FormControl<number>;
}>;

@Component({
  selector: 'app-heading-block-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="hbe-root" [formGroup]="propsForm()" data-testid="heading-block-editor">
      <div class="hbe-row">
        <label class="hbe-field hbe-field--small">
          <span class="hbe-label">Nivel</span>
          <select
            class="hbe-select"
            formControlName="level"
            data-testid="heading-level"
          >
            <option [value]="1">H1</option>
            <option [value]="2">H2</option>
            <option [value]="3">H3</option>
          </select>
        </label>

        <label class="hbe-field hbe-field--grow">
          <span class="hbe-label">Texto</span>
          <input
            type="text"
            class="hbe-input"
            formControlName="text"
            maxlength="200"
            data-testid="heading-text"
          />
          @if (propsForm().controls.text.invalid && propsForm().controls.text.touched) {
            <span class="hbe-error">Máximo 200 caracteres</span>
          }
        </label>
      </div>

      <div class="hbe-color-row">
        <span class="hbe-label">Color</span>
        <div class="hbe-palette" role="radiogroup" aria-label="Color del encabezado">
          @for (swatch of palette(); track swatch.hex) {
            <button
              type="button"
              class="hbe-swatch"
              [class.hbe-swatch--active]="propsForm().controls.color.value === swatch.hex"
              [style.background]="swatch.hex"
              [attr.aria-label]="swatch.label"
              [title]="swatch.label"
              (click)="propsForm().controls.color.setValue(swatch.hex)"
              [attr.data-testid]="'heading-color-' + swatch.hex"
            ></button>
          }
        </div>
      </div>

      <div class="hbe-row">
        <label class="hbe-field">
          <span class="hbe-label">Alineación</span>
          <select
            class="hbe-select"
            formControlName="align"
            data-testid="heading-align"
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </label>

        <div class="hbe-slider-wrap">
          <label class="hbe-slider-label" for="heading-fontsize">
            Tamaño: {{ propsForm().controls.font_size.value }}px
          </label>
          <input
            id="heading-fontsize"
            type="range"
            min="12"
            max="72"
            step="1"
            formControlName="font_size"
            class="hbe-slider"
            data-testid="heading-font-size"
          />
        </div>
      </div>

      @if (showEmptyWarning()) {
        <p class="hbe-warn" data-testid="heading-empty-warning">
          El bloque está vacío.
        </p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .hbe-root {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .hbe-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .hbe-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .hbe-field--small { flex: 0 0 110px; }
    .hbe-field--grow { flex: 1 1 240px; }
    .hbe-label {
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .hbe-input,
    .hbe-select {
      font: inherit;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #0f172a;
      outline: none;
    }
    .hbe-input:focus,
    .hbe-select:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79,70,229,0.18);
    }
    .hbe-error { color: #b91c1c; font-size: 11px; }
    .hbe-slider-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 200px;
    }
    .hbe-slider-label { font-size: 11px; color: #6b7280; }
    .hbe-slider { width: 100%; }
    .hbe-color-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hbe-palette {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 6px;
    }
    .hbe-swatch {
      width: 100%;
      aspect-ratio: 1;
      border: 2px solid #e5e7eb;
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
    }
    .hbe-swatch--active {
      border-color: #4f46e5;
      box-shadow: 0 0 0 2px rgba(79,70,229,0.25);
    }
    .hbe-warn {
      margin: 0;
      color: #b45309;
      font-size: 12px;
    }
  `],
})
export class HeadingBlockEditorComponent {
  // The PR2a component receives the entire props FormGroup. The
  // Header component (block-editor-header.component.ts) is responsible
  // for casting through `unknown` to access props.controls — here we
  // expose the typed shape directly via a computed signal.
  readonly propsGroup = input.required<
    FormGroup<Record<string, AbstractControl<unknown>>>
  >();

  readonly propsForm = computed<HeadingPropsFormGroup>(
    () => this.propsGroup() as unknown as HeadingPropsFormGroup,
  );

  // Optional primary color override (passed by the parent dialog).
  // Falls back to the static palette when null.
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