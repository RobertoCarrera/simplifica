import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { MessageDetailComponent } from './message-detail.component';
import { MailStoreService } from '../../services/mail-store.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { ToastService } from '../../../../services/toast.service';
import { MailErrorService } from '../../services/mail-error.service';

describe('MessageDetailComponent', () => {
  let component: MessageDetailComponent;
  let fixture: ComponentFixture<MessageDetailComponent>;
  let storeMock: any;
  let routeMock: any;
  let locationMock: any;
  let routerMock: any;
  let toastMock: any;

  const makeMsg = (id: string, received_at: string, overrides: any = {}) => ({
    id,
    received_at,
    thread_id: 'thread-1',
    account_id: 'acc-1',
    subject: 'Test Subject',
    from: { name: 'Sender', email: 'sender@test.com' },
    to: [{ name: 'Recipient', email: 'rec@test.com' }],
    cc: [],
    bcc: [],
    is_read: true,
    is_starred: false,
    is_archived: false,
    snippet: '',
    folder_id: 'inbox-1',
    attachments: [],
    metadata: {},
    body_html: '<p>Hello</p>',
    body_text: 'Hello',
    ...overrides,
  });

  beforeEach(async () => {
    storeMock = {
      selectedMessage: jasmine.createSpy('selectedMessage').and.returnValue(null),
      messages: jasmine.createSpy('messages').and.returnValue([]),
      currentAccount: jasmine.createSpy('currentAccount').and.returnValue(null),
      folders: jasmine.createSpy('folders').and.returnValue([]),
      getMessage: jasmine.createSpy('getMessage').and.resolveTo(null),
      getThreadMessagesLinked: jasmine.createSpy('getThreadMessagesLinked').and.resolveTo([]),
      getThreadMessages: jasmine.createSpy('getThreadMessages').and.resolveTo([]),
      getThreadByMessage: jasmine.createSpy('getThreadByMessage').and.resolveTo([]),
      markAsRead: jasmine.createSpy('markAsRead').and.resolveTo(),
      loadFolders: jasmine.createSpy('loadFolders').and.resolveTo(),
    };

    routeMock = {
      paramMap: of(new Map([['threadId', 'msg-1']])),
    };

    locationMock = { back: jasmine.createSpy('back') };
    routerMock = { navigate: jasmine.createSpy('navigate') };
    toastMock = { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') };

    const supabaseMock = {
      instance: {
        auth: { getSession: jasmine.createSpy('getSession').and.returnValue(
          Promise.resolve({ data: { session: { access_token: 'token' } } })
        )},
      },
    };

    const operationsMock = {
      sendMessage: jasmine.createSpy('sendMessage').and.resolveTo(),
      deleteMessages: jasmine.createSpy('deleteMessages').and.resolveTo(),
      toggleStar: jasmine.createSpy('toggleStar').and.resolveTo(),
    };

    const errorsMock = { parse: jasmine.createSpy('parse').and.returnValue({ message: '', userMessage: '' }) };

    await TestBed.configureTestingModule({
      imports: [MessageDetailComponent],
      providers: [
        { provide: MailStoreService, useValue: storeMock },
        { provide: MailOperationService, useValue: operationsMock },
        { provide: SupabaseClientService, useValue: supabaseMock },
        { provide: ActivatedRoute, useValue: routeMock },
        { provide: Location, useValue: locationMock },
        { provide: Router, useValue: routerMock },
        { provide: ToastService, useValue: toastMock },
        { provide: MailErrorService, useValue: errorsMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MessageDetailComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('scrollToBottom', () => {
    it('should be defined as a method', () => {
      expect(typeof (component as any).scrollToBottom).toBe('function');
    });

    it('should scroll thread-messages container to bottom when element exists', (done) => {
      // Create a mock DOM element
      const mockContainer = document.createElement('div');
      mockContainer.className = 'thread-messages';
      Object.defineProperty(mockContainer, 'scrollHeight', { value: 800, writable: true });
      mockContainer.scrollTop = 0;
      document.body.appendChild(mockContainer);

      (component as any).scrollToBottom();

      // Wait for requestAnimationFrame + setTimeout
      setTimeout(() => {
        expect(mockContainer.scrollTop).toBe(800);
        document.body.removeChild(mockContainer);
        done();
      }, 10);
    });

    it('should not throw when thread-messages element does not exist', () => {
      expect(() => (component as any).scrollToBottom()).not.toThrow();
    });
  });

  describe('isSentByMe', () => {
    it('should return true when from email matches current account', () => {
      storeMock.currentAccount.and.returnValue({ email: 'me@test.com' });
      expect(component.isSentByMe({ from: { email: 'me@test.com' } })).toBeTrue();
    });

    it('should return false when from email differs', () => {
      storeMock.currentAccount.and.returnValue({ email: 'me@test.com' });
      expect(component.isSentByMe({ from: { email: 'other@test.com' } })).toBeFalse();
    });

    it('should return false when no current account', () => {
      storeMock.currentAccount.and.returnValue(null);
      expect(component.isSentByMe({ from: { email: 'me@test.com' } })).toBeFalse();
    });
  });

  describe('thread group helpers', () => {
    const msgs = [
      makeMsg('1', '2025-06-01T10:00:00Z', { from: { email: 'other@test.com' } }),
      makeMsg('2', '2025-06-01T10:05:00Z', { from: { email: 'me@test.com' } }),
      makeMsg('3', '2025-06-01T10:10:00Z', { from: { email: 'other@test.com' } }),
      makeMsg('4', '2025-06-02T10:00:00Z', { from: { email: 'other@test.com' } }),
    ];

    beforeEach(() => {
      component.threadMessages.set(msgs);
      storeMock.currentAccount.and.returnValue({ email: 'me@test.com', id: 'user-1' });
    });

    it('isGroupStart should be true at index 0 and when sender changes', () => {
      expect(component.isGroupStart(0)).toBeTrue();
      expect(component.isGroupStart(1)).toBeTrue();  // other → me
      expect(component.isGroupStart(2)).toBeTrue();  // me → other
      expect(component.isGroupStart(3)).toBeFalse(); // same sender as 2
    });

    it('isNewDate should be true at index 0 and when date differs from previous', () => {
      expect(component.isNewDate(0)).toBeTrue();
      expect(component.isNewDate(1)).toBeFalse(); // same day
      expect(component.isNewDate(2)).toBeFalse(); // same day
      expect(component.isNewDate(3)).toBeTrue();  // different day
    });
  });
});
