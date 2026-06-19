import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';
import { LanguageService, AppLang, SUPPORTED_LANGS } from '../../../../../core/services/language.service';

interface LangOption {
  code: AppLang;
  label: string;
  nativeLabel: string;
}

@Component({
  selector: 'app-language-preferences',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
      <!-- Header -->
      <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
          <div class="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
            <i class="fas fa-language text-lg"></i>
          </div>
          Idioma preferido
        </h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 pl-[3.25rem]">
          Elige el idioma de la interfaz. Se guarda en tu cuenta y se aplica en todos tus dispositivos.
        </p>
      </div>

      <div class="p-6 space-y-4">
        @if (loading()) {
          <div class="flex items-center justify-center py-10">
            <svg class="animate-spin h-7 w-7 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          </div>
        } @else {
          <div class="max-w-md">
            <label for="preferred-language-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Idioma de la interfaz
            </label>
            <select
              id="preferred-language-select"
              [formControl]="langControl"
              class="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-2.5 px-3">
              @for (opt of langOptions; track opt.code) {
                <option [value]="opt.code">{{ opt.nativeLabel }} — {{ opt.label }}</option>
              }
            </select>
            @if (saving()) {
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                Guardando preferencia…
              </p>
            } @else {
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                El cambio se aplica al instante en toda la aplicación.
              </p>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class LanguagePreferencesComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private languageService = inject(LanguageService);
  private toast = inject(ToastService);

  loading = signal(true);
  saving = signal(false);

  langControl = new FormControl<AppLang>('es', { nonNullable: true });

  readonly langOptions: readonly LangOption[] = [
    { code: 'es', label: 'Spanish',  nativeLabel: 'Español' },
    { code: 'ca', label: 'Catalan',  nativeLabel: 'Català' },
    { code: 'de', label: 'German',   nativeLabel: 'Deutsch' },
  ];

  private subs = new Subscription();
  private currentUserId: string | null = null;

  ngOnInit(): void {
    this.subs.add(
      this.authService.userProfile$.subscribe((profile) => {
        this.currentUserId = profile?.id ?? null;
        const stored = (profile as any)?.preferred_language as AppLang | undefined;
        const initial: AppLang =
          stored && SUPPORTED_LANGS.includes(stored) ? stored : this.languageService.currentLang();
        this.langControl.setValue(initial, { emitEvent: false });
        this.loading.set(false);
      }),
    );

    this.subs.add(
      this.langControl.valueChanges.subscribe(async (value) => {
        if (!SUPPORTED_LANGS.includes(value)) return;
        await this.onLanguageChange(value);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private async onLanguageChange(lang: AppLang): Promise<void> {
    this.saving.set(true);
    try {
      const ok = await this.languageService.setUserPreference(lang, this.currentUserId);
      if (!ok) {
        this.toast.error('Error', 'No se pudo guardar la preferencia de idioma.');
      }
    } finally {
      this.saving.set(false);
    }
  }
}
