import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../services/supabase.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-emergency-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div class="text-center">
          <h2 class="text-3xl font-bold text-gray-900">🚨 Login de Emergencia</h2>
          <p class="mt-2 text-gray-600">
            Accede con tu email para configurar la contraseña
          </p>
        </div>

        <form (ngSubmit)="emergencyLogin()" class="space-y-6">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              [(ngModel)]="email"
              name="email"
              required
              value="puchu.carrera@gmail.com"
              class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">
              Nueva Contraseña
            </label>
            <input
              type="password"
              id="password"
              [(ngModel)]="password"
              name="password"
              required
              placeholder="Mínimo 6 caracteres"
              class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            [disabled]="isLoading"
            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
          >
            {{ isLoading ? 'Creando cuenta...' : 'Crear Cuenta y Acceder' }}
          </button>
        </form>

        <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 class="text-sm font-medium text-yellow-800">⚠️ Instrucciones:</h3>
          <ol class="mt-2 text-sm text-yellow-700 list-decimal list-inside space-y-1">
            <li>Pon tu email: puchu.carrera&#64;gmail.com</li>
            <li>Crea una contraseña nueva</li>
            <li>Esto creará tu cuenta auth y te conectará</li>
            <li>Después ya podrás usar el login normal</li>
          </ol>
        </div>
      </div>
    </div>
  `
})
export class EmergencyLoginComponent {
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  email = 'puchu.carrera@gmail.com';
  password = '';
  isLoading = false;

  async emergencyLogin() {
    if (!this.email || !this.password) {
      this.toastService.error('Error', 'Por favor completa todos los campos');
      return;
    }

    if (this.password.length < 6) {
      this.toastService.error('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    this.isLoading = true;

    try {
      // Intentar hacer signup (creará el usuario auth si no existe)
      const { data: signUpData, error: signUpError } = await this.supabaseService.executeFunction('', {}) as any;

      // Usar el cliente de supabase directamente para signup
      const supabase = (this.supabaseService as any).supabase;

      const { data, error } = await supabase.auth.signUp({
        email: this.email,
        password: this.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) {
        // Si ya existe, intentar login
        if (error.message.includes('already registered')) {
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: this.email,
            password: this.password
          });

          if (loginError) {
            throw loginError;
          }

          this.toastService.success('¡Éxito!', 'Login exitoso');
          this.router.navigate(['/inicio']);
        } else {
          throw error;
        }
      } else {
        // Signup exitoso
        this.toastService.success('¡Éxito!', 'Cuenta creada. Revisa tu email para confirmar.');

        // Actualizar el auth_user_id en public.users
        if (data.user) {
          await this.supabaseService.executeFunction('connect_auth_user', {
            auth_user_id: data.user.id,
            user_email: this.email
          });
        }
      }

    } catch (error: any) {
      console.error('Emergency login error:', error);
      this.toastService.error('Error', error.message || 'Error al crear la cuenta');
    } finally {
      this.isLoading = false;
    }
  }
}
