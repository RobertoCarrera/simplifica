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
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

/** Color palette (12 swatches); index 0 is the company's primary_color. */
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
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <div class="hbe-root" [formGroup]="propsForm()" data-testid="heading-block-editor">
      <mat-form-field appearance="outline" class="hbe-field hbe-field--small">
        <mat-label>Nivel</mat-label>
        <mat-select formControlName="level" data-testid="heading-level">
          <mat-option [value]="1">H1</mat-option>
          <mat-option [value]="2">H2</mat-option>
          <mat-option [value]="3">H3</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="hbe-field">
        <mat-label>Texto</mat-label>
        <input
          matInput
          type="text"
          formControlName="text"
          maxlength="200"
          data-testid="heading-text"
        />
        @if (propsForm().controls.text.invalid && propsForm().controls.text.touched) {
          <mat-error>Máximo 200 caracteres</mat-error>
        }
      </mat-form-field>

      <div class="hbe-color-row">
        <span class="hbe-color-label">Color</span>
        <div class="hbe-palette" role="radiogroup" aria-label="Color del encabezado">
          @for (swatch of palette(); track swatch.hex) {
            <button
              type="button"
              class="hbe-swatch"
              [class.hbe-swatch--active]="propsForm().controls.color.value === swatch.hex"
              [style.background]="swatch.hex"
              [attr.aria-label]="swatch.label"
              [attr.title]="swatch.label"
              (click)="propsForm().controls.color.setValue(swatch.hex)"
              [attr.data-testid]="'heading-color-' + swatch.hex"
            ></button>
          }
        </div>
      </div>

      <div class="hbe-row">
        <mat-form-field appearance="outline" class="hbe-field">
          <mat-label>Alineación</mat-label>
          <mat-select formControlName="align" data-testid="heading-align">
            <mat-option value="left">Izquierda</mat-option>
            <mat-option value="center">Centro</mat-option>
            <mat-option value="right">Derecha</mat-option>
          </mat-select>
        </mat-form-field>

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
    .hbe-field { width: 100%; }
    .hbe-field--small { max-width: 120px; }
    .hbe-row {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .hbe-row .hbe-field { flex: 1 1 160px; }
    .hbe-slider-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 200px;
    }
    .hbe-slider-label { font-size: 12px; color: #6b7280; }
    .hbe-slider { width: 100%; }
    .hbe-color-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hbe-color-label { font-size: 12px; color: #6b7280; }
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
  readonly propsGroup = input.required<FormGroup<Record<string, import('@angular/forms').AbstractControl<unknown>>>>();

  // Build a typed view of the props group for use in template bindings.
  readonly propsForm = computed<HeadingPropsFormGroup>(() => {
    const g = this.propsGroup();
    return g as unknown as HeadingPropsFormGroup;
  });

  // Resolve the company primary color from the data (template editor
  // dialog already passes the companyId; full branding lookup is a
  // PR2b concern). Falls back to the static palette.
  readonly primaryColor = input<string | null>(null);

  readonly palette = computed<ReadonlyArray<PaletteSwatch>>(() => {
    const primary = this.primaryColor();
    if (!primary) return PALETTE_FALLBACK;
    // Move primary to index 0 if it isn't already there.
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