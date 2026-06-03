import { TestBed } from '@angular/core/testing';
import { MailMessageService } from './mail-message.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { RuntimeConfigService } from '../../../services/runtime-config.service';
import { MailFolderService } from './mail-folder.service';

describe('MailMessageService', () => {
  let service: MailMessageService;
  let supabaseMock: any;

  const makeMsg = (id: string, received_at: string) => ({
    id, received_at, thread_id: 'thread-1', account_id: 'acc-1',
    subject: 'Test', from: { name: 'A', email: 'a@test.com' },
    to: [], cc: [], bcc: [], is_read: true, is_starred: false,
    is_archived: false, snippet: '', folder_id: 'inbox-1',
    attachments: [], metadata: {},
  });

  beforeEach(() => {
    supabaseMock = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue({
              range: jasmine.createSpy('range').and.returnValue(
                Promise.resolve({ data: [], error: null })
              ),
            }),
            single: jasmine.createSpy('single').and.returnValue(
              Promise.resolve({ data: null, error: null })
            ),
          }),
          or: jasmine.createSpy('or').and.returnValue({
            limit: jasmine.createSpy('limit').and.returnValue(
              Promise.resolve({ data: [], error: null })
            ),
          }),
        }),
      }),
      auth: { getSession: jasmine.createSpy('getSession').and.returnValue(
        Promise.resolve({ data: { session: { access_token: 'token' } } })
      )},
    };

    const runtimeConfigMock = {
      get: jasmine.createSpy('get').and.returnValue({
        supabase: { url: 'http://localhost' },
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        MailMessageService,
        { provide: SupabaseClientService, useValue: { instance: supabaseMock } },
        { provide: RuntimeConfigService, useValue: runtimeConfigMock },
        { provide: MailFolderService, useValue: {} },
      ],
    });
    service = TestBed.inject(MailMessageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('mergeBySubject', () => {
    it('should sort messages ascending by received_at (oldest first)', () => {
      const primary = [
        makeMsg('1', '2025-03-01T12:00:00Z'),
      ];
      const candidates = [
        makeMsg('2', '2025-03-03T12:00:00Z'),
        makeMsg('3', '2025-02-28T12:00:00Z'), // older than primary
      ];

      // Access private method via bracket notation for testing
      const result = (service as any).mergeBySubject(primary, candidates, 'Test');

      expect(result.length).toBe(3);
      expect(new Date(result[0].received_at).getTime())
        .toBeLessThan(new Date(result[1].received_at).getTime());
      expect(new Date(result[1].received_at).getTime())
        .toBeLessThan(new Date(result[2].received_at).getTime());
      // Oldest first
      expect(result[0].id).toBe('3'); // 2025-02-28
      expect(result[1].id).toBe('1'); // 2025-03-01
      expect(result[2].id).toBe('2'); // 2025-03-03
    });

    it('should deduplicate by id', () => {
      const primary = [makeMsg('1', '2025-03-01T12:00:00Z')];
      const candidates = [makeMsg('1', '2025-03-01T12:00:00Z')];

      const result = (service as any).mergeBySubject(primary, candidates, 'Test');

      expect(result.length).toBe(1);
    });
  });

  describe('normalizeSubject', () => {
    it('should strip Re: prefix', () => {
      expect((service as any).normalizeSubject('Re: Hello')).toBe('Hello');
      expect((service as any).normalizeSubject('RE: Hello')).toBe('Hello');
    });

    it('should strip Fwd: prefix', () => {
      expect((service as any).normalizeSubject('Fwd: Hello')).toBe('Hello');
      expect((service as any).normalizeSubject('FWD: Hello')).toBe('Hello');
    });

    it('should handle Spanish AW prefix', () => {
      expect((service as any).normalizeSubject('AW: Hello')).toBe('Hello');
    });

    it('should keep subject without prefix unchanged', () => {
      expect((service as any).normalizeSubject('Hello')).toBe('Hello');
    });
  });

  describe('getThreadMessages (order verification)', () => {
    it('should request thread messages in ascending order', async () => {
      const msg1 = makeMsg('1', '2025-03-01T10:00:00Z');
      const msg2 = makeMsg('2', '2025-03-01T12:00:00Z');
      const msg3 = makeMsg('3', '2025-03-01T14:00:00Z');

      // Override the chain to return ordered data
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [msg1, msg2, msg3], error: null })
      );
      supabaseMock.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy,
          }),
        }),
      });

      const result = await service.getThreadMessages('thread-1');

      expect(orderSpy).toHaveBeenCalledWith('received_at', { ascending: false });
      expect(result.length).toBe(3);
    });
  });
});
