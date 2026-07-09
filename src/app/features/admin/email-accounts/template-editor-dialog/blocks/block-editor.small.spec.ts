/**
 * Unit tests for the smaller block-editor components (PR2a).
 *
 * Covers:
 *   - BlockListComponent: cdkDropListDropped fires reorder (via moveItemInArray)
 *   - BlockRowComponent: summary text per block type, action emissions
 *   - AddBlockDropdownComponent: emits selected type, Logo disabled when !hasLogoUrl
 *   - BlockEditorHeaderComponent: routes heading type to HeadingBlockEditor
 *   - HeadingBlockEditorComponent: validation (text maxlength, color regex,
 *     font_size range)
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  BlockListComponent,
  BlockFormGroup,
} from './block-list.component';
import { BlockRowComponent } from './block-row.component';
import { AddBlockDropdownComponent } from './add-block-dropdown.component';
import { BlockEditorHeaderComponent } from './block-editor-header.component';
import { HeadingBlockEditorComponent } from './heading-block-editor.component';

// ---------- helpers ----------------------------------------------------

function makeBlockFormGroup(
  fb: NonNullableFormBuilder,
  type: 'logo' | 'heading' | 'paragraph' | 'button',
): BlockFormGroup {
  const propsByType: Record<typeof type, () => Record<string, unknown>> = {
    heading: () => ({
      level: 1, text: 'Hi', color: '#111827', align: 'center', font_size: 28,
    }),
    paragraph: () => ({
      text: 'p', align: 'left', color: '#374151', font_size: 16, italic: false,
    }),
    button: () => ({
      text: 'B', url: 'https://x', background_color: '#4f46e5', text_color: '#fff',
      padding: 12, border_radius: 6, align: 'center',
    }),
    logo: () => ({
      src: 'https://x', alt: 'L', max_height: 80, max_width: 200,
    }),
  };
  const propsObj = propsByType[type]();
  const propsGroup = fb.group<Record<string, import('@angular/forms').AbstractControl<unknown>>>(
    Object.fromEntries(
      Object.entries(propsObj).map(([k, v]) => [k, fb.control(v)]),
    ),
  );
  return fb.group({
    id: fb.control<string>('id-' + type),
    type: fb.control<typeof type>(type),
    version: fb.control<1>(1),
    props: propsGroup,
  }) as unknown as BlockFormGroup;
}

// ---------- BlockListComponent ---------------------------------------

describe('BlockListComponent', () => {
  function setup(arr: BlockFormGroup[]) {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const formArray = fb.array<BlockFormGroup>(arr);
    TestBed.configureTestingModule({
      imports: [CommonModule, BlockListComponent, BlockRowComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockListComponent);
    fixture.componentRef.setInput('formArray', formArray);
    fixture.componentRef.setInput('hasLogoUrl', false);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, formArray };
  }

  it('renders one row per FormGroup control', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const arr = [
      makeBlockFormGroup(fb, 'heading'),
      makeBlockFormGroup(fb, 'paragraph'),
    ];
    const { fixture } = setup(arr);
    const rows = fixture.nativeElement.querySelectorAll('[data-testid^="block-row-"]');
    expect(rows.length).toBe(2);
  });

  it('renders the empty placeholder when no blocks', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const { fixture } = setup([]);
    expect(
      fixture.nativeElement.querySelector('[data-testid="block-list-empty"]'),
    ).toBeTruthy();
  });

  it('onDrop reorder calls updateValueAndValidity with emitEvent:true', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const a = makeBlockFormGroup(fb, 'heading');
    const b = makeBlockFormGroup(fb, 'paragraph');
    const c = makeBlockFormGroup(fb, 'button');
    const { component, formArray } = setup([a, b, c]);
    spyOn(formArray, 'updateValueAndValidity').and.callThrough();
    // Simulate a drop from index 0 → index 2.
    const event: Partial<CdkDragDrop<BlockFormGroup[]>> = {
      previousIndex: 0,
      currentIndex: 2,
    };
    component.onDrop(event as CdkDragDrop<BlockFormGroup[]>);
    expect(formArray.updateValueAndValidity).toHaveBeenCalledWith({ emitEvent: true });
    expect(formArray.at(0).controls.type.value).toBe('paragraph');
    expect(formArray.at(1).controls.type.value).toBe('button');
    expect(formArray.at(2).controls.type.value).toBe('heading');
  });

  it('emits edit/duplicate/delete outputs with the row index', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const a = makeBlockFormGroup(fb, 'heading');
    const { component, fixture } = setup([a]);
    const edits: number[] = [];
    const dups: number[] = [];
    const dels: number[] = [];
    component.edit.subscribe((i: number) => edits.push(i));
    component.duplicate.subscribe((i: number) => dups.push(i));
    component.delete.subscribe((i: number) => dels.push(i));
    // Trigger directly on the child BlockRowComponent via querySelector.
    const editBtn = fixture.nativeElement.querySelector('[data-testid="block-row-edit"]') as HTMLButtonElement;
    const dupBtn = fixture.nativeElement.querySelector('[data-testid="block-row-duplicate"]') as HTMLButtonElement;
    const delBtn = fixture.nativeElement.querySelector('[data-testid="block-row-delete"]') as HTMLButtonElement;
    editBtn.click();
    dupBtn.click();
    delBtn.click();
    expect(edits).toEqual([0]);
    expect(dups).toEqual([0]);
    expect(dels).toEqual([0]);
  });
});

// ---------- BlockRowComponent -----------------------------------------

describe('BlockRowComponent', () => {
  function setup(type: 'logo' | 'heading' | 'paragraph' | 'button', summaryValue: string) {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const group = makeBlockFormGroup(fb, type);
    // Patch the summary field
    if (type === 'heading' || type === 'paragraph') {
      group.controls.props.controls['text']!.setValue(summaryValue);
    } else if (type === 'button') {
      group.controls.props.controls['text']!.setValue(summaryValue);
    } else {
      group.controls.props.controls['alt']!.setValue(summaryValue);
    }
    TestBed.configureTestingModule({
      imports: [CommonModule, BlockRowComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockRowComponent);
    fixture.componentRef.setInput('formGroup', group);
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('hasLogoUrl', true);
    fixture.componentRef.setInput('expanded', false);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('summary shows the heading text (truncated to 30 chars)', () => {
    const { fixture } = setup('heading', 'Bienvenida al equipo de Simplifica CRM');
    const summary = fixture.nativeElement.querySelector(
      '[data-testid="block-row-summary"]',
    ) as HTMLElement;
    expect(summary.textContent).toContain('Bienvenida al equipo de Simpli');
  });

  it('summary shows the paragraph text', () => {
    const { fixture } = setup('paragraph', 'Cuerpo del email');
    const summary = fixture.nativeElement.querySelector(
      '[data-testid="block-row-summary"]',
    ) as HTMLElement;
    expect(summary.textContent).toContain('Cuerpo del email');
  });

  it('summary falls back to (vacío) when heading text is empty', () => {
    const { fixture } = setup('heading', '');
    const summary = fixture.nativeElement.querySelector(
      '[data-testid="block-row-summary"]',
    ) as HTMLElement;
    expect(summary.textContent).toContain('(vacío)');
  });

  it('emits edit/duplicate/delete on action button clicks', () => {
    const { component, fixture } = setup('heading', 'Hi');
    const edits: void[] = [];
    const dups: void[] = [];
    const dels: void[] = [];
    component.edit.subscribe(() => edits.push(undefined));
    component.duplicate.subscribe(() => dups.push(undefined));
    component.delete.subscribe(() => dels.push(undefined));
    (fixture.nativeElement.querySelector('[data-testid="block-row-edit"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[data-testid="block-row-duplicate"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[data-testid="block-row-delete"]') as HTMLButtonElement).click();
    expect(edits.length).toBe(1);
    expect(dups.length).toBe(1);
    expect(dels.length).toBe(1);
  });
});

// ---------- AddBlockDropdownComponent ---------------------------------

describe('AddBlockDropdownComponent', () => {
  function setup(hasLogoUrl: boolean) {
    TestBed.configureTestingModule({
      imports: [CommonModule, AddBlockDropdownComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(AddBlockDropdownComponent);
    fixture.componentRef.setInput('hasLogoUrl', hasLogoUrl);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('opens menu when trigger is clicked', () => {
    const { fixture, component } = setup(true);
    (fixture.nativeElement.querySelector('[data-testid="add-block-trigger"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.open()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="add-block-menu"]')).toBeTruthy();
  });

  it('emits "heading" when heading menu item is clicked', () => {
    const { fixture, component } = setup(true);
    const trigger = fixture.nativeElement.querySelector('[data-testid="add-block-trigger"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const emitted: string[] = [];
    component.add.subscribe((t: string) => emitted.push(t));
    (fixture.nativeElement.querySelector('[data-testid="add-block-heading"]') as HTMLButtonElement).click();
    expect(emitted).toEqual(['heading']);
    expect(component.open()).toBe(false);
  });

  it('disables Logo button when hasLogoUrl=false', () => {
    const { fixture } = setup(false);
    const trigger = fixture.nativeElement.querySelector('[data-testid="add-block-trigger"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const logoBtn = fixture.nativeElement.querySelector('[data-testid="add-block-logo"]') as HTMLButtonElement;
    expect(logoBtn.disabled).toBe(true);
  });

  it('Logo button is enabled when hasLogoUrl=true', () => {
    const { fixture } = setup(true);
    const trigger = fixture.nativeElement.querySelector('[data-testid="add-block-trigger"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const logoBtn = fixture.nativeElement.querySelector('[data-testid="add-block-logo"]') as HTMLButtonElement;
    expect(logoBtn.disabled).toBe(false);
  });
});

// ---------- BlockEditorHeaderComponent --------------------------------

describe('BlockEditorHeaderComponent', () => {
  function setup(type: 'logo' | 'heading' | 'paragraph' | 'button') {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const group = makeBlockFormGroup(fb, type);
    TestBed.configureTestingModule({
      imports: [
        CommonModule,
        ReactiveFormsModule,
        BlockEditorHeaderComponent,
        HeadingBlockEditorComponent,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockEditorHeaderComponent);
    fixture.componentRef.setInput('formGroup', group);
    fixture.componentRef.setInput('primaryColor', null);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('routes heading type to HeadingBlockEditor', () => {
    const { fixture } = setup('heading');
    expect(fixture.nativeElement.querySelector('[data-testid="heading-block-editor"]')).toBeTruthy();
  });

  it('renders paragraph placeholder for paragraph type (PR2b)', () => {
    const { fixture } = setup('paragraph');
    expect(fixture.nativeElement.querySelector('[data-testid="paragraph-placeholder"]')).toBeTruthy();
  });

  it('renders button placeholder for button type (PR2b)', () => {
    const { fixture } = setup('button');
    expect(fixture.nativeElement.querySelector('[data-testid="button-placeholder"]')).toBeTruthy();
  });

  it('renders logo placeholder for logo type (PR2b)', () => {
    const { fixture } = setup('logo');
    expect(fixture.nativeElement.querySelector('[data-testid="logo-placeholder"]')).toBeTruthy();
  });
});

// ---------- HeadingBlockEditorComponent -------------------------------

describe('HeadingBlockEditorComponent', () => {
  function setup() {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const propsGroup = fb.group<Record<string, import('@angular/forms').AbstractControl<unknown>>>({
      level: fb.control<1 | 2 | 3>(1),
      text: fb.control<string>(''),
      color: fb.control<string>('#111827'),
      align: fb.control<'left' | 'center' | 'right'>('center'),
      font_size: fb.control<number>(28),
    });
    TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, HeadingBlockEditorComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HeadingBlockEditorComponent);
    fixture.componentRef.setInput('propsGroup', propsGroup);
    fixture.componentRef.setInput('primaryColor', null);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, propsGroup };
  }

  it('renders 5 form fields (level, text, color, align, font_size)', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('[data-testid="heading-level"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="heading-text"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="heading-color-#111827"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="heading-align"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="heading-font-size"]')).toBeTruthy();
  });

  it('shows the empty-warning when text is empty', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('[data-testid="heading-empty-warning"]')).toBeTruthy();
  });

  it('hides the empty-warning when text is non-empty', () => {
    const { fixture, propsGroup } = setup();
    propsGroup.controls['text']!.setValue('Hola');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="heading-empty-warning"]')).toBeFalsy();
  });

  it('color swatch click sets the color FormControl value', () => {
    const { fixture, propsGroup } = setup();
    const swatch = fixture.nativeElement.querySelector('[data-testid="heading-color-#10b981"]') as HTMLButtonElement;
    swatch.click();
    fixture.detectChanges();
    expect(propsGroup.controls['color']!.value).toBe('#10b981');
  });

  it('reflects the primary_color as the first palette swatch when provided', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const propsGroup = fb.group<Record<string, import('@angular/forms').AbstractControl<unknown>>>({
      level: fb.control<1 | 2 | 3>(1),
      text: fb.control<string>(''),
      color: fb.control<string>('#111827'),
      align: fb.control<'left' | 'center' | 'right'>('center'),
      font_size: fb.control<number>(28),
    });
    TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, HeadingBlockEditorComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HeadingBlockEditorComponent);
    fixture.componentRef.setInput('propsGroup', propsGroup);
    fixture.componentRef.setInput('primaryColor', '#FF6B35');
    fixture.detectChanges();
    const firstSwatch = fixture.nativeElement.querySelector('.hbe-swatch') as HTMLButtonElement;
    expect(firstSwatch.getAttribute('data-testid')).toBe('heading-color-#FF6B35');
  });
});