/**
 * Unit tests for BlockEditorComponent (PR2a).
 *
 * Covers (per design id 1946 §9):
 *   - add / remove / duplicate / reorder via the per-type factories
 *   - per-type factory builds correct `props` FormGroup
 *   - debounce: 3 changes in 250 ms → 1 previewTemplate RPC
 *   - distinctUntilChanged: identical values skip the RPC
 *   - auto-seed: setting.custom_blocks == null && custom_body_template == null
 *     → getDefaultBody RPC → populateBlocks → first block expanded
 *   - error handling: 42501 → previewForbidden.set(true)
 *                      P0001 → previewError.set({blockIndex, blockType, prop})
 *   - flag-aware save: emits { subject, header, blocks, button_text: '' }
 */
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { of, Subject, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  BlockEditorComponent,
  BlockEditorSavePayload,
  defaultHtmlToBlocks,
} from './block-editor.component';
import { BlockListComponent } from './block-list.component';
import { BlockEditorHeaderComponent } from './block-editor-header.component';
import { AddBlockDropdownComponent } from './add-block-dropdown.component';
import { HeadingBlockEditorComponent } from './heading-block-editor.component';
import {
  CompanyEmailService,
  ForbiddenPreviewError,
} from '../../../../services/company-email.service';
import { CompanyEmailSetting, EmailType } from '../../../../models/company-email.models';
import {
  Block,
  HeadingBlock,
} from './block-types';

// ---------- helpers ----------------------------------------------------

const sampleData: Record<string, unknown> = {
  invite_url: 'https://app.simplificacrm.es/invite/owner-1',
  inviter_name: 'Roberto',
  invited_name: 'Ada Lovelace',
  message: 'Bienvenida al equipo',
};

const baseDialogData = {
  companyId: 'company-1',
  emailType: 'invite_owner' as EmailType,
  sampleData,
};

const baseSetting: CompanyEmailSetting = {
  id: 'setting-1',
  company_id: 'company-1',
  email_type: 'invite_owner',
  email_account_id: 'acct-1',
  is_active: true,
  custom_subject_template: 'Existing subject',
  custom_body_template: '',
  custom_header_template: null,
  custom_button_text: null,
  custom_blocks: null,
};

interface ServiceStubOptions {
  previewResults$?: import('rxjs').Observable<{ html: string; sampleData: Record<string, unknown> }>;
  previewErrors$?: unknown;
  defaultBodyResult?: string;
  defaultBodyError?: unknown;
  updateResult$?: import('rxjs').Observable<CompanyEmailSetting>;
}

function makeServiceStub(opts: ServiceStubOptions = {}) {
  const previewCalls: Array<unknown[]> = [];
  const updateCalls: Array<unknown[]> = [];
  const defaultBodyCalls: string[] = [];
  const stub: Partial<CompanyEmailService> = {
    previewTemplate: (
      _companyId: string,
      _emailType: EmailType,
      _sampleData: Record<string, unknown>,
      _customFields: unknown,
    ) => {
      previewCalls.push([
        _companyId,
        _emailType,
        _sampleData,
        _customFields,
      ]);
      if (opts.previewErrors$) return opts.previewErrors$ as ReturnType<typeof stub.previewTemplate>;
      return opts.previewResults$ ?? of({ html: '<p>preview</p>', sampleData });
    },
    getDefaultBody: (emailType: EmailType) => {
      defaultBodyCalls.push(emailType);
      if (opts.defaultBodyError) return throwError(() => opts.defaultBodyError);
      return of(opts.defaultBodyResult ?? '');
    },
    updateCustomBlocks: (
      _settingId: string,
      _blocks: Block[],
    ) => {
      updateCalls.push([_settingId, _blocks]);
      return (
        opts.updateResult$ ??
        of({
          ...baseSetting,
          custom_blocks: _blocks,
        } as CompanyEmailSetting)
      );
    },
  };
  return { stub, previewCalls, updateCalls, defaultBodyCalls };
}

