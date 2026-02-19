import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { UserModulesService } from '../../../services/user-modules.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-company-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-admin.component.html',
  styleUrls: ['./company-admin.component.scss']
})
export class CompanyAdminComponent implements OnInit {
  auth = inject(AuthService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  // Tabs
  tab: 'users' | 'invites' | 'branding' = 'users';

  // Users state
  users: any[] = [];
  loadingUsers = false;
  currentUserId: string | null = null;
  currentUserRole: 'owner' | 'admin' | 'member' | null = null;

  // Invitations state
  invitations: any[] = [];
  loadingInvitations = false;
  inviteForm = { email: '', role: 'member', message: '' };

  // Busy flag for actions
  busy = false;

  // Computed: pending invitations count
  get pendingInvitationsCount(): number {
    return this.invitations.filter(inv => this.getInvitationStatus(inv) === 'pending').length;
  }

  async ngOnInit() {
    // Get current user info
    const profile = await this.auth.userProfile$.pipe(take(1)).toPromise();
    this.currentUserId = profile?.id || null;
    this.currentUserRole = profile?.role as any || null;

    // Admin default role and message
    if (this.currentUserRole === 'admin') {
      this.inviteForm.role = 'owner';
      this.inviteForm.message = 'Hola! Te invito a registrar tu propia empresa en Simplifica. Haz clic en el enlace para crear tu cuenta de propietario.';
    }

    await Promise.all([this.loadUsers(), this.loadInvitations()]);
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  isCurrentUser(user: any): boolean {
    return user.id === this.currentUserId;
  }

  getInvitationStatus(inv: any): string {
    return inv.effective_status || inv.status || 'pending';
  }

  getRoleLabel(role: string | undefined): string {
    const labels: Record<string, string> = {
      'super_admin': 'Super Admin',
      'owner': 'Propietario',
      'admin': 'Administrador',
      'member': 'Miembro',
      'professional': 'Profesional',
      'agent': 'Agente'
    };
    return labels[role || ''] || role || 'Sin rol';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pendiente',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'expired': 'Expirada'
    };
    return labels[status] || status;
  }

  // ==========================================
  // PERMISSION CHECKS (UI hints - server validates)
  // ==========================================

  canAssignRole(role: string): boolean {
    // Only allow assigning non-owner roles. Owners are unique and cannot be assigned here.
    if (role === 'owner') return false;
    // Both Owner and Admin can assign other roles
    return true;
  }

  canChangeRole(user: any): boolean {
    if (this.isCurrentUser(user)) return false;
    // Admin cannot change owner's role
    if (this.currentUserRole === 'admin' && user.role === 'owner') return false;
    return true;
  }

  canToggleActive(user: any): boolean {
    if (this.isCurrentUser(user)) return false;
    // Admin cannot toggle owner's active status
    if (this.currentUserRole === 'admin' && user.role === 'owner') return false;
    return true;
  }

  getRoleChangeTooltip(user: any): string {
    if (this.isCurrentUser(user)) {
      return 'No puedes cambiar tu propio rol';
    }
    if (this.currentUserRole === 'admin' && user.role === 'owner') {
      return 'Un administrador no puede modificar el rol de un owner';
    }
    return '';
  }

  getToggleActiveTooltip(user: any): string {
    if (this.isCurrentUser(user)) {
      return 'No puedes desactivarte a ti mismo';
    }
    if (this.currentUserRole === 'admin' && user.role === 'owner') {
      return 'Un administrador no puede desactivar a un owner';
    }
    return user.active ? 'Desactivar usuario' : 'Activar usuario';
  }

  // ==========================================
  // DATA LOADING
  // ==========================================

  async loadUsers() {
    this.loadingUsers = true;
    try {
      const res = await this.auth.listCompanyUsers();
      if (res.success) this.users = res.users || [];
    } finally {
      this.loadingUsers = false;
    }
  }

  async loadInvitations() {
    this.loadingInvitations = true;
    try {
      const res = await this.auth.getCompanyInvitations();
      if (res.success) {
        // Filter out client invitations - they are managed in the Clients section
        this.invitations = (res.invitations || []).filter(inv => inv.role !== 'client');
      } else {
        console.error('Error loading invitations:', res.error);
        // Only show error if it's not a "no company" expected error
        if (res.error !== 'Usuario sin empresa asignada') {
          this.toast.error('Error', 'Error cargando invitaciones: ' + res.error);
        }
      }
    } finally {
      this.loadingInvitations = false;
    }
  }

  // ==========================================
  // USER ACTIONS
  // ==========================================

  async changeRole(user: any, newRole: string) {
    // Store original role in case we need to revert
    const originalRole = user._originalRole || user.role;
    user._originalRole = originalRole;

    this.busy = true;
    try {
      const res = await this.auth.updateCompanyUser(user.id, { role: newRole as any });
      if (!res.success) {
        // Revert to original role
        user.role = originalRole;
        this.toast.error('Error', res.error || 'No se pudo actualizar el rol');
      } else {
        user._originalRole = newRole;
        this.toast.success('Éxito', 'Rol actualizado correctamente');
      }
    } catch (e: any) {
      user.role = originalRole;
      this.toast.error('Error', e.message || 'Error al actualizar rol');
    } finally {
      this.busy = false;
    }
  }

  async toggleActive(user: any) {
    this.busy = true;
    try {
      const res = await this.auth.updateCompanyUser(user.id, { active: !user.active });
      if (res.success) {
        user.active = !user.active;
        this.toast.success('Éxito', user.active ? 'Usuario activado' : 'Usuario desactivado');
      } else {
        this.toast.error('Error', res.error || 'No se pudo cambiar estado');
      }
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al cambiar estado');
    } finally {
      this.busy = false;
    }
  }

  // ==========================================
  // INVITATION ACTIONS
  // ==========================================

  async cancelInvitation(id: string) {
    if (!confirm('¿Estás seguro de que quieres cancelar esta invitación? El enlace dejará de funcionar.')) {
      return;
    }

    this.busy = true;
    try {
      const { error } = await this.auth.client
        .from('company_invitations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.toast.success('Éxito', 'Invitación cancelada correctamente');
      await this.loadInvitations();
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al cancelar invitación');
    } finally {
      this.busy = false;
    }
  }

  async sendInvite() {
    if (!this.inviteForm.email) return;
    if (this.inviteForm.role === 'owner') {
      this.toast.error('Error', 'No está permitido invitar a más de un propietario');
      return;
    }
    this.busy = true;
    try {
      const res = await this.auth.sendCompanyInvite({
        email: this.inviteForm.email,
        role: this.inviteForm.role,
        message: this.inviteForm.message || undefined,
      });
      if (!res.success) throw new Error(res.error || 'No se pudo enviar la invitación');
      this.toast.success('Éxito', 'Invitación enviada correctamente');
      this.inviteForm = { email: '', role: 'member', message: '' };
      await this.loadInvitations();
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al enviar invitación');
    } finally {
      this.busy = false;
    }
  }

  async resend(inv: any) {
    this.busy = true;
    try {
      const res = await this.auth.sendCompanyInvite({ email: inv.email, role: inv.role });
      if (!res.success) throw new Error(res.error || 'No se pudo reenviar');
      this.toast.success('Éxito', 'Invitación reenviada');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al reenviar invitación');
    } finally {
      this.busy = false;
    }
  }

  async copyLink(inv: any) {
    this.busy = true;
    try {
      const res = await this.auth.getInvitationLink(inv.id);
      if (!res.success || !res.url) throw new Error(res.error || 'No se pudo obtener enlace');
      await navigator.clipboard.writeText(res.url);
      this.toast.success('Éxito', 'Enlace copiado al portapapeles');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al copiar enlace');
    } finally {
      this.busy = false;
    }
  }

  // ==========================================
  // MODULE MANAGEMENT
  // ==========================================
  showModuleModal = false;
  selectedUserModules: any[] = [];
  selectedUserForModules: any = null;

  // Catalogo de modulos (hardcoded for UI consistency)
  availableModules = [
    { key: 'moduloFacturas', name: 'Facturación' },
    { key: 'moduloPresupuestos', name: 'Presupuestos' },
    { key: 'moduloServicios', name: 'Servicios' },
    { key: 'moduloProductos', name: 'Productos y Material' },
    { key: 'moduloSAT', name: 'Tickets' },
    { key: 'moduloAnaliticas', name: 'Analíticas' },
    { key: 'moduloChat', name: 'Chat Interno' }
  ];

  userModulesService = inject(UserModulesService);

  async openModuleModal(user: any) {
    this.selectedUserForModules = user;
    this.showModuleModal = true;
    this.selectedUserModules = [];

    // Fetch directly from DB as we don't have listOtherUserModules yet
    try {
      const { data, error } = await this.auth.client
        .from('user_modules')
        .select('*')
        .eq('user_id', user.id);

      if (!error && data) {
        this.selectedUserModules = data;
      }
    } catch (e) {
      console.warn('Could not fetch user modules', e);
    }
  }

  closeModuleModal() {
    this.showModuleModal = false;
    this.selectedUserForModules = null;
  }

  isModuleEnabled(key: string): boolean {
    const mod = this.selectedUserModules.find(m => m.module_key === key);
    // If owner/admin, default to TRUE if strictly not disabled? 
    // Wait, the new logic says DEFAULT TRUE for Owners.
    // So if no record exists, it should be enabled?
    // Let's mirror the get_effective_modules logic approximately for UI display.
    if (!mod) {
      // If owner/admin and no record, default to true
      if (this.selectedUserForModules?.role === 'owner' || this.selectedUserForModules?.role === 'admin') return true;
      return false;
    }
    return (mod.status === 'activado' || mod.status === 'active' || mod.status === 'enabled');
  }

  async toggleModule(key: string, event: any) {
    if (!this.selectedUserForModules) return;

    const isChecked = event.target.checked;
    const status = isChecked ? 'activado' : 'desactivado';

    // Optimistic Update
    const idx = this.selectedUserModules.findIndex(m => m.module_key === key);
    if (idx >= 0) {
      this.selectedUserModules[idx].status = status;
    } else {
      this.selectedUserModules.push({ module_key: key, status });
    }

    try {
      await this.userModulesService.upsertForUser(this.selectedUserForModules.id, key, status);
    } catch (e) {
      this.toast.error('Error', 'No se pudo actualizar el permiso');
    }
  }

  // ==========================================
  // BRANDING MANAGEMENT
  // ==========================================
  brandingForm = {
    name: '',
    logo_url: '',
    primary_color: '#10B981', // Default Emerald
    secondary_color: '#3B82F6', // Default Blue
  };
  logoFile: File | null = null;
  logoPreview: string | null = null;
  savingBranding = false;

  async loadBranding() {
    try {
      const user = await firstValueFrom(this.auth.userProfile$);
      if (!user?.company_id) return;

      const { data, error } = await this.auth.client
        .from('companies')
        .select('name, logo_url, settings')
        .eq('id', user.company_id)
        .single();

      if (error) throw error;

      if (data) {
        this.brandingForm.name = data.name;
        this.brandingForm.logo_url = data.logo_url || '';
        this.brandingForm.primary_color = data.settings?.branding?.primary_color || '#10B981';
        this.brandingForm.secondary_color = data.settings?.branding?.secondary_color || '#3B82F6';
        if (this.brandingForm.logo_url) {
          this.logoPreview = this.brandingForm.logo_url;
        }
      }
    } catch (e) {
      console.error('Error loading branding:', e);
    }
  }

  onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.logoFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  async saveBranding() {
    this.savingBranding = true;
    try {
      const user = await firstValueFrom(this.auth.userProfile$);
      if (!user?.company_id) throw new Error('No tienes empresa asignada');

      let logoUrl = this.brandingForm.logo_url;

      // 1. Upload Logo if changed
      if (this.logoFile) {
        const fileExt = this.logoFile.name.split('.').pop();
        const fileName = `${user.company_id}_${Date.now()}.${fileExt}`;
        const filePath = `logos/${fileName}`;

        const { error: uploadError } = await this.auth.client.storage
          .from('public-assets') // Assuming a bucket exists or we create one. 'company-logos' might be better.
          .upload(filePath, this.logoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = this.auth.client.storage
          .from('public-assets')
          .getPublicUrl(filePath);

        logoUrl = publicUrl;
      }

      // 2. Update Company
      // We need to fetch current settings first to not overwrite other settings
      const { data: currentData } = await this.auth.client
        .from('companies')
        .select('settings')
        .eq('id', user.company_id)
        .single();

      const currentSettings = currentData?.settings || {};
      const newSettings = {
        ...currentSettings,
        branding: {
          primary_color: this.brandingForm.primary_color,
          secondary_color: this.brandingForm.secondary_color
        }
      };

      const { error: updateError } = await this.auth.client
        .from('companies')
        .update({
          name: this.brandingForm.name,
          logo_url: logoUrl,
          settings: newSettings,
          updated_at: new Date()
        })
        .eq('id', user.company_id);

      if (updateError) throw updateError;

      this.brandingForm.logo_url = logoUrl;
      this.logoFile = null;
      this.toast.success('Éxito', 'Imagen corporativa actualizada');

      // Update local state if needed (e.g. header title)
      // verify if auth service updates profile automatically or we triggers valid re-fetch
      this.auth.reloadProfile();

    } catch (e: any) {
      console.error('Error update branding:', e);
      this.toast.error('Error', 'No se pudo guardar la configuración');
    } finally {
      this.savingBranding = false;
    }
  }
}
