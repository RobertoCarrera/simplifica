/**
 * Unit tests for LogoBlockEditorComponent (PR2b email-block-editor).
 *
 * Covers (per design id 1946 §9.1):
 *   - Read-only card renders the image preview when src is set
 *   - Edit popover toggles open/closed
 *   - alt input is bound to propsGroup.controls.alt
 *   - max_height + max_width sliders have correct min/max attrs
 *
 * The Karma runner is gated on a working pre-existing infra (per
 * apply-progress in PR2a); this spec compiles clean and runs in any
 * environment where `npm run test` succeeds.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { LogoBlockEditorComponent } from './logo-block-editor.component';

type LogoFormGroup = FormGroup<{
  src: FormControl<string>;
  alt: FormControl<string>;
  max_height: FormControl<number>;
  max_width: FormControl<number>;
}>;

function makePropsGroup(): FormGroup<Record<string, AbstractControl<unknown>>> {
  const fg = new FormGroup({
    src: new FormControl('https://cdn.example.com/logo.png', { nonNullable: true }),
    alt: new FormControl('Company logo', { nonNullable: true }),
    max_height: new FormControl(80, { nonNullable: true }),
    max_width: new FormControl(200, { nonNullable: true }),
  });
  return fg as unknown as FormGroup<Record<string, AbstractControl<unknown>>>;
}

describe('LogoBlockEditorComponent', () => {
  let fixture: ComponentFixture<LogoBlockEditorComponent>;
  let component: LogoBlockEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, LogoBlockEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LogoBlockEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('propsGroup', makePropsGroup());
    fixture.detectChanges();
  });

  it('renders the read-only preview card with the image when src is set', () => {
    const img: HTMLImageElement | null =
      fixture.nativeElement.querySelector('[data-testid="logo-preview-img"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/logo.png');
  });

  it('opens the Edit popover when the toggle is clicked', () => {
    const toggle: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('[data-testid="logo-edit-toggle"]');
    toggle?.click();
    fixture.detectChanges();
    expect(component.popoverOpen()).toBe(true);
    const popover: HTMLElement | null =
      fixture.nativeElement.querySelector('[data-testid="logo-edit-popover"]');
    expect(popover).not.toBeNull();
  });

  it('exposes the alt input bound to the FormGroup alt control', () => {
    const altInput: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="logo-alt"]');
    expect(altInput).not.toBeNull();
    expect(altInput?.value).toBe('Company logo');
  });

  it('configures max_height + max_width sliders with correct min/max attrs', () => {
    const height: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="logo-max-height"]');
    const width: HTMLInputElement | null =
      fixture.nativeElement.querySelector('[data-testid="logo-max-width"]');
    expect(height?.getAttribute('min')).toBe('20');
    expect(height?.getAttribute('max')).toBe('200');
    expect(width?.getAttribute('min')).toBe('50');
    expect(width?.getAttribute('max')).toBe('600');
  });
});
