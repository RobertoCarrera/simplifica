import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { ModuleAwareService } from './module-aware.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';

// ---------------------------------------------------------------------------
// T03 — Mock helper (reusable across tests and other test files)
// ---------------------------------------------------------------------------

/**
 * Creates a minimal `SupabaseModulesService` mock with a controlled
 * `isModuleEnabled()` return value. Matches the design mock-helper pattern.
 */
export function mockModulesService(enabled: boolean | null): Partial<SupabaseModulesService> {
  return {
    isModuleEnabled: (_key: string) => enabled,
  };
}

// ---------------------------------------------------------------------------
// T02 — Unit tests for ModuleAwareService
// ---------------------------------------------------------------------------

describe('ModuleAwareService', () => {
  let service: ModuleAwareService;

  function setupService(enabled: boolean | null) {
    TestBed.configureTestingModule({
      providers: [
        ModuleAwareService,
        {
          provide: SupabaseModulesService,
          useValue: mockModulesService(enabled),
        },
      ],
    });
    service = TestBed.inject(ModuleAwareService);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // isEnabled()
  // ─────────────────────────────────────────────────────────────────────────

  describe('isEnabled()', () => {
    it('returns true when module is enabled', () => {
      setupService(true);
      expect(service.isEnabled('moduloChat')).toBeTrue();
    });

    it('returns false when module is disabled', () => {
      setupService(false);
      expect(service.isEnabled('moduloChat')).toBeFalse();
    });

    it('returns false when modules are not loaded yet (null)', () => {
      setupService(null);
      expect(service.isEnabled('moduloChat')).toBeFalse();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // moduleAwareSubscribe() — disabled / null module
  // ─────────────────────────────────────────────────────────────────────────

  describe('moduleAwareSubscribe() — module disabled', () => {
    it('returns null when module is disabled (false)', () => {
      setupService(false);

      // Build a fake destroyRef (won't be used since factory never runs)
      const fakeDestroyRef: any = { onDestroy: (_: () => void) => {} };
      const factorySpy = jasmine.createSpy('factory');

      const result = service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: factorySpy,
      });

      expect(result).toBeNull();
      expect(factorySpy).not.toHaveBeenCalled();
    });

    it('returns null when modules not loaded yet (null)', () => {
      setupService(null);
      const fakeDestroyRef: any = { onDestroy: (_: () => void) => {} };
      const factorySpy = jasmine.createSpy('factory');

      const result = service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: factorySpy,
      });

      expect(result).toBeNull();
      expect(factorySpy).not.toHaveBeenCalled();
    });

    it('does NOT call next() when module is disabled', () => {
      setupService(false);
      const fakeDestroyRef: any = { onDestroy: (_: () => void) => {} };
      const nextSpy = jasmine.createSpy('next');

      service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: () => of('value'),
        next: nextSpy,
      });

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // moduleAwareSubscribe() — module enabled
  // ─────────────────────────────────────────────────────────────────────────

  describe('moduleAwareSubscribe() — module enabled', () => {
    let destroyCallbacks: Array<() => void>;
    let fakeDestroyRef: any;

    beforeEach(() => {
      setupService(true);
      destroyCallbacks = [];
      fakeDestroyRef = {
        onDestroy: (cb: () => void) => destroyCallbacks.push(cb),
      };
    });

    it('returns a Subscription (not null) when module is enabled', () => {
      const result = service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: () => of('hello'),
      });

      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });

    it('calls factory() when module is enabled', () => {
      const factorySpy = jasmine.createSpy('factory').and.returnValue(of('data'));

      service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: factorySpy,
      });

      expect(factorySpy).toHaveBeenCalledTimes(1);
    });

    it('calls next() with emitted value when module is enabled', () => {
      const nextSpy = jasmine.createSpy('next');

      service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: () => of('test-value'),
        next: nextSpy,
      });

      expect(nextSpy).toHaveBeenCalledWith('test-value');
    });

    it('auto-cancels subscription when DestroyRef.onDestroy fires', () => {
      const subject = new Subject<string>();
      const nextSpy = jasmine.createSpy('next');

      const sub = service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: () => subject.asObservable(),
        next: nextSpy,
      });

      expect(sub).not.toBeNull();

      // Simulate component destruction
      destroyCallbacks.forEach((cb) => cb());

      // Emit AFTER destroy — should NOT reach next
      subject.next('after-destroy');

      expect(nextSpy).not.toHaveBeenCalledWith('after-destroy');
    });

    it('subscription is closed after component destroy', () => {
      const subject = new Subject<string>();

      const sub = service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: () => subject.asObservable(),
      });

      // Trigger destroy
      destroyCallbacks.forEach((cb) => cb());

      expect(sub!.closed).toBeTrue();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // moduleAwareSubscribe() — error handling
  // ─────────────────────────────────────────────────────────────────────────

  describe('moduleAwareSubscribe() — error handler', () => {
    beforeEach(() => {
      setupService(true);
    });

    it('calls custom error handler when provided and observable errors', () => {
      const fakeDestroyRef: any = { onDestroy: (_: () => void) => {} };
      const errorSpy = jasmine.createSpy('error');
      const errorSubject = new Subject<string>();

      service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: () => errorSubject.asObservable(),
        error: errorSpy,
      });

      const testError = new Error('test error');
      errorSubject.error(testError);

      expect(errorSpy).toHaveBeenCalledWith(testError);
    });

    it('uses default console.error when no error handler provided', () => {
      const fakeDestroyRef: any = { onDestroy: (_: () => void) => {} };
      const consoleSpy = spyOn(console, 'error');
      const errorSubject = new Subject<string>();

      service.moduleAwareSubscribe({
        moduleKey: 'moduloChat',
        destroyRef: fakeDestroyRef,
        factory: () => errorSubject.asObservable(),
      });

      errorSubject.error(new Error('default error'));

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // mockModulesService helper (T03)
  // ─────────────────────────────────────────────────────────────────────────

  describe('mockModulesService helper', () => {
    it('returns the provided enabled value for any key', () => {
      const mock = mockModulesService(true);
      expect(mock.isModuleEnabled!('any-key')).toBeTrue();
    });

    it('returns false when enabled=false', () => {
      const mock = mockModulesService(false);
      expect(mock.isModuleEnabled!('any-key')).toBeFalse();
    });

    it('returns null when enabled=null (modules not loaded)', () => {
      const mock = mockModulesService(null);
      expect(mock.isModuleEnabled!('any-key')).toBeNull();
    });
  });
});
