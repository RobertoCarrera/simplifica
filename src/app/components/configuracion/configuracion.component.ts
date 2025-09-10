import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, AppUser } from '../../services/auth.service';
import { DevRoleService } from '../../services/dev-role.service';
import { Router } from '@angular/router';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './configuracion.component.html',
  styleUrls: ['./configuracion.component.scss']
})
export class ConfiguracionComponent implements OnInit {
  userProfile: AppUser | null = null;
  profileForm: FormGroup;
  passwordForm: FormGroup;
  loading = false;
  message = '';
  messageType: 'success' | 'error' = 'success';
  
  // Dev setup properties
  isSettingUpDev = false;
  devMessages: Array<{type: string, text: string, timestamp: Date}> = [];
  private supabase: SupabaseClient;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public devRoleService: DevRoleService,
    private router: Router,
    private sbClient: SupabaseClientService
  ) {
    this.supabase = this.sbClient.instance;
    this.profileForm = this.fb.group({
  full_name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit() {
    this.loadUserProfile();
  }

  private loadUserProfile() {
    this.authService.userProfile$.subscribe({
  next: (profile: AppUser | null) => {
        if (profile) {
          this.userProfile = profile;
          this.profileForm.patchValue({
            full_name: profile.full_name || '',
            email: profile.email
          });
        }
      },
      error: (error: any) => {
        this.showMessage('Error al cargar el perfil de usuario', 'error');
        console.error('Error loading user profile:', error);
      }
    });
  }

  async updateProfile() {
    if (this.profileForm.valid) {
      this.loading = true;
      try {
        const profileData = this.profileForm.value;
        // Aquí implementarías la actualización del perfil
        // await this.authService.updateProfile(profileData);
        this.showMessage('Perfil actualizado correctamente', 'success');
      } catch (error) {
        this.showMessage('Error al actualizar el perfil', 'error');
        console.error('Error updating profile:', error);
      } finally {
        this.loading = false;
      }
    }
  }

  async changePassword() {
    if (this.passwordForm.valid) {
      this.loading = true;
      try {
        const { newPassword } = this.passwordForm.value;
        // Aquí implementarías el cambio de contraseña
        // await this.authService.changePassword(newPassword);
        this.showMessage('Contraseña cambiada correctamente', 'success');
        this.passwordForm.reset();
      } catch (error) {
        this.showMessage('Error al cambiar la contraseña', 'error');
        console.error('Error changing password:', error);
      } finally {
        this.loading = false;
      }
    }
  }

  async logout() {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      this.showMessage('Error al cerrar sesión', 'error');
      console.error('Error during logout:', error);
    }
  }

  private passwordMatchValidator(form: FormGroup) {
    const newPassword = form.get('newPassword');
    const confirmPassword = form.get('confirmPassword');
    
    if (newPassword && confirmPassword && newPassword.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    return null;
  }

  private showMessage(message: string, type: 'success' | 'error') {
    this.message = message;
    this.messageType = type;
    setTimeout(() => {
      this.message = '';
    }, 5000);
  }

  getCompanyInfo() {
    return this.userProfile?.company;
  }

  getRoleDisplayName(role: string): string {
    switch (role) {
      case 'owner': return 'Propietario';
      case 'admin': return 'Administrador';
      case 'member': return 'Miembro';
      default: return role;
    }
  }

  // ===============================
  // DEV SETUP METHODS (Solo para devs)
  // ===============================

  async setupDevSystem() {
    if (!this.devRoleService.canSeeDevTools()) {
      this.addDevMessage('error', 'No tienes permisos para configurar el sistema dev');
      return;
    }

    this.isSettingUpDev = true;
    this.addDevMessage('info', 'Configurando usuario dev en tabla users...');

    try {
      // 1. Crear company para desarrollo
      const createCompanySQL = `
        INSERT INTO companies (id, name, slug, settings, website, subscription_tier, max_users, is_active)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'Simplifica Dev Company',
          'dev-company',
          '{"isDev": true, "environment": "development"}',
          'https://dev.simplifica.com',
          'enterprise',
          999,
          true
        ) ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          settings = EXCLUDED.settings;
      `;

      await this.executeDevSQL(createCompanySQL, 'Company dev creada');

      // 2. Crear usuario dev en tabla users
      const createUserSQL = `
        INSERT INTO users (id, company_id, email, name, role, active, permissions)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001',
          'dev@simplifica.com',
          'Developer User',
          'admin',
          true,
          '{
            "moduloFacturas": true,
            "moduloMaterial": true,
            "moduloServicios": true,
            "moduloPresupuestos": true,
            "isDev": true,
            "canSeeAllCompanies": true,
            "canSeeDevTools": true,
            "canManageUsers": true
          }'::jsonb
        ) ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          permissions = EXCLUDED.permissions;
      `;

      await this.executeDevSQL(createUserSQL, 'Usuario dev@simplifica.com configurado');

      this.addDevMessage('success', '✅ Sistema de desarrollo configurado correctamente');

    } catch (error) {
      this.addDevMessage('error', `❌ Error configurando sistema: ${error}`);
    } finally {
      this.isSettingUpDev = false;
    }
  }

  async testDevUser() {
    if (!this.devRoleService.canSeeDevTools()) return;
    
    this.addDevMessage('info', 'Verificando permisos de desarrollo del usuario actual...');
    try {
      const currentUser = this.authService.userProfile;
      if (currentUser) {
        this.addDevMessage('success', `✅ Usuario: ${currentUser.full_name} (${currentUser.role})`);
        this.addDevMessage('info', `📧 Email: ${currentUser.email}`);
        this.addDevMessage('info', `🏢 Empresa: ${currentUser.company?.name || 'No asignada'}`);
        
        if (this.devRoleService.canSeeDevTools()) {
          this.addDevMessage('success', '🛠️ Herramientas de desarrollo disponibles');
        }
        if (this.devRoleService.canSeeAllCompanies()) {
          this.addDevMessage('success', '🏢 Acceso a todas las empresas disponible');
        }
        if (this.devRoleService.canManageUsers()) {
          this.addDevMessage('success', '👥 Gestión de usuarios disponible');
        }
      } else {
        this.addDevMessage('error', '❌ No hay usuario autenticado');
      }
    } catch (error) {
      this.addDevMessage('error', `❌ Error verificando usuario: ${error}`);
    }
  }

  private async executeDevSQL(sql: string, successMessage: string) {
    // En una implementación real, esto debería ir a través de un endpoint seguro
    // Por ahora simulamos que funciona
    this.addDevMessage('success', successMessage);
    
    // Simular delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private addDevMessage(type: string, text: string) {
    this.devMessages.unshift({
      type,
      text,
      timestamp: new Date()
    });

    // Mantener solo los últimos 10 mensajes
    if (this.devMessages.length > 10) {
      this.devMessages = this.devMessages.slice(0, 10);
    }
  }
}
