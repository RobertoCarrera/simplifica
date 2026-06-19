import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from './language.service';
import { SupabaseClientService } from '../../services/supabase-client.service';

describe('LanguageService', () => {
  let service: LanguageService;
  let translocoSpy: jasmine.SpyObj<TranslocoService>;
  let supabaseUpdateChain: any;
  let supabaseSelectChain: any;

  function setupService(storedLang: string | null, browserLangs: string[]) {
    localStorage.clear();
    if (storedLang !== null) localStorage.setItem('app_lang', storedLang);

    spyOnProperty(navigator, 'languages').and.returnValue(browserLangs as readonly string[]);

    translocoSpy = jasmine.createSpyObj('TranslocoService', ['setActiveLang']);

    // Mock SupabaseClientService.instance with a fluent query builder.
    supabaseSelectChain = {
      select: jasmine.createSpy('select').and.callFake(() => supabaseSelectChain),
      eq: jasmine.createSpy('eq').and.callFake(() => supabaseSelectChain),
      maybeSingle: jasmine.createSpy('maybeSingle').and.resolveTo({
        data: { preferred_language: null },
        error: null,
      }),
    };
    supabaseUpdateChain = {
      update: jasmine.createSpy('update').and.callFake(() => supabaseUpdateChain),
      eq: jasmine.createSpy('eq').and.callFake(() => supabaseUpdateChain),
      // .eq() returns the chain; await on the chain resolves to { data, error }
      then: (resolve: any) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    const supabaseMock: any = {
      from: jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'users') return supabaseSelectChain;
        return supabaseUpdateChain;
      }),
    };
    const sbClientMock = { instance: supabaseMock };

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslocoService, useValue: translocoSpy },
        { provide: SupabaseClientService, useValue: sbClientMock },
      ],
    });

    service = TestBed.inject(LanguageService);
  }

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('uses stored valid lang (ca) — skips browser detection', () => {
    setupService('ca', ['es-ES']);
    service.initLanguage();
    expect(translocoSpy.setActiveLang).toHaveBeenCalledWith('ca');
    expect(service.currentLang()).toBe('ca');
  });

  it('defaults to es when no localStorage and non-Catalan browser', () => {
    setupService(null, ['en-US', 'fr-FR']);
    service.initLanguage();
    expect(translocoSpy.setActiveLang).toHaveBeenCalledWith('es');
    expect(service.currentLang()).toBe('es');
  });

  it('detects ca from browser when no localStorage (ca-ES)', () => {
    setupService(null, ['ca-ES', 'es-ES']);
    service.initLanguage();
    expect(translocoSpy.setActiveLang).toHaveBeenCalledWith('ca');
    expect(service.currentLang()).toBe('ca');
  });

  it('ignores invalid localStorage value and falls back to browser/default', () => {
    setupService('fr', ['es-ES']);
    service.initLanguage();
    expect(translocoSpy.setActiveLang).toHaveBeenCalledWith('es');
    expect(localStorage.getItem('app_lang')).toBe('es');
  });

  it('setLanguage persists to localStorage and updates signal', () => {
    setupService(null, ['es-ES']);
    service.setLanguage('ca');
    expect(translocoSpy.setActiveLang).toHaveBeenCalledWith('ca');
    expect(localStorage.getItem('app_lang')).toBe('ca');
    expect(service.currentLang()).toBe('ca');
  });

  describe('user preference (DB-backed)', () => {
    it('setUserPreference writes to public.users and updates active language', async () => {
      setupService(null, ['es-ES']);
      service.initLanguage();

      // Override the .from('users') mock to return the update chain.
      const sb = (service as any).sbClient.instance;
      sb.from.and.callFake((table: string) =>
        table === 'users' ? supabaseUpdateChain : supabaseUpdateChain,
      );

      const ok = await service.setUserPreference('ca', 'user-123');
      expect(ok).toBe(true);
      expect(sb.from).toHaveBeenCalledWith('users');
      expect(supabaseUpdateChain.update).toHaveBeenCalledWith({ preferred_language: 'ca' });
      expect(supabaseUpdateChain.eq).toHaveBeenCalledWith('id', 'user-123');
      expect(service.currentLang()).toBe('ca');
      expect(localStorage.getItem('app_lang')).toBe('ca');
    });

    it('setUserPreference is a no-op for unsupported languages', async () => {
      setupService(null, ['es-ES']);
      service.initLanguage();
      const ok = await service.setUserPreference('fr' as any, 'user-123');
      expect(ok).toBe(false);
      expect(service.currentLang()).toBe('es');
    });

    it('loadUserPreference overrides boot language with stored user choice', async () => {
      setupService('es', ['es-ES']);
      service.initLanguage();
      expect(service.currentLang()).toBe('es');

      // Mock the select chain to return 'ca'.
      supabaseSelectChain.maybeSingle.and.resolveTo({
        data: { preferred_language: 'ca' },
        error: null,
      });

      await service.loadUserPreference('user-456');

      expect(service.currentLang()).toBe('ca');
      expect(localStorage.getItem('app_lang')).toBe('ca');
      expect(translocoSpy.setActiveLang).toHaveBeenCalledWith('ca');
    });

    it('loadUserPreference is a no-op when userId is null', async () => {
      setupService(null, ['es-ES']);
      service.initLanguage();
      await service.loadUserPreference(null);
      // Should not have called supabase.
      const sb = (service as any).sbClient.instance;
      expect(sb.from).not.toHaveBeenCalled();
    });

    it('loadUserPreference ignores unsupported stored values', async () => {
      setupService(null, ['es-ES']);
      service.initLanguage();
      supabaseSelectChain.maybeSingle.and.resolveTo({
        data: { preferred_language: 'fr' },
        error: null,
      });
      await service.loadUserPreference('user-789');
      expect(service.currentLang()).toBe('es');
    });

    it('loadUserPreference logs and continues when DB query errors', async () => {
      setupService(null, ['es-ES']);
      service.initLanguage();
      supabaseSelectChain.maybeSingle.and.resolveTo({
        data: null,
        error: { message: 'boom' },
      });
      // Should not throw.
      await expectAsync(service.loadUserPreference('user-x')).toBeResolved();
      expect(service.currentLang()).toBe('es');
    });
  });
});
