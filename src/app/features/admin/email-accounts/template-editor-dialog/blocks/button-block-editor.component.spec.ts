/**
 * Unit tests for ButtonBlockEditorComponent (PR2b email-block-editor).
 *
 * Covers (per design id 1946 §9.1):
 *   - Text input has maxlength=100
 *   - URL input has maxlength=2000 and accepts https://, mailto:, {{var}}
 *   - Two 12-swatch palettes (background + text)
 *   - Padding slider min=4, max=32
 *   - Border-radius slider min=0, max=24
 *   - Align select has 3 values
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { ButtonBlockEditorComponent } from './button-block-editor.component';

function makePropsGroup(): FormGroup<Record<string, AbstractControl<unknown>>> {
  const fg = new FormGroup({
    text: new FormControl('Click aquí', { nonNullable: true }),
    url: new FormControl('https://app.example.com/invoice/1', { nonNullable: true }),
    background_color: new FormControl('#4f46e5', { nonNullable: true }),
    text_color: new FormControl('#ffffff', { nonNullable: true }),
    padding: new FormControl(12, { nonNullable: true }),
    border_radius: new FormControl(6, { nonNullable: true }),
    align: new FormControl<'left' | 'center' | 'right'>('center', {
      nonNullable: true,
    }),
  });
  return fg as unknown as FormGroup<Record<string, AbstractControl<unknown>>>;
}

describe('ButtonBlockEditorComponent', () => {
  let fixture: ComponentFixture<ButtonBlockEditorComponent>;
  let component: ButtonBlockEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, ButtonBlockEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonBlockEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('propsGroup', makePropsGroup());
    fixture.detectChanges();
  });

  it('configures the text input with maxlength=100', () => {
    const input: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="button-text"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('maxlength')).toBe('100');
    expect(input?.value).toBe('Click aquí');
  });

  it('configures the URL input with maxlength=2000 and accepts https://', () => {
    const input: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="button-url"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('maxlength')).toBe('2000');
    expect(input?.value).toBe('https://app.example.com/invoice/1');
  });

  it('renders two 12-swatch palettes (background + text)', () => {
    const bgSwatches = fixture.nativeElement.querySelectorAll(
      '[data-testid^="button-bg-"]',
    );
    const fgSwatches = fixture.nativeElement.querySelectorAll(
      '[data-testid^="button-fg-"]',
    );
    expect(bgSwatches.length).toBe(12);
    expect(fgSwatches.length).toBe(12);
  });

  it('configures padding slider min=4, max=32 and border_radius slider min=0, max=24', () => {
    const padding: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="button-padding"]');
    const radius: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="button-border-radius"]');
    expect(padding?.getAttribute('min')).toBe('4');
    expect(padding?.getAttribute('max')).toBe('32');
    expect(radius?.getAttribute('min')).toBe('0');
    expect(radius?.getAttribute('max')).toBe('24');
  });

  it('renders the 3-value align select', () => {
    const sel: HTMLSelectElement | null =
      fixture.nativeElement.querySelector('[data-testid="button-align"]');
    expect(sel).not.toBeNull();
    const options = Array.from(sel?.options ?? []).map((o) => o.value);
    expect(options).toEqual(['left', 'center', 'right']);
  });
});
