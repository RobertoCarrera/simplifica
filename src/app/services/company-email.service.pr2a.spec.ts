/**
 * Unit tests for CompanyEmailService PR2a additions.
 *
 * Covers:
 *   - getDefaultBody: RPC call to default_email_body(text), returns string
 *   - updateCustomBlocks: upserts custom_blocks JSONB, returns updated row
 *   - previewTemplate: forwards custom_blocks to RPC, P0001 surfaces
 */
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, isObservable } from 'rxjs';
import { CompanyEmailService } from './company-email.service';
import { SupabaseClientService } from './supabase-client.service';

interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface UpdateResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

function makeSupabaseStub(opts: {
  rpcResult?: RpcResult;
  rpcImpl?: (...args: unknown[]) => Promise<RpcResult>;
  updateImpl?: (...args: unknown[]) => Promise<UpdateResult<unknown>>;
} = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const stub: any = {
    rpc(name: string, _args: unknown) {
      calls.push({ method: `rpc:${name}`, args: [_args] });
      if (opts.rpcImpl) return opts.rpcImpl(name, _args);
      return Promise.resolve(opts.rpcResult ?? { data: '', error: null });
    },
    from(_table: string) {
      const builder: any = {
        update(payload: unknown) {
          calls.push({ method: 'update', args: [payload] });
          builder.__lastPayload = payload;
          return builder;
        },
        eq(_column: string, _value: unknown) {
          builder.__lastEq = { column: _column, value: _value };
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          if (opts.updateImpl) return opts.updateImpl();
          return Promise.resolve({
            data: null,
            error: null,
          } as UpdateResult<unknown>);
        },
      };
      return builder;
    },
  };
  return { stub, calls };
}

function setupService(opts: Parameters<typeof makeSupabaseStub>[0] = {}) {
  const { stub, calls } = makeSupabaseStub(opts);
  TestBed.configureTestingModule({
    providers: [
      CompanyEmailService,
      { provide: SupabaseClientService, useValue: { instance: stub } },
    ],
  });
  return { service: TestBed.inject(CompanyEmailService), stub, calls };
}

