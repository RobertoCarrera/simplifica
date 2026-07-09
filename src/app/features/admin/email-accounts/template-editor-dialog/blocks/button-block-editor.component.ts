/**
 * ButtonBlockEditorComponent (PR2b email-block-editor)
 *
 * Renders the form controls for a single ButtonBlock's `props` FormGroup.
 *
 * Per spec id 1945 §3 (Button block):
 *   - text: input, maxlength 100 (default 'Click aquí')
 *   - url: input, maxlength 2000, regex /^(https?:\/\/|mailto:|\{\{)/
 *     (server also re-validates the substituted URL — see design id 1946
 *     §5.2 — and degrades to <span> when the resolved URL is not
 *     http(s)/mailto/fragment/root-relative)
 *   - background_color + text_color: 12-swatch curated palette
 *   - padding: slider 4-32 px (default 12)
 *   - border_radius: slider 0-24 px (default 6)
 *   - align: 3-value select (left/center/right)
 *
 * Two palette instances (background + text) — each gets the same swatch
 * list, with the first 3 swatches derived from `primaryColor` when set.
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

type ButtonPropsFormGroup = FormGroup<{
  text: FormControl<string>;
  url: FormControl<string>;
  background_color: FormControl<string>;
  text_color: FormControl<string>;
  padding: FormControl<number>;
  border_radius: FormControl<number>;
  align: FormControl<'left' | 'center' | 'right'>;
}>;

@Component({
  selector: 'app-button-block-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div
      class="bbe-root"
      [formGroup]="propsForm()"
      data-testid="button-block-editor"
    >
      <div class="bbe-row">
        <label class="bbe-field bbe-field--grow">
          <span class="bbe-label">Texto</span>
          <input
            type="text"
            class="bbe-input"
            formControlName="text"
            maxlength="100"
            data-testid="button-text"
          />
          @if (
            propsForm().controls.text.invalid &&
            propsForm().controls.text.touched
          ) {
            <span class="bbe-error">Máximo 100 caracteres</span>
          }
        </label>

        <label class="bbe-field bbe-field--grow">
          <span class="bbe-label">URL</span>
          <input
            type="text"
            class="bbe-input"
            formControlName="url"
            maxlength="2000"
            [attr.placeholder]="urlPlaceholder"
            data-testid="button-url"
          />
          @if (
            propsForm().controls.url.invalid &&
            propsForm().controls.url.touched
          ) {
            <span class="bbe-error">URL inválida (use http(s)://, mailto:, o una variable)</span>
          }
        </label>
      </div>

      <div class="bbe-palette-row">
        <div class="bbe-palette-block">
          <span class="bbe-label">Color de fondo</span>
          <div class="bbe-palette" role="radiogroup" aria-label="Color de fondo">
            @for (swatch of palette(); track swatch.hex) {
              <button
                type="button"
                class="bbe-swatch"
                [class.bbe-swatch--active]="
                  propsForm().controls.background_color.value === swatch.hex
                "
                [style.background]="swatch.hex"
                [attr.aria-label]="'Fondo: ' + swatch.label"
                [title]="swatch.label"
                (click)="propsForm().controls.background_color.setValue(swatch.hex)"
                [attr.data-testid]="'button-bg-' + swatch.hex"
              ></button>
            }
          </div>
        </div>

        <div class="bbe-palette-block">
          <span class="bbe-label">Color de texto</span>
          <div class="bbe-palette" role="radiogroup" aria-label="Color de texto">
            @for (swatch of palette(); track swatch.hex) {
              <button
                type="button"
                class="bbe-swatch bbe-swatch--bordered"
                [class.bbe-swatch--active]="
                  propsForm().controls.text_color.value === swatch.hex
                "
                [style.background]="swatch.hex"
                [attr.aria-label]="'Texto: ' + swatch.label"
                [title]="swatch.label"
                (click)="propsForm().controls.text_color.setValue(swatch.hex)"
                [attr.data-testid]="'button-fg-' + swatch.hex"
              ></button>
            }
          </div>
        </div>
      </div>

      <div class="bbe-row">
        <div class="bbe-slider-wrap">
          <label class="bbe-slider-label" for="button-padding">
            Padding: {{ propsForm().controls.padding.value }}px
          </label>
          <input
            id="button-padding"
            type="range"
            min="4"
            max="32"
            step="1"
            formControlName="padding"
            class="bbe-slider"
            data-testid="button-padding"
          />
        </div>

        <div class="bbe-slider-wrap">
          <label class="bbe-slider-label" for="button-radius">
            Radio: {{ propsForm().controls.border_radius.value }}px
          </label>
          <input
            id="button-radius"
            type="range"
            min="0"
            max="24"
            step="1"
            formControlName="border_radius"
            class="bbe-slider"
            data-testid="button-border-radius"
          />
        </div>

        <label class="bbe-field bbe-field--small">
          <span class="bbe-label">Alineación</span>
          <select
            class="bbe-select"
            formControlName="align"
            data-testid="button-align"
          >
            <option value="left">Izquierda</option>
            <option value="center">Centro</option>
            <option value="right">Derecha</option>
          </select>
        </label>
      </div>

      @if (showTextWarning()) {
        <p class="bbe-warn" data-testid="button-empty-warning">
          El botón no tiene texto.
        </p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .bbe-root {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .bbe-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .bbe-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bbe-field--small { flex: 0 0 130px; }
    .bbe-field--grow { flex: 1 1 200px; }
    .bbe-label {
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .bbe-input,
    .bbe-select {
      font: inherit;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #0f172a;
      outline: none;
    }
    .bbe-input:focus,
    .bbe-select:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 3px rgba(79,70,229,0.18);
    }
    .bbe-error { color: #b91c1c; font-size: 11px; }
    .bbe-palette-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .bbe-palette-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1 1 240px;
    }
    .bbe-palette {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 6px;
    }
    .bbe-swatch {
      width: 100%;
      aspect-ratio: 1;
      border: 2px solid transparent;
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
    }
    .bbe-swatch--bordered {
      border-color: #cbd5e1;
    }
    .bbe-swatch--active {
      border-color: #4f46e5 !important;
      box-shadow: 0 0 0 2px rgba(79,70,229,0.25);
    }
    .bbe-slider-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 160px;
    }
    .bbe-slider-label { font-size: 11px; color: #6b7280; }
    .bbe-slider { width: 100%; }
    .bbe-warn {
      margin: 0;
      color: #b45309;
      font-size: 12px;
    }
  `],
})
export class ButtonBlockEditorComponent {
  readonly propsGroup = input.required<
    FormGroup<Record<string, AbstractControl<unknown>>>
  >();
  readonly propsForm = computed<ButtonPropsFormGroup>(
    () => this.propsGroup() as unknown as ButtonPropsFormGroup,
  );

  readonly primaryColor = input<string | null>(null);

  /**
   * Placeholder string shown in the URL input. Built at construction
   * time so the literal `{{`/`}}` braces don't trip Angular's template
   * parser (which would try to interpolate them as a binding).
   */
  readonly urlPlaceholder =
    'https://…  o  mailto:…  o  ' + '{' + '{' + ' var ' + '}' + '}';

  readonly palette = computed<ReadonlyArray<PaletteSwatch>>(() => {
    const primary = this.primaryColor();
    if (!primary) return PALETTE_FALLBACK;
    const rest = PALETTE_FALLBACK.filter(
      (s) => s.hex.toLowerCase() !== primary.toLowerCase(),
    );
    return [{ hex: primary, label: 'Principal' }, ...rest];
  });

  readonly showTextWarning = computed<boolean>(() => {
    const text = (this.propsForm().controls.text.value as string | undefined) ?? '';
    return text.trim().length === 0;
  });
}
