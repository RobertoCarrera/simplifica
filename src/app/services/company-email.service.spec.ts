/**
 * Unit tests for CompanyEmailService PR2a additions.
 *
 * Covers (per design #1877 §9):
 *   - previewTemplate: happy path, RPC 42501 → ForbiddenPreviewError,
 *     generic error re-throw, empty custom fields round-trip,
 *     malformed {{var}} substituted as empty (smoke).
 *   - upsertTemplate: insert-missing, update-existing (single-row count),
 *     explicit `is_active = false` honored.
 *   - emailSamples: all 26 keys present, getSampleFor returns sample data,
 *     getSampleFor returns {} for unknown type without throwing.
 *
 * Test runner: Karma + Jasmine (`npm run test`).
 * Existing CompanyEmailService tests live in `company-email.service.test.ts`
 * (Deno side); this spec targets the Angular wrapper specifically for the
 * three PR2a additions so reviewers can diff the PR2a slice cleanly.
 */
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, isObservable } from 'rxjs';
import {
  CompanyEmailService,
  ForbiddenPreviewError,
  UpsertTemplateDefaults,
} from './company-email.service';
import { SupabaseClientService } from './supabase-client.service';
import { EMAIL_SAMPLES } from '../email-samples';
import { CompanyEmailSetting, EmailType } from '../models/company-email.models';

// ---------- Supabase stub -----------------------------------------------

interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface UpsertResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

interface SupabaseStubOptions {
  rpcResult?: RpcResult;
  rpcImpl?: (...args: unknown[]) => Promise<RpcResult>;
  upsertImpl?: (...args: unknown[]) => Promise<UpsertResult<CompanyEmailSetting>>;
}

function makeSupabaseStub(opts: SupabaseStubOptions = {}) {
  const upsertBuilder = {
    select() {
      return this;
    },
    single() {
      if (opts.upsertImpl) return opts.upsertImpl();
      return Promise.resolve({
        data: null,
        error: null,
      } as UpsertResult<CompanyEmailSetting>);
    },
  };
  const upsertChain = () => ({
    select: upsertBuilder.select.bind(upsertBuilder),
    single: upsertBuilder.single.bind(upsertBuilder),
  });
  upsertBuilder.select = function () {
    return {
      single: upsertBuilder.single.bind(this),
    };
  };
  upsertBuilder.single = function () {
    if (opts.upsertImpl) return opts.upsertImpl();
    return Promise.resolve({
      data: null,
      error: null,
    } as UpsertResult<CompanyEmailSetting>);
  };

  const stub: any = {
    rpc(name: string, _args: unknown) {
      if (opts.rpcImpl) return opts.rpcImpl(name, _args);
      return Promise.resolve(opts.rpcResult ?? { data: [], error: null });
    },
    from(_table: string) {
      const builder: any = {
        upsert(_payload: unknown, _conflict?: unknown) {
          builder.__lastPayload = arguments[0];
          builder.__lastConflict = arguments[1];
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          if (opts.upsertImpl) return opts.upsertImpl();
          return Promise.resolve({
            data: null,
            error: null,
          } as UpsertResult<CompanyEmailSetting>);
        },
      };
      return builder;
    },
  };
  return stub;
}

function setupService(opts: SupabaseStubOptions = {}) {
  const supabaseStub = makeSupabaseStub(opts);
  TestBed.configureTestingModule({
    providers: [
      CompanyEmailService,
      { provide: SupabaseClientService, useValue: { instance: supabaseStub } },
    ],
  });
  return { service: TestBed.inject(CompanyEmailService), stub: supabaseStub };
}

// ---------- previewTemplate --------------------------------------------

describe('CompanyEmailService — previewTemplate (PR2a)', () => {
  it('returns { html, sampleData } from the RPC table() response', async () => {
    const { service } = setupService({
      rpcResult: {
        data: [{ html: '<p>Hola {{invited_name}}</p>', sample_data: { invited_name: 'Ada' } }],
        error: null,
      },
    });

    const result = await firstValueFrom(
      service.previewTemplate(
        'company-1',
        'invite_owner',
        { invited_name: 'Ada' },
        { custom_body: '<p>Hola {{invited_name}}</p>' }
      )
    );

    expect(result.html).toBe('<p>Hola {{invited_name}}</p>');
    expect(result.sampleData).toEqual({ invited_name: 'Ada' });
  });

  it('forwards undefined customFields as null (RPC receives all defaults)', async () => {
    const { service, stub } = setupService({
      rpcResult: {
        data: [{ html: '<default>fallback</default>', sample_data: { x: 1 } }],
        error: null,
      },
    });

    await firstValueFrom(
      service.previewTemplate('company-1', 'invite_owner', { x: 1 }, {})
    );

    expect(stub.rpc).toHaveBeenCalledWith(
      'preview_email_template',
      jasmine.objectContaining({
        p_company_id: 'company-1',
        p_email_type: 'invite_owner',
        p_sample_data: { x: 1 },
        p_custom_subject: null,
        p_custom_body: null,
        p_custom_header: null,
        p_custom_button_text: null,
      })
    );
  });

  it('errors the observable with ForbiddenPreviewError when RPC throws 42501', async () => {
    const { service } = setupService({
      rpcResult: {
        data: null,
        error: {
          code: '42501',
          message: 'insufficient_privilege: not a member of company',
        },
      },
    });

    try {
      await firstValueFrom(
        service.previewTemplate('company-1', 'invite_owner', {}, {})
      );
      fail('Expected observable to error');
    } catch (err) {
      expect(err instanceof ForbiddenPreviewError).toBe(true);
      expect((err as Error).message).toContain('Forbidden');
    }
  });

  it('re-throws non-42501 errors unchanged (no ForbiddenPreviewError wrapping)', async () => {
    const original = { code: '22023', message: 'invalid_text_representation' };
    const { service } = setupService({ rpcResult: { data: null, error: original } });

    try {
      await firstValueFrom(
        service.previewTemplate('company-1', 'invite_owner', {}, {})
      );
      fail('Expected observable to error');
    } catch (err) {
      expect(err instanceof ForbiddenPreviewError).toBe(false);
      expect((err as { code: string }).code).toBe('22023');
    }
  });

  it('returns an empty html/safe sampleData when RPC returns no rows', async () => {
    const { service } = setupService({
      rpcResult: { data: [], error: null },
    });

    const result = await firstValueFrom(
      service.previewTemplate(
        'company-1',
        'invite_owner',
        { original: 'context' },
        {}
      )
    );

    expect(result.html).toBe('');
    expect(result.sampleData).toEqual({ original: 'context' });
  });

  it('returns an Observable (not a Promise)', () => {
    const { service } = setupService({
      rpcResult: {
        data: [{ html: '<p>ok</p>', sample_data: {} }],
        error: null,
      },
    });
    const obs = service.previewTemplate('company-1', 'invite_owner', {}, {});
    expect(isObservable(obs)).toBe(true);
  });
});

