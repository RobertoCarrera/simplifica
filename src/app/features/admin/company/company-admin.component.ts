import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { GdprComplianceService } from '../../../services/gdpr-compliance.service';
import { validateUploadFile } from '../../../core/utils/upload-validator';
import { SignaturePadComponent } from '../../../shared/components/signature-pad/signature-pad.component';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-company-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, SignaturePadComponent],
  templateUrl: './company-admin.component.html',
  styleUrls: ['./company-admin.component.scss'],
})
export class CompanyAdminComponent implements OnInit {
  auth = inject(AuthService);
  private toast = inject(ToastService);
  private sbClient = inject(SupabaseClientService);
  private gdprService = inject(GdprComplianceService);

  // Tabs
  tab: 'users' | 'invites' | 'branding' | 'gdpr' = 'users';

  // GDPR form
  gdprForm = {
    company_type: 'autonomo' as 'autonomo' | 'empresa',
    owner_name: '',
    legal_representative_name: '',
    address: '',
    contact_email: '',
    treats_minors_data: false,
  };
  loadingGdpr = signal(false);
  savingGdpr = signal(false);

  // GDPR Dashboard
  gdprStats = signal<any>(null);
  gdprRequests = signal<any[]>([]);
  gdprBreaches = signal<any[]>([]);
  gdprConsents = signal<any[]>([]);
  loadingGdprDashboard = signal(false);
  loadingGdprRequests = signal(false);
  loadingGdprBreaches = signal(false);
  gdprActionBusy = signal(false);

  // Data Retention Settings
  retentionSettings = {
    data_retention_enabled: true,
    retention_client_years: 5,
    retention_booking_years: 3,
    retention_consent_years: 10,
  };
  retentionSettingsLastRun: string | null = null;
  savingRetention = signal(false);
  runningRetentionNow = signal(false);

  // Users state
  users: any[] = [];
  loadingUsers = signal(false);
  currentUserId: string | null = null;
  currentUserRole: 'owner' | 'admin' | 'member' | null = null;

  // Invitations state
  invitations: any[] = [];
  loadingInvitations = signal(false);
  inviteForm = { email: '', role: 'member', message: '' };

  // Busy flag for actions
  busy = signal(false);

  // Computed: pending invitations count
  get pendingInvitationsCount(): number {
    return this.invitations.filter((inv) => this.getInvitationStatus(inv) === 'pending').length;
  }

