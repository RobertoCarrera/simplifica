import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors duration-200">
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Completa tu perfil
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Necesitamos algunos datos adicionales para configurar tu cuenta.
        </p>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div class="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 transition-colors duration-200">
          <form class="space-y-6" (submit)="onSubmit($event)">
            
            <!-- Nombre -->
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</label>
              <div class="mt-1">
                <input id="name" name="name" type="text" required [(ngModel)]="name"
                  class="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors duration-200">
              </div>
            </div>

            <!-- Apellidos -->
            <div>
              <label for="surname" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Apellidos</label>
              <div class="mt-1">
                <input id="surname" name="surname" type="text" [(ngModel)]="surname"
                  class="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors duration-200">
              </div>
            </div>

            <!-- Nombre de Empresa -->
            <div>
              <label for="companyName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre de tu Empresa / Organización</label>
              <div class="mt-1">
                <input id="companyName" name="companyName" type="text" required [(ngModel)]="companyName"
                  class="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors duration-200">
              </div>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Se creará una nueva organización con este nombre donde serás el propietario.
              </p>
            </div>

            <div *ngIf="error()" class="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-red-800 dark:text-red-200">{{ error() }}</h3>
                </div>
              </div>
            </div>

            <div>
              <button type="submit" [disabled]="loading()"
                class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200">
                <span *ngIf="loading()">Procesando...</span>
                <span *ngIf="!loading()">Completar Registro</span>
              </button>
            </div>
            
            <div class="text-center mt-4">
              <button type="button" (click)="logout()" class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 underline transition-colors duration-200">
                Cerrar sesión e intentar con otra cuenta
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
})
export class CompleteProfileComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private themeService = inject(ThemeService); // Inject to ensure initialization

  name = '';
  surname = '';
  companyName = '';
  loading = signal(false);
  error = signal<string | null>(null);

  async onSubmit(event: Event) {
    event.preventDefault();
    if (!this.name || !this.companyName) {
      this.error.set('Por favor completa todos los campos requeridos.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const success = await this.auth.completeProfile({
        name: this.name,
        surname: this.surname,
        companyName: this.companyName
      });

      if (success) {
        this.router.navigate(['/inicio']);
      } else {
        this.error.set('No se pudo completar el perfil. Por favor intenta de nuevo.');
      }
    } catch (e: any) {
      console.error('Error completing profile:', e);
      this.error.set(e.message || 'Error al guardar los datos.');
    } finally {
      this.loading.set(false);
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}

