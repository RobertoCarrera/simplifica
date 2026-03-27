import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  let service: LanguageService;
  let translocoSpy: jasmine.SpyObj<TranslocoService>;

  function setupService(storedLang: string | null, browserLangs: string[]) {
    localStorage.clear();
    if (storedLang !== null) localStorage.setItem('app_lang', storedLang);

    spyOnProperty(navigator, 'languages').and.returnValue(browserLangs as readonly string[]);

    translocoSpy = jasmine.createSpyObj('TranslocoService', ['setActiveLang']);

    TestBed.configureTestingModule({
      providers: [
        LanguageService,
        { provide: TranslocoService, useValue: translocoSpy },
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
});
