import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { SupabaseClientService } from '../../services/supabase-client.service';

export type AppLang = 'es' | 'ca' | 'de';

const STORAGE_KEY = 'app_lang';
export const SUPPORTED_LANGS: readonly AppLang[] = ['es', 'ca', 'de'] as const;
const DEFAULT_LANG: AppLang = 'es';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private transloco = inject(TranslocoService);
  private sbClient = inject(SupabaseClientService);

  readonly currentLang = signal<AppLang>(DEFAULT_LANG);
  readonly availableLangs = SUPPORTED_LANGS;

  /**
   * Called via APP_INITIALIZER before first render.
   * Priority at boot: localStorage → browser language detection → default ('es').
   * The user-level preference is loaded AFTER auth via loadUserPreference().
   */
  initLanguage(): void {
    const lang = this.resolveBootLanguage();
    this.applyLanguage(lang);
  }

  setLanguage(lang: AppLang): void {
    this.applyLanguage(lang);
  }

  /**
   * Loads the authenticated user's preferred_language from public.users.
   * If found and valid, OVERRIDES the boot value (user preference always wins).
   * Safe to call multiple times; safe if user not yet authenticated.
   */
  async loadUserPreference(userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    try {
      const supabase = this.sbClient.instance;
      const { data, error } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[LanguageService] loadUserPreference failed:', error.message);
        return;
      }
      const stored = data?.preferred_language as AppLang | undefined;
      if (stored && SUPPORTED_LANGS.includes(stored) && stored !== this.currentLang()) {
        this.applyLanguage(stored);
      }
    } catch (e: any) {
      console.warn('[LanguageService] loadUserPreference threw:', e?.message ?? e);
    }
  }

  /**
   * Persists the user's choice to public.users AND updates the live language.
   * Returns true on success, false on failure (UI can react with a toast).
   */
  async setUserPreference(lang: AppLang, userId: string | null | undefined): Promise<boolean> {
    if (!SUPPORTED_LANGS.includes(lang)) return false;
    // Apply immediately so the UI re-renders without waiting on the DB.
    this.applyLanguage(lang);
    if (!userId) return true; // anonymous session: localStorage + signal already updated.

    try {
      const supabase = this.sbClient.instance;
      const { error } = await supabase
        .from('users')
        .update({ preferred_language: lang })
        .eq('id', userId);
      if (error) {
        console.warn('[LanguageService] setUserPreference failed:', error.message);
        return false;
      }
      return true;
    } catch (e: any) {
      console.warn('[LanguageService] setUserPreference threw:', e?.message ?? e);
      return false;
    }
  }

  private resolveBootLanguage(): AppLang {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored as AppLang)) {
      return stored as AppLang;
    }
    const detected = this.detectBrowserLanguage();
    if (detected) return detected;
    return DEFAULT_LANG;
  }

  private detectBrowserLanguage(): AppLang | null {
    const langs = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];

    for (const lang of langs) {
      if (lang.toLowerCase().startsWith('ca')) return 'ca';
      if (lang.toLowerCase().startsWith('de')) return 'de';
    }
    return null;
  }

  private applyLanguage(lang: AppLang): void {
    this.transloco.setActiveLang(lang);
    this.currentLang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  }
}
