/**
 * Unit tests for the block-editor components (PR-wysiwyg email-block-editor).
 *
 * Covers:
 *   - BlockListComponent: cdkDropListDropped fires reorder (via moveItemInArray);
 *     expansion tracked by stable block id; duplicate / delete re-emit with
 *     the row index.
 *   - BlockRowComponent: visual HTML rendering via block-visual.ts;
 *     click-to-expand / Done-to-collapse; hover overlay controls emit.
 *   - AddBlockDropdownComponent: emits selected type, Logo disabled when !hasLogoUrl
 *   - BlockEditorHeaderComponent: routes heading/paragraph/button/logo to the
 *     matching typed editor; "(closeEditor)" fires on the "Listo" button.
 *   - HeadingBlockEditorComponent: validation (text maxlength, color regex,
 *     font_size range)
 *   - block-visual.ts: renderBlockToHtmlString emits the per-type HTML
 *     matching the SQL renderer (snapshot-style assertions on substrings).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  NonNullableFormBuilder,
  FormArray,
} from '@angular/forms';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
  BlockListComponent,
  BlockFormGroup,
} from './block-list.component';
import { BlockRowComponent } from './block-row.component';
import { AddBlockDropdownComponent } from './add-block-dropdown.component';
import { BlockEditorHeaderComponent } from './block-editor-header.component';
import { HeadingBlockEditorComponent } from './heading-block-editor.component';
import { ParagraphBlockEditorComponent } from './paragraph-block-editor.component';
import { ButtonBlockEditorComponent } from './button-block-editor.component';
import { LogoBlockEditorComponent } from './logo-block-editor.component';
import { renderBlockToHtmlString } from './block-visual';

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
    fixture.componentRef.setInput('primaryColor', null);
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
    // The row carries [data-block-id] so the host click-outside
    // listener can detect "outside-row" clicks.
    const rows = fixture.nativeElement.querySelectorAll('[data-block-id]');
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

  it('emits duplicate/delete outputs with the row index', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const a = makeBlockFormGroup(fb, 'heading');
    const { component, fixture } = setup([a]);
    const dups: number[] = [];
    const dels: number[] = [];
    component.duplicate.subscribe((i: number) => dups.push(i));
    component.delete.subscribe((i: number) => dels.push(i));
    const dupBtn = fixture.nativeElement.querySelector('[data-testid="block-row-duplicate"]') as HTMLButtonElement;
    const delBtn = fixture.nativeElement.querySelector('[data-testid="block-row-delete"]') as HTMLButtonElement;
    dupBtn.click();
    delBtn.click();
    expect(dups).toEqual([0]);
    expect(dels).toEqual([0]);
  });

  it('tracks expansion by stable id (survives reorder)', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const a = makeBlockFormGroup(fb, 'heading');
    const b = makeBlockFormGroup(fb, 'paragraph');
    const { component, fixture, formArray } = setup([a, b]);
    component.expandById(a.controls.id.value as string);
    fixture.detectChanges();
    expect(component.expandedBlockId()).toBe(a.controls.id.value as string);

    // Reorder so the "a" row moves to index 1.
    (formArray as FormArray<BlockFormGroup>).removeAt(0);
    (formArray as FormArray<BlockFormGroup>).push(a);
    expect(component.expandedBlockId()).toBe(a.controls.id.value as string);
  });

  it('expandById(null) collapses the active row', () => {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const a = makeBlockFormGroup(fb, 'heading');
    const { component } = setup([a]);
    component.expandById(a.controls.id.value as string);
    expect(component.expandedBlockId()).toBe(a.controls.id.value as string);
    component.expandById(null);
    expect(component.expandedBlockId()).toBeNull();
  });
});

// ---------- BlockRowComponent -----------------------------------------

describe('BlockRowComponent', () => {
  function setup(
    type: 'logo' | 'heading' | 'paragraph' | 'button',
    expanded = false,
  ) {
    const fb = TestBed.inject(NonNullableFormBuilder);
    const group = makeBlockFormGroup(fb, type);
    TestBed.configureTestingModule({
      imports: [
        CommonModule,
        BlockRowComponent,
        BlockEditorHeaderComponent,
        HeadingBlockEditorComponent,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockRowComponent);
    fixture.componentRef.setInput('formGroup', group);
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('expanded', expanded);
    fixture.componentRef.setInput('primaryColor', null);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, group };
  }

  it('renders the visual HTML via block-visual.ts (heading renders an <h1>)', () => {
    const { fixture, group } = setup('heading');
    group.controls.props.controls['text']!.setValue('Bienvenida');
    fixture.detectChanges();
    const visual = fixture.nativeElement.querySelector('[data-testid="block-row-visual"]') as HTMLElement;
    expect(visual).toBeTruthy();
    expect(visual.innerHTML).toContain('<h1');
    expect(visual.innerHTML).toContain('Bienvenida');
  });

  it('renders paragraph text inside a <p> tag', () => {
    const { fixture, group } = setup('paragraph');
    group.controls.props.controls['text']!.setValue('Cuerpo del email');
    fixture.detectChanges();
    const visual = fixture.nativeElement.querySelector('[data-testid="block-row-visual"]') as HTMLElement;
    expect(visual.innerHTML).toContain('<p');
    expect(visual.innerHTML).toContain('Cuerpo del email');
  });

  it('renders button block with primary background color', () => {
    const { fixture } = setup('button');
    const visual = fixture.nativeElement.querySelector('[data-testid="block-row-visual"]') as HTMLElement;
    expect(visual.innerHTML).toContain('background:#4f46e5');
    expect(visual.innerHTML).toContain('Click aquí');
  });

  it('does not render the editor when expanded=false', () => {
    const { fixture } = setup('heading', false);
    expect(fixture.nativeElement.querySelector('[data-testid="block-row-editor"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="block-row-visual"]')).toBeTruthy();
  });

  it('renders the inline editor when expanded=true', () => {
    const { fixture } = setup('heading', true);
    expect(fixture.nativeElement.querySelector('[data-testid="block-row-editor"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="block-row-visual"]')).toBeFalsy();
  });

  it('emits (expandedChange)=true on visual click', () => {
    const { component, fixture } = setup('heading', false);
    const emitted: boolean[] = [];
    component.expandedChange.subscribe((v: boolean) => emitted.push(v));
    const visualBtn = fixture.nativeElement.querySelector(
      '[data-testid="block-row-visual"]',
    ) as HTMLButtonElement;
    visualBtn.click();
    expect(emitted).toEqual([true]);
  });

  it('emits (expandedChange)=false via the editor Done button', () => {
    const { component, fixture } = setup('heading', true);
    const emitted: boolean[] = [];
    component.expandedChange.subscribe((v: boolean) => emitted.push(v));
    const doneBtn = fixture.nativeElement.querySelector(
      '[data-testid="block-editor-done"]',
    ) as HTMLButtonElement;
    doneBtn.click();
    expect(emitted).toEqual([false]);
  });

  it('emits (duplicateBlock) on the duplicate button click', () => {
    const { component, fixture } = setup('heading');
    let fired = false;
    component.duplicateBlock.subscribe(() => (fired = true));
    const dupBtn = fixture.nativeElement.querySelector(
      '[data-testid="block-row-duplicate"]',
    ) as HTMLButtonElement;
    dupBtn.click();
    expect(fired).toBe(true);
  });

  it('emits (deleteBlock) on the delete button click', () => {
    const { component, fixture } = setup('heading');
    let fired = false;
    component.deleteBlock.subscribe(() => (fired = true));
    const delBtn = fixture.nativeElement.querySelector(
      '[data-testid="block-row-delete"]',
    ) as HTMLButtonElement;
    delBtn.click();
    expect(fired).toBe(true);
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
        ParagraphBlockEditorComponent,
        ButtonBlockEditorComponent,
        LogoBlockEditorComponent,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BlockEditorHeaderComponent);
    fixture.componentRef.setInput('formGroup', group);
    fixture.componentRef.setInput('primaryColor', null);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('renders the type label and the "Listo" Done button in the toolbar', () => {
    const { fixture } = setup('heading');
    expect(fixture.nativeElement.querySelector('[data-testid="block-editor-toolbar"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="block-editor-done"]')).toBeTruthy();
  });

  it('routes heading type to HeadingBlockEditor', () => {
    const { fixture } = setup('heading');
    expect(fixture.nativeElement.querySelector('[data-testid="heading-block-editor"]')).toBeTruthy();
  });

  it('routes paragraph type to ParagraphBlockEditor', () => {
    const { fixture } = setup('paragraph');
    expect(fixture.nativeElement.querySelector('[data-testid="paragraph-block-editor"]')).toBeTruthy();
  });

  it('routes button type to ButtonBlockEditor', () => {
    const { fixture } = setup('button');
    expect(fixture.nativeElement.querySelector('[data-testid="button-block-editor"]')).toBeTruthy();
  });

  it('routes logo type to LogoBlockEditor', () => {
    const { fixture } = setup('logo');
    expect(fixture.nativeElement.querySelector('[data-testid="logo-block-editor"]')).toBeTruthy();
  });

  it('emits (closeEditor) when the Done button is clicked', () => {
    const { component, fixture } = setup('heading');
    let fired = false;
    component.closeEditor.subscribe(() => (fired = true));
    (fixture.nativeElement.querySelector('[data-testid="block-editor-done"]') as HTMLButtonElement).click();
    expect(fired).toBe(true);
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

// ---------- block-visual.ts renderers ---------------------------------

describe('block-visual.ts renderers', () => {
  it('renderBlockHeading emits an <h1> with the typed text and color', () => {
    const html = renderBlockToHtmlString({
      id: 'i', type: 'heading', version: 1,
      props: { text: 'Hola', color: '#4f46e5', align: 'center', level: 1, font_size: 28 },
    } as never);
    expect(html).toContain('<h1');
    expect(html).toContain('Hola');
    expect(html).toContain('#4f46e5');
  });

  it('renderBlockParagraph escapes text-injection attempts (OWASP)', () => {
    const html = renderBlockToHtmlString({
      id: 'i', type: 'paragraph', version: 1,
      props: { text: '<script>alert(1)</script>', color: '#374151', font_size: 16 },
    } as never);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renderBlockButton falls back to <span> for unsafe literal URLs', () => {
    const html = renderBlockToHtmlString({
      id: 'i', type: 'button', version: 1,
      props: {
        text: 'Click',
        url: 'javascript:alert(1)',
        background_color: '#4f46e5',
        text_color: '#FFFFFF',
        padding: 12,
        border_radius: 6,
        align: 'center',
      },
    } as never);
    expect(html).not.toContain('<a href="javascript:');
    expect(html).toContain('<span');
  });

  it('renderBlockButton emits an <a> for safe https URLs', () => {
    const html = renderBlockToHtmlString({
      id: 'i', type: 'button', version: 1,
      props: {
        text: 'Ir',
        url: 'https://app.example.com/cta',
        background_color: '#4f46e5',
        text_color: '#FFFFFF',
        padding: 12,
        border_radius: 6,
        align: 'center',
      },
    } as never);
    expect(html).toContain('<a href="https://app.example.com/cta"');
  });

  it('renderBlockButton emits an <a> for {{var}} placeholder URLs (deferred validation)', () => {
    const html = renderBlockToHtmlString({
      id: 'i', type: 'button', version: 1,
      props: {
        text: 'Ir',
        url: '{{cta_url}}',
        background_color: '#4f46e5',
        text_color: '#FFFFFF',
        padding: 12,
        border_radius: 6,
        align: 'center',
      },
    } as never);
    expect(html).toContain('<a href="{{cta_url}}"');
  });

  it('returns empty string for unknown block types (forward-compat)', () => {
    const html = renderBlockToHtmlString({
      id: 'i', type: 'unknown_type', version: 1,
      props: {},
    } as never);
    expect(html).toBe('');
  });
});
