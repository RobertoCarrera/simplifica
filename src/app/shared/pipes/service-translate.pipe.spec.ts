import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/services/language.service';
import { ServiceTranslatePipe } from './service-translate.pipe';

type AppLang = 'es' | 'ca' | 'de';

describe('ServiceTranslatePipe', () => {
  let pipe: ServiceTranslatePipe;
  let currentLangValue: AppLang;

  const mockLanguageService: Partial<LanguageService> = {
    get currentLang(): any {
      return jasmine.createSpy('currentLang').and.returnValue(currentLangValue);
    }
  };

  beforeEach(() => {
    currentLangValue = 'es';

    TestBed.configureTestingModule({
      providers: [
        ServiceTranslatePipe,
        { provide: LanguageService, useValue: mockLanguageService }
      ]
    });

    pipe = TestBed.inject(ServiceTranslatePipe);
  });

  it('should return original name when translations are empty', () => {
    expect(pipe.transform('Consultoría', null)).toBe('Consultoría');
    expect(pipe.transform('Consultoría', undefined)).toBe('Consultoría');
    expect(pipe.transform('Consultoría', {})).toBe('Consultoría');
  });

  it('should return original name when current language is default (es)', () => {
    currentLangValue = 'es';
    const translations = { ca: 'Consultoria', de: 'Beratung' };
    expect(pipe.transform('Consultoría', translations)).toBe('Consultoría');
  });

  it('should return Catalan translation when current language is ca', () => {
    currentLangValue = 'ca';
    const translations = { ca: 'Consultoria', de: 'Beratung' };
    expect(pipe.transform('Consultoría', translations)).toBe('Consultoria');
  });

  it('should return German translation when current language is de', () => {
    currentLangValue = 'de';
    const translations = { ca: 'Consultoria', de: 'Beratung' };
    expect(pipe.transform('Consultoría', translations)).toBe('Beratung');
  });

  it('should fall back to default translation when current lang translation is missing', () => {
    currentLangValue = 'ca';
    const translations = { de: 'Beratung' };
    expect(pipe.transform('Consultoría', translations)).toBe('Consultoría');
  });

  it('should return empty string when name is empty', () => {
    currentLangValue = 'ca';
    const translations = { ca: 'Consultoria' };
    expect(pipe.transform('', translations)).toBe('');
  });
});
