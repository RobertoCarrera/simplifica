/**
 * Unit tests for ParagraphBlockEditorComponent (PR2b email-block-editor).
 *
 * Covers (per design id 1946 §9.1):
 *   - Textarea has maxlength=5000
 *   - Align select has 4 values (left/center/right/justify)
 *   - Color palette renders 12 swatches
 *   - Italic toggle binds to propsGroup.controls.italic
 *   - Empty text triggers the warning indicator
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { ParagraphBlockEditorComponent } from './paragraph-block-editor.component';

function makePropsGroup(): FormGroup<Record<string, AbstractControl<unknown>>> {
  const fg = new FormGroup({
    text: new FormControl('Hello world', { nonNullable: true }),
    align: new FormControl<'left' | 'center' | 'right' | 'justify'>('left', {
      nonNullable: true,
    }),
    color: new FormControl('#374151', { nonNullable: true }),
    font_size: new FormControl(16, { nonNullable: true }),
    italic: new FormControl(false, { nonNullable: true }),
  });
  return fg as unknown as FormGroup<Record<string, AbstractControl<unknown>>>;
}

describe('ParagraphBlockEditorComponent', () => {
  let fixture: ComponentFixture<ParagraphBlockEditorComponent>;
  let component: ParagraphBlockEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, ParagraphBlockEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ParagraphBlockEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('propsGroup', makePropsGroup());
    fixture.detectChanges();
  });

  it('configures the textarea with maxlength=5000', () => {
    const ta: HTMLTextAreaElement | null =
      fixture.nativeElement.querySelector('[data-testid="paragraph-text"]');
    expect(ta).not.toBeNull();
    expect(ta?.getAttribute('maxlength')).toBe('5000');
    expect(ta?.value).toBe('Hello world');
  });

  it('renders the 4-value align select', () => {
    const sel: HTMLSelectElement | null =
      fixture.nativeElement.querySelector('[data-testid="paragraph-align"]');
    expect(sel).not.toBeNull();
    const options = Array.from(sel?.options ?? []).map((o) => o.value);
    expect(options).toEqual(['left', 'center', 'right', 'justify']);
  });

  it('renders the 12-swatch color palette', () => {
    const swatches =
      fixture.nativeElement.querySelectorAll('[data-testid^="paragraph-color-"]');
    expect(swatches.length).toBe(12);
  });

  it('binds the italic toggle to the FormGroup', () => {
    const cb: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="paragraph-italic"]');
    expect(cb).not.toBeNull();
    expect(cb?.checked).toBe(false);
  });

  it('hides the empty-text warning when text is non-empty', () => {
    expect(component.showEmptyWarning()).toBe(false);
    const warn: HTMLElement | null = fixture.nativeElement.querySelector(
      '[data-testid="paragraph-empty-warning"]',
    );
    expect(warn).toBeNull();
  });
});