describe('CompanyEmailService — PR2a additions', () => {
  // ---------- getDefaultBody ----------
  describe('getDefaultBody', () => {
    it('calls default_email_body RPC with p_email_type and returns the string', async () => {
      const { service, calls } = setupService({
        rpcResult: { data: '<h1>Hola</h1>', error: null },
      });

      const html = await firstValueFrom(service.getDefaultBody('booking_confirmation'));

      expect(html).toBe('<h1>Hola</h1>');
      const rpcCall = calls.find((c) => c.method === 'rpc:default_email_body');
      expect(rpcCall).toBeTruthy();
      expect(rpcCall?.args[0]).toEqual({ p_email_type: 'booking_confirmation' });
    });

    it('returns empty string when RPC returns null', async () => {
      const { service } = setupService({
        rpcResult: { data: null, error: null },
      });
      const html = await firstValueFrom(service.getDefaultBody('invoice'));
      expect(html).toBe('');
    });

    it('throws when RPC returns an error', async () => {
      const { service } = setupService({
        rpcResult: { data: null, error: { code: '22023', message: 'invalid_text_representation' } },
      });
      try {
        await firstValueFrom(service.getDefaultBody('consent'));
        fail('expected observable to error');
      } catch (err) {
        expect((err as { code: string }).code).toBe('22023');
      }
    });

    it('returns an Observable (not a Promise)', () => {
      const { service } = setupService({
        rpcResult: { data: '<p>x</p>', error: null },
      });
      const obs = service.getDefaultBody('welcome');
      expect(isObservable(obs)).toBe(true);
    });
  });

  // ---------- updateCustomBlocks ----------
  describe('updateCustomBlocks', () => {
    const blocks = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'heading',
        version: 1,
        props: { text: 'Hola', level: 1, color: '#111827', align: 'center', font_size: 28 },
      },
    ];

    it('calls update with custom_blocks + updated_at and returns the updated row', async () => {
      const updatedRow = {
        id: 'setting-1',
        company_id: 'company-1',
        email_type: 'invite_owner',
        email_account_id: 'acct-1',
        is_active: true,
        custom_subject_template: '',
        custom_body_template: '',
        custom_header_template: null,
        custom_button_text: null,
        custom_blocks: blocks,
      };
      const { service, stub } = setupService({
        updateImpl: () => Promise.resolve({ data: updatedRow, error: null }),
      });
      spyOn(stub, 'from').and.callFake((table: string) => {
        const b: any = {
          update(payload: unknown) {
            (b as { __payload?: unknown }).__payload = payload;
            return b;
          },
          eq(_col: string, val: unknown) {
            (b as { __eq?: unknown }).__eq = { column: _col, value: val };
            return b;
          },
          select() {
            return b;
          },
          single() {
            return Promise.resolve({ data: updatedRow, error: null });
          },
        };
        return b;
      });

      const result = await firstValueFrom(
        service.updateCustomBlocks('setting-1', blocks as never),
      );
      expect(result.custom_blocks).toEqual(blocks);
      const b = stub.from.calls.mostRecent().returnValue as { __payload: { custom_blocks: unknown; updated_at: string } };
      expect(b.__payload.custom_blocks).toEqual(blocks);
      expect(typeof b.__payload.updated_at).toBe('string');
      expect(b.__eq).toEqual({ column: 'id', value: 'setting-1' });
    });

    it('returns an Observable (not a Promise)', () => {
      const { service } = setupService({
        updateImpl: () => Promise.resolve({ data: null, error: null }),
      });
      const obs = service.updateCustomBlocks('setting-1', []);
      expect(isObservable(obs)).toBe(true);
    });
  });

  // ---------- previewTemplate forwards custom_blocks ----------
  describe('previewTemplate forwards custom_blocks', () => {
    it('passes custom_blocks through to the RPC', async () => {
      const { service, calls } = setupService({
        rpcResult: { data: [{ html: '<h1>ok</h1>', sample_data: {} }], error: null },
      });

      const blocks = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          type: 'heading',
          version: 1,
          props: { text: 'ok', level: 1 },
        },
      ];
      await firstValueFrom(
        service.previewTemplate('company-1', 'invite_owner', {}, {
          custom_blocks: blocks as never,
        }),
      );
      const rpcCall = calls.find((c) => c.method === 'rpc:preview_email_template');
      expect(rpcCall).toBeTruthy();
      const args = rpcCall!.args[0] as Record<string, unknown>;
      expect(args['p_custom_blocks']).toEqual(blocks);
    });

    it('forwards null custom_blocks when omitted', async () => {
      const { service, calls } = setupService({
        rpcResult: { data: [{ html: '', sample_data: {} }], error: null },
      });
      await firstValueFrom(
        service.previewTemplate('company-1', 'invite_owner', {}, {}),
      );
      const rpcCall = calls.find((c) => c.method === 'rpc:preview_email_template');
      const args = rpcCall!.args[0] as Record<string, unknown>;
      expect(args['p_custom_blocks']).toBeNull();
    });

    it('re-throws P0001 errors with details preserved (block validation errors)', async () => {
      const { service } = setupService({
        rpcResult: {
          data: null,
          error: {
            code: 'P0001',
            message: 'invalid block prop',
            details: '{"block_index":2,"block_type":"heading","prop":"text"}',
          },
        },
      });
      try {
        await firstValueFrom(
          service.previewTemplate('company-1', 'invite_owner', {}, {}),
        );
        fail('expected observable to error');
      } catch (err) {
        const e = err as { code: string; details: string };
        expect(e.code).toBe('P0001');
        expect(e.details).toContain('block_index');
      }
    });
  });
});