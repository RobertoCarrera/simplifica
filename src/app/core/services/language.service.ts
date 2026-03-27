import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type AppLang = 'es' | 'ca';

const STORAGE_KEY = 'app_lang';
const SUPPORTED_LANGS: AppLang[] = ['es', 'ca'];
const DEFAULT_LANG: AppLang = 'es';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private transloco = inject(TranslocoService);

  readonly currentLang = signal<AppLang>(DEFAULT_LANG);

  /**
   * Called via APP_INITIALIZER before first render.
   * Priority: localStorage → browser language detection → default ('es')
   */
  initLanguage(): void {
    const lang = this.resolveLanguage();
    this.applyLanguage(lang);
  }

  setLanguage(lang: AppLang): void {
    this.applyLanguage(lang);
  }

  private resolveLanguage(): AppLang {
    // 1. Persisted preference
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored as AppLang)) {
      return stored as AppLang;
    }

    // 2. Browser language detection
    const detected = this.detectBrowserLanguage();
    if (detected) return detected;

    // 3. Default
    return DEFAULT_LANG;
  }

  private detectBrowserLanguage(): AppLang | null {
    const langs = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];

    for (const lang of langs) {
      if (lang.toLowerCase().startsWith('ca')) return 'ca';
    }
    return null;
  }

  private applyLanguage(lang: AppLang): void {
    this.transloco.setActiveLang(lang);
    this.currentLang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }
}
