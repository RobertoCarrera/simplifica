import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
export type ColorScheme = 'orange' | 'blue' | 'green' | 'purple' | 'red';

export interface ThemeConfig {
  theme: Theme;
  colorScheme: ColorScheme;
  tenantId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'simplifica-theme';
  private readonly COLOR_SCHEME_KEY = 'simplifica-color-scheme';

  // Signals para reactividad
  currentTheme = signal<Theme>('light');
  currentColorScheme = signal<ColorScheme>('orange');

  constructor() {
    this.loadThemeFromStorage();
    this.applyTheme();
    this.listenToSystemTheme();
  }

  private loadThemeFromStorage(): void {
    const savedTheme = localStorage.getItem(this.THEME_KEY) as Theme;
    const savedColorScheme = localStorage.getItem(this.COLOR_SCHEME_KEY) as ColorScheme;

    if (savedTheme) {
      this.currentTheme.set(savedTheme);
    }

    if (savedColorScheme) {
      this.currentColorScheme.set(savedColorScheme);
    }

    // Detectar preferencia del sistema si no hay tema guardado
    if (!savedTheme) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme.set(prefersDark ? 'dark' : 'light');
    }
  }

  toggleTheme(): void {
    const newTheme = this.currentTheme() === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  setTheme(theme: Theme): void {
    this.currentTheme.set(theme);
    localStorage.setItem(this.THEME_KEY, theme);
    this.applyTheme();
  }

  setColorScheme(colorScheme: ColorScheme): void {
    this.currentColorScheme.set(colorScheme);
    localStorage.setItem(this.COLOR_SCHEME_KEY, colorScheme);
    this.applyTheme();
  }

  setTenantTheme(tenantId: string, config: Partial<ThemeConfig>): void {
    const tenantKey = `${this.THEME_KEY}-${tenantId}`;
    const tenantColorKey = `${this.COLOR_SCHEME_KEY}-${tenantId}`;

    if (config.theme) {
      localStorage.setItem(tenantKey, config.theme);
      this.currentTheme.set(config.theme);
    }

    if (config.colorScheme) {
      localStorage.setItem(tenantColorKey, config.colorScheme);
      this.currentColorScheme.set(config.colorScheme);
    }

    this.applyTheme();
  }

  private applyTheme(): void {
    const html = document.documentElement;
    const theme = this.currentTheme();
    const colorScheme = this.currentColorScheme();

    // Aplicar clase de tema
    html.classList.remove('light', 'dark');
    html.classList.add(theme);

    // Aplicar esquema de colores
    html.classList.remove('theme-orange', 'theme-blue', 'theme-green', 'theme-purple', 'theme-red');
    html.classList.add(`theme-${colorScheme}`);

    // Actualizar meta theme-color para PWA
    const metaThemeColor = document.querySelector('meta[name=theme-color]');
    if (metaThemeColor) {
      const colors = {
        orange: theme === 'light' ? '#ea580c' : '#fb923c',
        blue: theme === 'light' ? '#2563eb' : '#60a5fa',
        green: theme === 'light' ? '#16a34a' : '#4ade80',
        purple: theme === 'light' ? '#9333ea' : '#c084fc',
        red: theme === 'light' ? '#dc2626' : '#f87171'
      };
      metaThemeColor.setAttribute('content', colors[colorScheme]);
    }
  }

  getCurrentConfig(): ThemeConfig {
    return {
      theme: this.currentTheme(),
      colorScheme: this.currentColorScheme()
    };
  }

  // Escuchar cambios del sistema
  listenToSystemTheme(): void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (!localStorage.getItem(this.THEME_KEY)) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}
