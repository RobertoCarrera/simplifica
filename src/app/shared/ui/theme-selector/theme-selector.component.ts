import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, Theme, ColorScheme } from '../../../services/theme.service';
import { AnimationService } from '../../../services/animation.service';

@Component({
  selector: 'app-theme-selector',
  standalone: true,
  imports: [CommonModule],
  animations: [
    AnimationService.fadeInUp,
    AnimationService.cardHover,
    AnimationService.buttonPress
  ],
  template: `
    <div class="theme-selector" @fadeInUp>
      <!-- Toggle de tema oscuro/claro -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Tema</h3>
        <div class="flex items-center space-x-4">
          <button
            (click)="toggleTheme()"
            [class.active]="currentTheme() === 'light'"
            class="theme-toggle-btn"
            @buttonPress
            #lightBtn
            (mouseenter)="lightBtn.style.transform = 'scale(1.05)'"
            (mouseleave)="lightBtn.style.transform = 'scale(1)'">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z">
              </path>
            </svg>
            Claro
          </button>
          
          <button
            (click)="setDarkTheme()"
            [class.active]="currentTheme() === 'dark'"
            class="theme-toggle-btn"
            @buttonPress
            #darkBtn
            (mouseenter)="darkBtn.style.transform = 'scale(1.05)'"
            (mouseleave)="darkBtn.style.transform = 'scale(1)'">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z">
              </path>
            </svg>
            Oscuro
          </button>
        </div>
      </div>

      <!-- Selector de esquema de colores -->
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">Esquema de Colores</h3>
        <div class="grid grid-cols-5 gap-3">
          <button
            *ngFor="let color of colorSchemes"
            (click)="setColorScheme(color.value)"
            [class.active]="currentColorScheme() === color.value"
            [style.background-color]="color.preview"
            class="color-scheme-btn group"
            @cardHover
            [title]="color.name">
            <div class="color-preview" [style.background-color]="color.preview">
              <svg *ngIf="currentColorScheme() === color.value" 
                   class="w-4 h-4 text-white" 
                   fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </div>
            <span class="color-name">{{color.name}}</span>
          </button>
        </div>
      </div>

      <!-- Preview del tema actual -->
      <div class="mt-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800" @fadeInUp>
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Vista Previa</h4>
        <div class="space-y-2">
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full" [style.background-color]="getCurrentPrimaryColor()"></div>
            <span class="text-sm text-gray-600 dark:text-gray-300">Color Principal</span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            Tema: {{currentTheme()}} | Colores: {{getColorSchemeName()}}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .theme-toggle-btn {
      @apply flex items-center space-x-2 px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 
             bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all duration-200 
             hover:shadow-md;
    }

    .theme-toggle-btn.active {
      @apply border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300;
    }

    .color-scheme-btn {
      @apply relative w-full h-16 rounded-lg border-2 border-gray-200 dark:border-gray-600 
             overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-105;
    }

    .color-scheme-btn.active {
      @apply border-gray-400 dark:border-gray-300 ring-2 ring-offset-2 ring-gray-400;
    }

    .color-preview {
      @apply w-full h-10 flex items-center justify-center;
    }

    .color-name {
      @apply absolute bottom-1 left-0 right-0 text-xs text-center text-gray-700 dark:text-gray-300 
             bg-white dark:bg-gray-800 bg-opacity-90 dark:bg-opacity-90 py-1;
    }

    .theme-selector {
      @apply p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg;
    }
  `]
})
export class ThemeSelectorComponent {
  private themeService = inject(ThemeService);

  currentTheme = this.themeService.currentTheme;
  currentColorScheme = this.themeService.currentColorScheme;

  colorSchemes = [
    { name: 'Naranja', value: 'orange' as ColorScheme, preview: '#ea580c' },
    { name: 'Azul', value: 'blue' as ColorScheme, preview: '#2563eb' },
    { name: 'Verde', value: 'green' as ColorScheme, preview: '#16a34a' },
    { name: 'Morado', value: 'purple' as ColorScheme, preview: '#9333ea' },
    { name: 'Rojo', value: 'red' as ColorScheme, preview: '#dc2626' }
  ];

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  setDarkTheme(): void {
    this.themeService.setTheme('dark');
  }

  setColorScheme(colorScheme: ColorScheme): void {
    this.themeService.setColorScheme(colorScheme);
  }

  getCurrentPrimaryColor(): string {
    const colorMap = {
      orange: '#ea580c',
      blue: '#2563eb',
      green: '#16a34a',
      purple: '#9333ea',
      red: '#dc2626'
    };
    return colorMap[this.currentColorScheme()];
  }

  getColorSchemeName(): string {
    const scheme = this.colorSchemes.find(c => c.value === this.currentColorScheme());
    return scheme?.name || 'Naranja';
  }
}
