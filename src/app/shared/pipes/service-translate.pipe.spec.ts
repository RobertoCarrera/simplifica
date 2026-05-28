import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/services/language.service';
import { ServiceTranslatePipe } from './service-translate.pipe';

describe('ServiceTranslatePipe', () => {
  let pipe: ServiceTranslatePipe;
  let mockLanguageService: Partial<LanguageService>;

  beforeEach(() => {
    mockLanguageService = {
      currentLang: jasmine.createSpy('currentLang').and.returnValue('es')
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: LanguageService, useValue: mockLanguageService }
      ]
    });

    pipe = new ServiceTranslatePipe(mockLanguageService as LanguageService);
  });

  it('should return original name when translations are empty', () => {
    expect(pipe.transform('Consultoría', null)).toBe('Consultoría');
    expect(pipe.transform('Consultoría', undefined)).toBe('Consultoría');
    expect(pipe.transform('Consultoría', {})).toBe('Consultoría');
  });

  it('should return original name when current language is default (es)', () => {
    (mockLanguageService.currentLang as jasmine.Spy).and.returnValue('es');
    const translations = { ca: 'Consultoria', de: 'Beratung' };
    expect(pipe.transform('Consultoría', translations)).toBe('Consultoría');
  });

  it('should return Catalan translation when current language is ca', () => {
    (mockLanguageService.currentLang as jasmine.Spy).and.returnValue('ca');
    const translations = { ca: 'Consultoria', de: 'Beratung' };
    expect(pipe.transform('Consultoría', translations)).toBe('Consultoria');
  });

  it('should return German translation when current language is de', () => {
    (mockLanguageService.currentLang as jasmine.Spy).and.returnValue('de');
    const translations = { ca: 'Consultoria', de: 'Beratung' };
    expect(pipe.transform('Consultoría', translations)).toBe('Beratung');
  });

  it('should fall back to default translation when current lang translation is missing', () => {
    (mockLanguageService.currentLang as jasmine.Spy).and.returnValue('ca');
    const translations = { de: 'Beratung' }; // no ca translation
    expect(pipe.transform('Consultoría', translations)).toBe('Consultoría');
  });

  it('should return empty string when name is empty', () => {
    (mockLanguageService.currentLang as jasmine.Spy).and.returnValue('ca');
    const translations = { ca: 'Consultoria' };
    expect(pipe.transform('', translations)).toBe('');
  });

  it('should respect custom defaultLang parameter', () => {
    (mockLanguageService.currentLang as jasmine.Spy).and.returnValue('de');
    const translations = { ca: 'Consultoria' };
    // When currentLang ('de') !== defaultLang ('es'), but 'de' has no translation,
    // it falls back to 'es' (defaultLang), which is the original name
    expect(pipe.transform('Consultoría', translations, 'es')).toBe('Consultoría');
  });
});