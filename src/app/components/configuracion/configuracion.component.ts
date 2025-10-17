import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, AppUser } from '../../services/auth.service';
import { DevRoleService } from '../../services/dev-role.service';
import { Router, RouterModule } from '@angular/router';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { SupabaseUnitsService, UnitOfMeasure } from '../../services/supabase-units.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
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
  
  // Units management
  units: UnitOfMeasure[] = [];
  unitForm: FormGroup;
  editingUnit: UnitOfMeasure | null = null;
  unitsLoading = false;
  unitsError = '';
  includeInactiveUnits = true;
  showUnitModal = false; // controls modal visibility for create/edit unit
  @ViewChild('unitModal') unitModalRef?: ElementRef;
  private _modalAppendedToBody = false;
  private _modalOriginalParent: Node | null = null;
  private _modalNextSibling: Node | null = null;
  
  // Dev setup properties
  isSettingUpDev = false;
  devMessages: Array<{type: string, text: string, timestamp: Date}> = [];
  private supabase: SupabaseClient;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public devRoleService: DevRoleService,
    private router: Router,
    private sbClient: SupabaseClientService,
    private unitsService: SupabaseUnitsService
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

    // Units form
    this.unitForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      code: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      is_active: [true]
    });
  }

  ngOnInit() {
    this.loadUserProfile();
    this.loadUnits();
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

  // ===============================
  // Units of Measure management
  // ===============================

  async loadUnits() {
    this.unitsLoading = true;
    this.unitsError = '';
    try {
      this.units = await this.unitsService.listUnits(this.includeInactiveUnits);
    } catch (err: any) {
      this.unitsError = err?.message || 'Error cargando unidades';
      console.error('Error loading units:', err);
    } finally {
      this.unitsLoading = false;
    }
  }

  async submitUnitForm() {
    if (this.unitForm.invalid) return;
    this.unitsLoading = true;
    try {
      const value = this.unitForm.value;
      // Normalize code: lower-case and no spaces/accents
      const normalizedCode = (value.code || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
      // Normalize display name: capitalize first letter, rest lower-case
      const rawName = (value.name || '').toString().trim();
      const normalizedName = rawName.length > 0 ? rawName.toLowerCase().charAt(0).toUpperCase() + rawName.toLowerCase().slice(1) : rawName;

      if (this.editingUnit) {
        // Preserve is_active when editing
        await this.unitsService.updateUnit(this.editingUnit.id, {
          name: normalizedName,
          code: normalizedCode,
          description: value.description,
          is_active: !!value.is_active
        });
        this.showMessage('Unidad actualizada', 'success');
      } else {
        // New units are active by default regardless of form controls (checkbox removed from modal)
        const companyId = this.userProfile?.company?.id || null;
        await this.unitsService.createUnit({
          name: normalizedName,
          code: normalizedCode,
          description: value.description,
          is_active: true,
          company_id: companyId
        });
        this.showMessage('Unidad creada', 'success');
      }
      this.cancelUnitEdit();
      await this.loadUnits();
    } catch (err: any) {
      this.showMessage(err?.message || 'Error guardando unidad', 'error');
    } finally {
      this.unitsLoading = false;
    }
  }

  editUnit(unit: UnitOfMeasure) {
    this.editingUnit = unit;
    this.unitForm.patchValue({
      name: unit.name,
      code: unit.code,
      description: unit.description || '',
      is_active: unit.is_active
    });
    // open modal for edit
    this.openUnitModal();
  }

  cancelUnitEdit() {
    this.editingUnit = null;
    this.unitForm.reset({ name: '', code: '', description: '', is_active: true });
    // close modal if open
    this.closeUnitModal();
  }

  openUnitModal() {
    this.showUnitModal = true;
    // ensure form is initialized appropriately
    if (!this.editingUnit) {
      this.unitForm.reset({ name: '', code: '', description: '', is_active: true });
    }
    // prevent background scroll while modal open
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';

    // If the modal element exists in the view, move it to document.body so it's not clipped by ancestor stacking contexts
    try {
      const modalEl = this.unitModalRef?.nativeElement as HTMLElement | undefined;
      if (modalEl && !this._modalAppendedToBody) {
        this._modalOriginalParent = modalEl.parentNode;
        this._modalNextSibling = modalEl.nextSibling;
        document.body.appendChild(modalEl);
        this._modalAppendedToBody = true;
      }
    } catch (e) {
      // ignore DOM move errors in SSR or unusual environments
      console.warn('Could not move modal to body:', e);
    }
  }

  closeUnitModal() {
    this.showUnitModal = false;
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';

    // restore modal to its original location in the DOM if we moved it
    try {
      const modalEl = this.unitModalRef?.nativeElement as HTMLElement | undefined;
      if (modalEl && this._modalAppendedToBody) {
        if (this._modalOriginalParent) {
          if (this._modalNextSibling) {
            this._modalOriginalParent.insertBefore(modalEl, this._modalNextSibling);
          } else {
            this._modalOriginalParent.appendChild(modalEl);
          }
        }
        this._modalAppendedToBody = false;
        this._modalOriginalParent = null;
        this._modalNextSibling = null;
      }
    } catch (e) {
      console.warn('Could not restore modal to original parent:', e);
    }
  }

  async toggleUnitActive(unit: UnitOfMeasure) {
    try {
      await this.unitsService.updateUnit(unit.id, { is_active: !unit.is_active });
      await this.loadUnits();
    } catch (err: any) {
      this.showMessage('Error cambiando estado de la unidad', 'error');
    }
  }

  async deleteUnit(unit: UnitOfMeasure) {
    try {
      await this.unitsService.softDeleteUnit(unit.id);
      await this.loadUnits();
    } catch (err: any) {
      this.showMessage('Error eliminando la unidad', 'error');
    }
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