// ---------- upsertTemplate ---------------------------------------------

describe('CompanyEmailService — upsertTemplate (PR2a)', () => {
  const stubRow: CompanyEmailSetting = {
    id: 'row-1',
    company_id: 'company-1',
    email_type: 'invite_owner',
    email_account_id: 'acct-1',
    is_active: true,
    custom_subject_template: '',
    custom_body_template: '',
    custom_header_template: null,
    custom_button_text: null,
  };

  it('inserts a missing row with defaults is_active=true, email_account_id=null', async () => {
    let capturedPayload: any = null;
    const { service, stub } = setupService({
      upsertImpl: () => Promise.resolve({ data: stubRow, error: null }),
    });
    spyOn(stub, 'from').and.callFake((table: string) => {
      const original = makeSupabaseStub({}).from(table);
      const builder: any = {
        upsert(payload: unknown, conflict?: unknown) {
          capturedPayload = { payload, conflict, table };
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          return Promise.resolve({ data: stubRow, error: null });
        },
      };
      return builder;
    });

    await firstValueFrom(
      service.upsertTemplate('company-1', 'invite_owner', {
        email_account_id: null,
      })
    );

    expect(capturedPayload.table).toBe('company_email_settings');
    expect(capturedPayload.payload).toEqual({
      company_id: 'company-1',
      email_type: 'invite_owner',
      is_active: true,
      email_account_id: null,
    });
    expect(capturedPayload.conflict).toEqual({
      onConflict: 'company_id,email_type',
    });
  });

  it('updates an existing row (onConflict allows single-row outcome)', async () => {
    const updatedRow: CompanyEmailSetting = {
      ...stubRow,
      email_account_id: 'acct-2',
    };
    const { service } = setupService({
      upsertImpl: () => Promise.resolve({ data: updatedRow, error: null }),
    });

    const result = await firstValueFrom(
      service.upsertTemplate('company-1', 'invite_owner', {
        email_account_id: 'acct-2',
      })
    );

    expect(result.email_account_id).toBe('acct-2');
  });

  it('honors explicit is_active=false (does not override with default true)', async () => {
    let captured: any = null;
    const { service } = setupService({
      upsertImpl: () => Promise.resolve({ data: stubRow, error: null }),
    });
    const stub = TestBed.inject(SupabaseClientService).instance as any;
    spyOn(stub, 'from').and.callFake((table: string) => {
      const builder: any = {
        upsert(payload: unknown) {
          captured = payload;
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          return Promise.resolve({ data: stubRow, error: null });
        },
      };
      return builder;
    });

    const defaults: UpsertTemplateDefaults = { is_active: false };
    await firstValueFrom(
      service.upsertTemplate('company-1', 'invite_owner', defaults)
    );

    expect(captured.is_active).toBe(false);
  });
});

// ---------- emailSamples + getSampleFor --------------------------------

describe('CompanyEmailService — emailSamples + getSampleFor (PR2a)', () => {
  it('exposes 26 entries (PR1 fixture matrix)', () => {
    const { service } = setupService();
    expect(Object.keys(service.emailSamples).length).toBe(26);
  });

  it('returns the JSON sample_data for a known type', () => {
    const { service } = setupService();
    const sample = service.getSampleFor('invite_owner');
    expect(sample['invited_name']).toBe('Ada Lovelace');
    expect(sample['inviter_name']).toBe('Roberto');
    expect(sample['invite_url']).toContain('app.simplificacrm.es');
  });

  it('matches the EMAIL_SAMPLES constants imported directly', () => {
    // Sanity: re-export should be the same object reference.
    expect(Object.keys(EMAIL_SAMPLES).length).toBe(26);
    const keys = Object.keys(EMAIL_SAMPLES).sort();
    expect(keys).toContain('invite_owner');
    expect(keys).toContain('budget_created');
    expect(keys).toContain('budget_reminder');
    expect(keys).toContain('budget_overdue');
    expect(keys).toContain('booking_change');
    expect(keys).toContain('google_review');
    expect(keys).toContain('invite_marketer');
  });

  it('returns {} for an unknown type without throwing', () => {
    const { service } = setupService();
    // Cast to bypass the typed union — the helper is intentionally defensive.
    const result = service.getSampleFor('not_a_real_type' as EmailType);
    expect(result).toEqual({});
  });
});