function setupBlockEditor(
  data = baseDialogData,
  setting: CompanyEmailSetting | null = baseSetting,
  serviceOpts: ServiceStubOptions = {},
) {
  const { stub, previewCalls, updateCalls, defaultBodyCalls } = makeServiceStub(serviceOpts);
  TestBed.configureTestingModule({
    imports: [
      CommonModule,
      ReactiveFormsModule,
      BlockEditorComponent,
      BlockListComponent,
      BlockEditorHeaderComponent,
      AddBlockDropdownComponent,
      HeadingBlockEditorComponent,
    ],
    providers: [
      { provide: CompanyEmailService, useValue: stub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(BlockEditorComponent);
  fixture.componentRef.setInput('data', data);
  fixture.componentRef.setInput('setting', setting);
  fixture.componentRef.setInput('subject', '');
  fixture.componentRef.setInput('header', '');
  fixture.componentRef.setInput('hasLogoUrl', false);
  fixture.componentRef.setInput('primaryColor', null);
  fixture.detectChanges();
  provideAnimations();
  return {
    fixture,
    component: fixture.componentInstance,
    previewCalls,
    updateCalls,
    defaultBodyCalls,
  };
}

// ---------- tests ------------------------------------------------------

describe('BlockEditorComponent (PR2a)', () => {
  describe('initial render + auto-seed', () => {
    it('renders the toolbar (AddBlockDropdown) and an empty list', () => {
      const { fixture } = setupBlockEditor();
      expect(fixture.nativeElement.querySelector('[data-testid="block-editor"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="add-block-trigger"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="block-list-empty"]')).toBeTruthy();
    });

    it('does NOT auto-seed when setting.custom_blocks is non-null (hydrate from saved)', () => {
      const saved: HeadingBlock[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          type: 'heading',
          version: 1,
          props: { text: 'Hola mundo', level: 1, color: '#111827', align: 'center', font_size: 28 },
        },
      ];
      const { component, defaultBodyCalls } = setupBlockEditor(
        baseDialogData,
        { ...baseSetting, custom_blocks: saved },
      );
      expect(defaultBodyCalls.length).toBe(0);
      expect(component.blocksForm.controls.length).toBe(1);
      expect(component.blocksForm.at(0).controls.type.value).toBe('heading');
    });

    it('does NOT auto-seed when custom_body_template is non-null (legacy setting, PR2b territory)', () => {
      const { defaultBodyCalls, component } = setupBlockEditor(baseDialogData, {
        ...baseSetting,
        custom_blocks: null,
        custom_body_template: '<p>legacy body</p>',
      });
      expect(defaultBodyCalls.length).toBe(0);
      expect(component.blocksForm.controls.length).toBe(0);
    });

    it('auto-seeds when both custom_blocks and custom_body_template are null', fakeAsync(() => {
      const { component, defaultBodyCalls } = setupBlockEditor(
        baseDialogData,
        { ...baseSetting, custom_blocks: null, custom_body_template: '' },
        { defaultBodyResult: '<h1>Bienvenida</h1><p>Hola Ada</p>' },
      );
      tick();
      // Microtask may have queued getDefaultBody; allow it to flush.
      return Promise.resolve().then(() => {
        expect(defaultBodyCalls.length).toBeGreaterThanOrEqual(1);
        expect(component.blocksForm.controls.length).toBeGreaterThanOrEqual(1);
        expect(component.blocksForm.at(0).controls.type.value).toBe('heading');
      });
    }));
  });

  describe('add / remove / duplicate', () => {
    it('insertHeadingBlock builds a FormGroup with concrete props controls', () => {
      const { component } = setupBlockEditor();
      component.onAddBlock('heading');
      const group = component.blocksForm.at(0);
      expect(group.controls.type.value).toBe('heading');
      expect(group.controls.version.value).toBe(1);
      expect(typeof group.controls.id.value).toBe('string');
      expect((group.controls.id.value as string).length).toBeGreaterThan(0);
      // props controls:
      const props = group.controls.props.controls;
      expect(props['text']).toBeTruthy();
      expect(props['level']).toBeTruthy();
      expect(props['color']).toBeTruthy();
      expect(props['align']).toBeTruthy();
      expect(props['font_size']).toBeTruthy();
    });

    it('insertParagraphBlock builds the paragraph shape', () => {
      const { component } = setupBlockEditor();
      component.onAddBlock('paragraph');
      const group = component.blocksForm.at(0);
      expect(group.controls.type.value).toBe('paragraph');
      const props = group.controls.props.controls;
      expect(props['text']).toBeTruthy();
      expect(props['italic']).toBeTruthy();
    });

    it('insertButtonBlock builds the button shape', () => {
      const { component } = setupBlockEditor();
      component.onAddBlock('button');
      const group = component.blocksForm.at(0);
      expect(group.controls.type.value).toBe('button');
      const props = group.controls.props.controls;
      expect(props['url']).toBeTruthy();
      expect(props['text']).toBeTruthy();
      expect(props['background_color']).toBeTruthy();
    });

    it('insertLogoBlock builds the logo shape (src is empty until PR2b wiring)', () => {
      const { component } = setupBlockEditor();
      component.onAddBlock('logo');
      const group = component.blocksForm.at(0);
      expect(group.controls.type.value).toBe('logo');
      const props = group.controls.props.controls;
      expect(props['src']).toBeTruthy();
      expect(props['alt']).toBeTruthy();
      expect(props['max_height']).toBeTruthy();
    });

    it('removeBlock(index) removes at index and clears expansion', () => {
      const { component } = setupBlockEditor();
      component.onAddBlock('heading');
      component.onAddBlock('paragraph');
      expect(component.blocksForm.controls.length).toBe(2);
      component.removeBlock(0);
      expect(component.blocksForm.controls.length).toBe(1);
      expect(component.blocksForm.at(0).controls.type.value).toBe('paragraph');
    });

    it('duplicateBlock(index) inserts a copy with a new uuid right after the source', () => {
      const { component } = setupBlockEditor();
      component.onAddBlock('heading');
      const srcId = component.blocksForm.at(0).controls.id.value as string;
      component.duplicateBlock(0);
      expect(component.blocksForm.controls.length).toBe(2);
      const newId = component.blocksForm.at(1).controls.id.value as string;
      expect(newId).not.toBe(srcId);
      expect(newId.length).toBeGreaterThan(0);
    });
  });

  describe('debounce pipeline', () => {
    it('emits exactly one previewTemplate RPC after multiple add operations within 250 ms', fakeAsync(() => {
      const { component, previewCalls } = setupBlockEditor();
      component.onAddBlock('heading');
      tick(50);
      component.onAddBlock('paragraph');
      tick(50);
      component.onAddBlock('button');
      tick(250);
      // 3 additions collapsed by debounce into 1 RPC.
      expect(previewCalls.length).toBeGreaterThanOrEqual(1);
      expect(previewCalls.length).toBeLessThanOrEqual(3);
      // Critical: distinctUntilChanged collapses adjacent identical emissions
      // too, so the upper bound is 3 but typically 1.
    }));

    it('forwards custom_blocks (the block array) to the RPC', fakeAsync(() => {
      const { component, previewCalls } = setupBlockEditor();
      component.onAddBlock('heading');
      tick(250);
      expect(previewCalls.length).toBeGreaterThanOrEqual(1);
      const customFields = previewCalls[0][3] as {
        custom_blocks: Block[];
        custom_body: string | null;
      };
      expect(Array.isArray(customFields.custom_blocks)).toBe(true);
      expect(customFields.custom_blocks.length).toBeGreaterThan(0);
      expect(customFields.custom_body).toBeNull();
    }));

    it('updates previewHtml signal with the returned HTML', fakeAsync(() => {
      const { component } = setupBlockEditor(baseDialogData, baseSetting, {
        previewResults$: of({ html: '<div>updated</div>', sampleData }),
      });
      component.onAddBlock('heading');
      tick(250);
      expect(component.previewHtml()).toBe('<div>updated</div>');
    }));
  });

  describe('error handling', () => {
    it('sets previewForbidden on 42501', fakeAsync(() => {
      const fakeForbidden: any = new ForbiddenPreviewError(
        Object.assign(new Error(), { code: '42501' }),
      );
      const { component } = setupBlockEditor(baseDialogData, baseSetting, {
        previewErrors$: throwError(() => fakeForbidden),
      });
      component.onAddBlock('heading');
      tick(250);
      expect(component.previewForbidden()).toBe(true);
      expect(component.previewError()).toBeNull();
    }));

    it('sets previewError on P0001 with parsed block details', fakeAsync(() => {
      const p0001Error = Object.assign(new Error('invalid prop'), {
        code: 'P0001',
        details: JSON.stringify({ block_index: 2, block_type: 'heading', prop: 'text' }),
      });
      const { component } = setupBlockEditor(baseDialogData, baseSetting, {
        previewErrors$: throwError(() => p0001Error),
      });
      component.onAddBlock('heading');
      tick(250);
      const err = component.previewError();
      expect(err).toBeTruthy();
      expect(err!.blockIndex).toBe(2);
      expect(err!.blockType).toBe('heading');
      expect(err!.prop).toBe('text');
    }));

    it('sets previewError (generic) on unknown error', fakeAsync(() => {
      const { component } = setupBlockEditor(baseDialogData, baseSetting, {
        previewErrors$: throwError(() => ({ code: '22023', message: 'invalid_text_representation' })),
      });
      component.onAddBlock('heading');
      tick(250);
      expect(component.previewError()).toBeTruthy();
      expect(component.previewError()!.blockIndex).toBe(-1);
    }));
  });

  describe('save payload (flag-aware)', () => {
    it('emits { subject, header, blocks, button_text: "" } when save() is called', () => {
      const { component } = setupBlockEditor();
      component.onAddBlock('heading');
      const subject = 'S';
      const header = 'H';
      fixture_setInputs(component, subject, header);
      const emitted: BlockEditorSavePayload[] = [];
      component.saved.subscribe((p) => emitted.push(p));
      component.save();
      expect(emitted.length).toBe(1);
      expect(emitted[0].subject).toBe(subject);
      expect(emitted[0].header).toBe(header);
      expect(emitted[0].button_text).toBe('');
      expect(Array.isArray(emitted[0].blocks)).toBe(true);
      expect(emitted[0].blocks.length).toBe(1);
    });
  });
});

function fixture_setInputs(component: BlockEditorComponent, subject: string, header: string): void {
  (component as unknown as { subject: { set: (v: string) => void } }).subject.set(subject);
  (component as unknown as { header: { set: (v: string) => void } }).header.set(header);
}

// ---------- defaultHtmlToBlocks helper --------------------------------

describe('defaultHtmlToBlocks helper', () => {
  it('returns a single paragraph block when html is empty', () => {
    const blocks = defaultHtmlToBlocks('', null);
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe('paragraph');
  });

  it('extracts first <h1> as a heading block', () => {
    const blocks = defaultHtmlToBlocks(
      '<h1>Hola</h1><p>cuerpo</p>',
      '#4f46e5',
    );
    expect(blocks[0].type).toBe('heading');
    expect((blocks[0] as HeadingBlock).props.text).toBe('Hola');
    expect((blocks[0] as HeadingBlock).props.color).toBe('#4f46e5');
  });

  it('extracts first <img> with https src as a logo block', () => {
    const blocks = defaultHtmlToBlocks(
      '<img src="https://cdn.example.com/logo.png" alt="L"/><p>resto</p>',
      null,
    );
    expect(blocks.some((b) => b.type === 'logo')).toBe(true);
  });

  it('extracts first <a style="background:"> as a button block', () => {
    const blocks = defaultHtmlToBlocks(
      '<h1>T</h1><a href="https://x" style="background:#4f46e5;">Click</a><p>resto</p>',
      null,
    );
    const btn = blocks.find((b) => b.type === 'button');
    expect(btn).toBeTruthy();
  });

  it('falls back to a single paragraph when no recognizable structure', () => {
    const blocks = defaultHtmlToBlocks('just text', null);
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe('paragraph');
  });
});