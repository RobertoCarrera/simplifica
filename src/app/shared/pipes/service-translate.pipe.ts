import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/services/language.service';

const COMPANY_DEFAULT_LANG_KEY = 'company-default-language';

@Pipe({
  name: 'serviceTranslate',
  standalone: true,
  pure: false // impure because it depends on language changes
})
export class ServiceTranslatePipe implements PipeTransform {
  private languageService = inject(LanguageService);

  /**
   * @param name The original service name
   * @param translations Optional translations object: { ca?: string, de?: string }
   */
  transform(
    name: string | undefined | null,
    translations?: Record<string, any> | null
  ): string {
    if (!name) return '';
    if (!translations || typeof translations !== 'object') return name;

    const langKeys = Object.keys(translations).filter(k => !k.startsWith('default'));
    if (langKeys.length === 0) return name;

    const currentLang = this.languageService.currentLang() || 'es';
    const fallback = this.getCompanyDefaultLang();

    // If current language is the fallback/default, return original name
    if (currentLang === fallback) return name;

    // Use current language translation if available
    if (translations[currentLang]) return translations[currentLang];

    // If fallback language has a translation, use it
    if (translations[fallback]) return translations[fallback];

    // Default to original name
    return name;
  }

  private getCompanyDefaultLang(): string {
    try {
      return localStorage.getItem(COMPANY_DEFAULT_LANG_KEY) || 'es';
    } catch {
      return 'es';
    }
  }
}