  async ngOnInit() {
    // Get current user info
    const profile = await firstValueFrom(this.auth.userProfile$.pipe(take(1)));
    this.currentUserId = profile?.id || null;
    this.currentUserRole = (profile?.role as any) || null;

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
      super_admin: 'Super Admin',
      owner: 'Propietario',
      admin: 'Administrador',
      member: 'Miembro',
      professional: 'Profesional',
      agent: 'Agente',
    };
    return labels[role || ''] || role || 'Sin rol';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      accepted: 'Aceptada',
      rejected: 'Rechazada',
      expired: 'Expirada',
      cancelled: 'Cancelada',
    };
    return labels[status] || status;
  }

  // ==========================================
  // PERMISSION CHECKS (UI hints - server validates)
  // ==========================================

  canAssignRole(role: string): boolean {
    // Allow assigning owner role ONLY if the current user is a super_admin
    if (role === 'owner' && !this.auth.userProfileSignal()?.is_super_admin) return false;

    // Fallback for other roles/conditions
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
    this.loadingUsers.set(true);
    try {
      const res = await this.auth.listCompanyUsers();
      if (res.success) this.users = res.users || [];
    } finally {
      this.loadingUsers.set(false);
    }
  }

  async loadInvitations() {
    this.loadingInvitations.set(true);
    try {
      const res = await this.auth.getCompanyInvitations();
      if (res.success) {
        // Filter out client invitations - they are managed in the Clients section
        this.invitations = (res.invitations || []).filter((inv) => inv.role !== 'client');
      } else {
        console.error('Error loading invitations:', res.error);
        // Only show error if it's not a "no company" expected error
        if (res.error !== 'Usuario sin empresa asignada') {
          this.toast.error('Error', 'Error cargando invitaciones: ' + res.error);
        }
      }
    } finally {
      this.loadingInvitations.set(false);
    }
  }

  // ==========================================
  // USER ACTIONS
  // ==========================================

  async changeRole(user: any, newRole: string) {
    // Store original role in case we need to revert
    const originalRole = user._originalRole || user.role;
    user._originalRole = originalRole;

    this.busy.set(true);
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
      this.busy.set(false);
    }
  }

  async toggleActive(user: any) {
    this.busy.set(true);
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
      this.busy.set(false);
    }
  }

  // ==========================================
  // INVITATION ACTIONS
  // ==========================================

  async cancelInvitation(id: string) {
    if (
      !confirm(
        '¿Estás seguro de que quieres cancelar esta invitación? El enlace deixará de funcionar.',
      )
    ) {
      return;
    }

    this.busy.set(true);
    try {
      const { error } = await this.auth.client.rpc('cancel_company_invitation', {
        p_invitation_id: id,
        p_user_id: this.currentUserId,
      });

      if (error) throw error;

      this.toast.success('Éxito', 'Invitación cancelada correctamente');
      await this.loadInvitations();
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al cancelar invitación');
    } finally {
      this.busy.set(false);
    }
  }

  async sendInvite() {
    if (!this.inviteForm.email) return;
    if (this.inviteForm.role === 'owner' && !this.auth.userProfileSignal()?.is_super_admin) {
      this.toast.error('Error', 'No está permitido invitar a más de un propietario');
      return;
    }
    this.busy.set(true);
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
      this.busy.set(false);
    }
  }

  async resend(inv: any) {
    this.busy.set(true);
    try {
      const res = await this.auth.sendCompanyInvite({ email: inv.email, role: inv.role, resend: true });
      if (!res.success) throw new Error(res.error || 'No se pudo reenviar');
      this.toast.success('Éxito', 'Invitación reenviada');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al reenviar invitación');
    } finally {
      this.busy.set(false);
    }
  }

  async copyLink(inv: any) {
    this.busy.set(true);
    try {
      const res = await this.auth.getInvitationLink(inv.id);
      if (!res.success || !res.url) throw new Error(res.error || 'No se pudo obtener enlace');
      await navigator.clipboard.writeText(res.url);
      this.toast.success('Éxito', 'Enlace copiado al portapapeles');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al copiar enlace');
    } finally {
      this.busy.set(false);
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
  savingBranding = signal(false);

  // Owner signature for contracts
  ownerSignature = signal<string | null>(null);
  tempOwnerSignature = signal<string | null>(null);
  showSignatureEdit = signal(false);

  async loadBranding() {
    try {
      const user = await firstValueFrom(this.auth.userProfile$);
      if (!user?.company_id) return;

      const { data, error } = await this.auth.client
        .from('companies')
        .select('name, logo_url, settings, admin_signature')
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
        // Load owner signature
        this.ownerSignature.set(data.admin_signature || null);
      }
    } catch (e) {
      console.error('Error loading branding:', e);
    }
  }

  // Owner Signature Management
  toggleSignatureEdit() {
    console.log('[CompanyAdmin] toggleSignatureEdit, current showSignatureEdit:', this.showSignatureEdit(), 'ownerSignature:', this.ownerSignature() ? 'has sig' : 'no sig');
    if (this.showSignatureEdit()) {
      // Closing edit mode
      this.showSignatureEdit.set(false);
      this.tempOwnerSignature.set(null);
    } else {
      // Opening edit mode - pre-populate with current signature
      this.showSignatureEdit.set(true);
      this.tempOwnerSignature.set(this.ownerSignature());
    }
  }

  onOwnerSignatureChange(signatureData: string | null) {
    // Only update if there's a new signature, otherwise keep the original
    if (signatureData) {
      this.tempOwnerSignature.set(signatureData);
    }
  }

  async saveOwnerSignature(signatureDataUrl: string) {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    try {
      const { error } = await this.sbClient.instance
        .from('companies')
        .update({ admin_signature: signatureDataUrl })
        .eq('id', companyId);

      if (error) throw error;

      this.ownerSignature.set(signatureDataUrl);
      this.tempOwnerSignature.set(null);
      this.showSignatureEdit.set(false);
      this.toast.success('Firma guardada correctamente', 'Se usará automáticamente al firmar documentos');
    } catch (error) {
      console.error('Error saving owner signature:', error);
      this.toast.error('Error al guardar la firma', 'Inténtalo de nuevo');
    }
  }

  async deleteOwnerSignature() {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    try {
      const { error } = await this.sbClient.instance
        .from('companies')
        .update({ admin_signature: null })
        .eq('id', companyId);

      if (error) throw error;

      this.ownerSignature.set(null);
      this.toast.success('Firma eliminada', '');
    } catch (error) {
      console.error('Error deleting owner signature:', error);
      this.toast.error('Error al eliminar la firma', '');
    }
  }

  onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const check = validateUploadFile(file, 5 * 1024 * 1024);
      if (!check.valid) {
        this.toast.error('Error', check.error!);
        event.target.value = '';
        return;
      }
      this.logoFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  async saveBranding() {
    this.savingBranding.set(true);
    try {
      const user = await firstValueFrom(this.auth.userProfile$);
      if (!user?.company_id) throw new Error('No tienes empresa asignada');

      let logoUrl = this.brandingForm.logo_url;

      // 1. Upload Logo if changed
      if (this.logoFile) {
        const fileExt = this.logoFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.company_id}/logos/${fileName}`;

        const { error: uploadError } = await this.auth.client.storage
          .from('public-assets') // Assuming a bucket exists or we create one. 'company-logos' might be better.
          .upload(filePath, this.logoFile);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = this.auth.client.storage.from('public-assets').getPublicUrl(filePath);

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
          secondary_color: this.brandingForm.secondary_color,
        },
      };

      const { error: updateError } = await this.auth.client
        .from('companies')
        .update({
          name: this.brandingForm.name,
          logo_url: logoUrl,
          settings: newSettings,
          updated_at: new Date(),
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
      this.savingBranding.set(false);
    }
  }

  // ==========================================
  // GDPR MANAGEMENT
  // ==========================================

  async loadGdpr() {
    this.loadingGdpr.set(true);
    try {
      await Promise.all([
        this.loadGdprSettings(),
        this.loadGdprDashboard(),
        this.loadRetentionSettings()
      ]);
    } finally {
      this.loadingGdpr.set(false);
    }
  }

  private async loadGdprSettings() {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    const { data, error } = await this.sbClient.instance
      .from('companies')
      .select('company_type, settings')
      .eq('id', companyId)
      .single();

    if (error) {
      console.error('Error loading GDPR data:', error);
      return;
    }

    if (data) {
      this.gdprForm = {
        company_type: data.company_type || 'autonomo',
        owner_name: data.settings?.owner_name || '',
        legal_representative_name: data.settings?.legal_representative_name || '',
        address: data.settings?.address || '',
        contact_email: data.settings?.contact_email || '',
        treats_minors_data: data.settings?.treats_minors_data || false,
      };
    }
  }

  async saveGdpr() {
    this.savingGdpr.set(true);
    try {
      const companyId = this.auth.companyId();
      if (!companyId) return;

      // Get current settings to preserve other settings
      const { data: current } = await this.sbClient.instance
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single();

      const newSettings = {
        ...(current?.settings || {}),
        owner_name: this.gdprForm.owner_name,
        legal_representative_name: this.gdprForm.legal_representative_name,
        address: this.gdprForm.address,
        contact_email: this.gdprForm.contact_email,
        treats_minors_data: this.gdprForm.treats_minors_data,
      };

      const { error } = await this.sbClient.instance
        .from('companies')
        .update({
          company_type: this.gdprForm.company_type,
          settings: newSettings,
        })
        .eq('id', companyId);

      if (error) throw error;

      this.toast.success('Configuración GDPR guardada', 'Los cambios se han aplicado correctamente');
    } catch (e: any) {
      console.error('Error saving GDPR:', e);
      this.toast.error('Error al guardar', e.message || 'No se pudo guardar la configuración GDPR');
    } finally {
      this.savingGdpr.set(false);
    }
  }

  // ==========================================
  // GDPR DASHBOARD
  // ==========================================

  async loadGdprDashboard() {
    this.loadingGdprDashboard.set(true);
    try {
      const [statsResult, requestsResult, breachesResult, consentsResult] = await Promise.all([
        firstValueFrom(this.gdprService.getComplianceDashboard()),
        firstValueFrom(this.gdprService.getAccessRequests()),
        firstValueFrom(this.gdprService.getBreachIncidents()),
        firstValueFrom(this.gdprService.getConsentRecords())
      ]);
      this.gdprStats.set(statsResult);
      this.gdprRequests.set(requestsResult);
      this.gdprBreaches.set(breachesResult);
      this.gdprConsents.set(consentsResult);
    } catch (e) {
      console.error('Error loading GDPR dashboard:', e);
      this.toast.error('Error', 'No se pudo cargar el dashboard GDPR');
    } finally {
      this.loadingGdprDashboard.set(false);
    }
  }

  // ==========================================
  // DATA RETENTION SETTINGS
  // ==========================================

  async loadRetentionSettings() {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    const { data, error } = await this.sbClient.instance
      .from('company_settings')
      .select('data_retention_enabled, retention_client_years, retention_booking_years, retention_consent_years, last_retention_run')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      console.error('Error loading retention settings:', error);
      return;
    }

    if (data) {
      this.retentionSettings = {
        data_retention_enabled: data.data_retention_enabled ?? true,
        retention_client_years: data.retention_client_years ?? 5,
        retention_booking_years: data.retention_booking_years ?? 3,
        retention_consent_years: data.retention_consent_years ?? 10,
      };
      this.retentionSettingsLastRun = data.last_retention_run || null;
    }
  }

  async saveRetentionSettings() {
    this.savingRetention.set(true);
    try {
      const companyId = this.auth.companyId();
      if (!companyId) return;

      const { error } = await this.sbClient.instance
        .from('company_settings')
        .update({
          data_retention_enabled: this.retentionSettings.data_retention_enabled,
          retention_client_years: this.retentionSettings.retention_client_years,
          retention_booking_years: this.retentionSettings.retention_booking_years,
          retention_consent_years: this.retentionSettings.retention_consent_years,
        })
        .eq('company_id', companyId);

      if (error) throw error;

      this.toast.success('Configuración guardada', 'Política de retención actualizada correctamente');
    } catch (e: any) {
      console.error('Error saving retention settings:', e);
      this.toast.error('Error al guardar', e.message || 'No se pudo guardar la configuración de retención');
    } finally {
      this.savingRetention.set(false);
    }
  }

  async runRetentionNow() {
    this.runningRetentionNow.set(true);
    try {
      const companyId = this.auth.companyId();
      if (!companyId) return;

      const { data, error } = await this.sbClient.instance
        .rpc('run_data_retention_now', { p_company_id: companyId });

      if (error) throw error;

      const results = data as Array<{ action: string; records_affected: number }>;
      const totalAffected = results.reduce((sum, r) => sum + r.records_affected, 0);

      if (totalAffected > 0) {
        this.toast.success(
          'Retención ejecutada',
          `${totalAffected} registros afectados`
        );
      } else {
        this.toast.info('Retención ejecutada', 'No se encontraron registros para archivar o eliminar');
      }

      // Refresh last run time
      await this.loadRetentionSettings();
    } catch (e: any) {
      console.error('Error running retention:', e);
      this.toast.error('Error', e.message || 'No se pudo ejecutar la retención de datos');
    } finally {
      this.runningRetentionNow.set(false);
    }
  }

  formatLastRetentionRun(dateStr: string | null): string {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getRequestTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      access: 'Acceso',
      rectification: 'Rectificación',
      erasure: 'Supresión',
      portability: 'Portabilidad',
      restriction: 'Restricción',
      objection: 'Oposición',
    };
    return labels[type] || type;
  }

  getRequestStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      verified: 'Verificado',
      in_progress: 'En curso',
      completed: 'Completado',
      rejected: 'Rechazado',
      received: 'Recibido',
    };
    return labels[status] || status;
  }

  getDaysRemaining(deadlineDate: string | undefined): number | null {
    if (!deadlineDate) return null;
    const now = new Date();
    const deadline = new Date(deadlineDate);
    const diff = deadline.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  getDeadlineClass(deadlineDate: string | undefined, processingStatus: string): string {
    if (processingStatus === 'completed' || processingStatus === 'rejected') return '';
    const days = this.getDaysRemaining(deadlineDate);
    if (days === null) return '';
    if (days < 0) return 'text-red-600 dark:text-red-400 font-semibold';
    if (days <= 5) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-gray-600 dark:text-gray-400';
  }

  async updateRequestStatus(requestId: string, status: 'verified' | 'rejected' | 'in_progress' | 'completed') {
    this.gdprActionBusy.set(true);
    try {
      await firstValueFrom(this.gdprService.updateAccessRequestStatus(requestId, status));
      this.toast.success('Actualizado', `Solicitud marcada como ${this.getRequestStatusLabel(status)}`);
      await this.loadGdprDashboard();
    } catch (e: any) {
      this.toast.error('Error', e.message || 'No se pudo actualizar la solicitud');
    } finally {
      this.gdprActionBusy.set(false);
    }
  }

  getSeverityClass(level: string): string {
    const classes: Record<string, string> = {
      low: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
      medium: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
      high: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
      critical: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
    };
    return classes[level] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  }

  getBreachStatusClass(status: string): string {
    const classes: Record<string, string> = {
      open: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
      investigating: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
      contained: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
      resolved: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    };
    return classes[status] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  }

  getBreachDaysOpen(discoveredAt: string): number {
    const now = new Date();
    const discovered = new Date(discoveredAt);
    return Math.floor((now.getTime() - discovered.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ==========================================
  // OFFBOARDING WIZARD
  // ==========================================

  showOffboardModal = signal(false);
  offboardStep = signal<1 | 2 | 3 | 4>(1);
  offboardTarget = signal<any>(null);
  offboardReason = signal('');
  offboardTransferTo = signal<string>('');
  offboardBookingAction = signal<'transfer' | 'cancel'>('transfer');
  offboardLoading = signal(false);
  offboardResult = signal<any>(null);
  offboardCounts = signal<{ clients: number; futureBookings: number; services: number } | null>(null);
  professionals = signal<any[]>([]);

  async loadProfessionals() {
    const companyId = this.auth.companyId();
    if (!companyId) return;
    const { data, error } = await this.sbClient.instance
      .from('professionals')
      .select('id, display_name, user_id, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    if (!error && data) this.professionals.set(data);
  }

  getTransferTargets() {
    const target = this.offboardTarget();
    if (!target) return this.professionals();
    return this.professionals().filter(p => p.id !== target.professional_id);
  }

  getTransferTargetName(): string {
    const id = this.offboardTransferTo();
    if (!id) return '';
    const p = this.professionals().find(pr => pr.id === id);
    return p?.display_name || '';
  }

  async loadOffboardCounts(professionalId: string) {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    const [clientsRes, bookingsRes, servicesRes] = await Promise.all([
      this.sbClient.instance
        .from('client_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId),
      this.sbClient.instance
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId)
        .gt('start_time', new Date().toISOString())
        .in('status', ['confirmed', 'pending']),
      this.sbClient.instance
        .from('professional_services')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', professionalId),
    ]);

    this.offboardCounts.set({
      clients: clientsRes.count ?? 0,
      futureBookings: bookingsRes.count ?? 0,
      services: servicesRes.count ?? 0,
    });
  }

  async resolveProfessionalId(userId: string): Promise<string | null> {
    const companyId = this.auth.companyId();
    if (!companyId) return null;
    const { data } = await this.sbClient.instance
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single();
    return data?.id || null;
  }

  async startOffboard(user: any) {
    if (!user.professional_id) {
      const profId = await this.resolveProfessionalId(user.id);
      if (!profId) {
        this.toast.error('Error', 'Este usuario no tiene un perfil de profesional registrado');
        return;
      }
      user.professional_id = profId;
    }
    this.offboardTarget.set(user);
    this.offboardStep.set(1);
    this.offboardReason.set('');
    this.offboardTransferTo.set('');
    this.offboardBookingAction.set('transfer');
    this.offboardResult.set(null);
    this.offboardCounts.set(null);
    this.showOffboardModal.set(true);
    await this.loadProfessionals();
  }

  async goToOffboardStep(step: 1 | 2 | 3 | 4) {
    if (step === 3 && this.offboardTarget()) {
      await this.loadOffboardCounts(this.offboardTarget().professional_id);
    }
    this.offboardStep.set(step);
  }

  async executeOffboard() {
    this.offboardLoading.set(true);
    try {
      const target = this.offboardTarget();
      if (!target) throw new Error('No hay profesional seleccionado');

      const transferTo = this.offboardTransferTo();
      const body: any = {
        professional_id: target.professional_id,
        reason: this.offboardReason() || 'Offboarding por decisión administrativa',
        cancel_future_bookings: this.offboardBookingAction() === 'cancel' || !transferTo,
        transfer_bookings: this.offboardBookingAction() === 'transfer' && !!transferTo,
      };
      if (transferTo) {
        body.to_professional_id = transferTo;
      }

      const { data, error } = await this.sbClient.instance.functions.invoke('offboard-professional', { body });

      if (error) throw new Error(error.message || 'Error al dar de baja al profesional');

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) throw new Error(result.error || 'Error en el proceso de baja');

      this.offboardResult.set(result);
      this.offboardStep.set(4);
      this.toast.success('Profesional dado de baja', `${result.professional_name} ha sido dado de baja correctamente`);

      await this.loadUsers();
    } catch (e: any) {
      this.toast.error('Error', e.message || 'No se pudo completar el proceso de baja');
    } finally {
      this.offboardLoading.set(false);
    }
  }

  closeOffboardModal() {
    this.showOffboardModal.set(false);
    this.offboardTarget.set(null);
    this.offboardResult.set(null);
  }
}
