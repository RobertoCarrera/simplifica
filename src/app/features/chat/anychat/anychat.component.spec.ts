import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AnychatComponent } from './anychat.component';
import { ModuleAwareService } from '../../../core/services/module-aware.service';
import { AnyChatService } from '../../../services/anychat.service';
import { ToastService } from '../../../services/toast.service';
import { mockModulesService } from '../../../core/services/module-aware.service.spec';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';

// ---------------------------------------------------------------------------
// Minimal service stubs
// ---------------------------------------------------------------------------

function mockAnyChatService() {
  return {
    getContacts: jasmine
      .createSpy('getContacts')
      .and.returnValue(of({ data: [], page: 1, pages: 1, total: 0, limit: 20 })),
    getConversations: jasmine
      .createSpy('getConversations')
      .and.returnValue(of({ data: [], page: 1, pages: 1, total: 0, limit: 20 })),
    getMessages: jasmine
      .createSpy('getMessages')
      .and.returnValue(of({ data: [], page: 1, pages: 1, total: 0, limit: 50 })),
    getContact: jasmine.createSpy('getContact').and.returnValue(of(null)),
    searchContactByEmail: jasmine
      .createSpy('searchContactByEmail')
      .and.returnValue(of({ data: [], page: 1, pages: 1, total: 0, limit: 20 })),
    sendMessage: jasmine.createSpy('sendMessage').and.returnValue(of(null)),
  };
}

function mockToastService() {
  return {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    info: jasmine.createSpy('info'),
  };
}

// ---------------------------------------------------------------------------
// T06 — AnychatComponent: module-aware gating tests
// ---------------------------------------------------------------------------

describe('AnychatComponent — module-aware gating (T06)', () => {
  let anychatServiceMock: ReturnType<typeof mockAnyChatService>;
  let toastServiceMock: ReturnType<typeof mockToastService>;

  function setupComponent(moduleEnabled: boolean | null) {
    anychatServiceMock = mockAnyChatService();
    toastServiceMock = mockToastService();

    TestBed.configureTestingModule({
      imports: [AnychatComponent],
      providers: [
        { provide: AnyChatService, useValue: anychatServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        {
          provide: SupabaseModulesService,
          useValue: mockModulesService(moduleEnabled),
        },
      ],
    }).compileComponents();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // T07 (included): Performance verification — zero subscriptions when disabled
  // ─────────────────────────────────────────────────────────────────────────

  describe('when moduloChat is DISABLED (T07 — performance verification)', () => {
    beforeEach(() => {
      setupComponent(false);
    });

    it('should create the component', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('should NOT call anychatService.getContacts() when moduloChat is disabled', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      fixture.detectChanges(); // triggers ngOnInit

      expect(anychatServiceMock.getContacts).not.toHaveBeenCalled();
    });

    it('should NOT call anychatService.getConversations() when moduloChat is disabled', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      fixture.detectChanges(); // triggers ngOnInit

      expect(anychatServiceMock.getConversations).not.toHaveBeenCalled();
    });

    it('should create ZERO subscriptions when moduloChat is disabled', () => {
      // Spy on the isEnabled method to confirm early return path
      const moduleAware = TestBed.inject(ModuleAwareService);
      spyOn(moduleAware, 'isEnabled').and.returnValue(false);

      const fixture = TestBed.createComponent(AnychatComponent);
      fixture.detectChanges();

      // No service calls means zero subscriptions were created
      expect(anychatServiceMock.getContacts).not.toHaveBeenCalled();
      expect(anychatServiceMock.getConversations).not.toHaveBeenCalled();
      expect(anychatServiceMock.getMessages).not.toHaveBeenCalled();
    });

    it('moduleAware.isEnabled() should return false (confirming the guard)', () => {
      const moduleAware = TestBed.inject(ModuleAwareService);
      expect(moduleAware.isEnabled('moduloChat')).toBeFalse();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // When moduloChat is not loaded yet (null)
  // ─────────────────────────────────────────────────────────────────────────

  describe('when moduloChat status is NULL (modules not loaded yet)', () => {
    beforeEach(() => {
      setupComponent(null);
    });

    it('should NOT call anychatService.getContacts() when modules not loaded', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      fixture.detectChanges();

      expect(anychatServiceMock.getContacts).not.toHaveBeenCalled();
    });

    it('should NOT call anychatService.getConversations() when modules not loaded', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      fixture.detectChanges();

      expect(anychatServiceMock.getConversations).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // When moduloChat is ENABLED — subscriptions ARE created
  // ─────────────────────────────────────────────────────────────────────────

  describe('when moduloChat is ENABLED', () => {
    beforeEach(() => {
      setupComponent(true);
    });

    it('should create the component', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('should call anychatService.getConversations() on init when module enabled', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      fixture.detectChanges(); // triggers ngOnInit -> loadConversations()

      expect(anychatServiceMock.getConversations).toHaveBeenCalled();
    });

    it('should call anychatService.getContacts() on init when module enabled', () => {
      const fixture = TestBed.createComponent(AnychatComponent);
      fixture.detectChanges(); // triggers ngOnInit -> loadContacts()

      expect(anychatServiceMock.getContacts).toHaveBeenCalled();
    });

    it('moduleAware.isEnabled() should return true when module is enabled', () => {
      const moduleAware = TestBed.inject(ModuleAwareService);
      expect(moduleAware.isEnabled('moduloChat')).toBeTrue();
    });
  });
});
