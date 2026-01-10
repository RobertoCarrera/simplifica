import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GdprComplianceService } from '../../../services/gdpr-compliance.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-portal-invite',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
    <div class="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
      <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        {{ isStaff ? 'Configura tu Cuenta' : 'Portal de Clientes' }}
      </h1>
      
      <div *ngIf="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">Procesando invitación...</p>
      </div>
      
      <div *ngIf="error && !showPasswordForm" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
        <p class="text-red-800 dark:text-red-200">{{ error }}</p>
      </div>
      
      <div *ngIf="success && !showPasswordForm" class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
        <p class="text-green-800 dark:text-green-200">¡Cuenta creada! Redirigiendo al login...</p>
      </div>

      <!-- Password setup form -->
      <div *ngIf="showPasswordForm" class="space-y-6">
        <div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Crea tu contraseña para acceder al portal de clientes
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-500 mb-4">
            Email: <strong>{{ userEmail }}</strong> <span class="badge bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs ml-2">{{ getRoleLabel(invitationData?.role) }}</span>
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
             <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
               Nombre
             </label>
             <input
               type="text"
               [(ngModel)]="name"
               name="name"
               required
               class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
               placeholder="Tu nombre"
               [disabled]="submitting"
             />
          </div>
          <div>
             <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
               Apellidos
             </label>
             <input
               type="text"
               [(ngModel)]="surname"
               name="surname"
               required
               class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
               placeholder="Tus apellidos"
               [disabled]="submitting"
             />
          </div>
        </div>

        <!-- Extra fields for Owner/New Company -->
        <div *ngIf="invitationData?.role === 'owner'" class="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800">
           <h4 class="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-3 flex items-center gap-2">
             <i class="fas fa-building"></i> Datos de tu Nueva Empresa
           </h4>
           <div class="grid grid-cols-1 gap-4">
             <div>
               <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la Empresa</label>
               <input type="text" [(ngModel)]="companyName" name="companyName" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-emerald-500" placeholder="Mi Empresa S.L." required [disabled]="submitting">
             </div>
             <div>
               <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIF / CIF</label>
               <input type="text" [(ngModel)]="companyNif" name="companyNif" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-emerald-500" placeholder="B12345678" required [disabled]="submitting">
             </div>
           </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Contraseña
          </label>
          <input 
            type="password" 
            [(ngModel)]="password"
            (keyup.enter)="submitPassword()"
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            placeholder="Mínimo 6 caracteres"
            [disabled]="submitting"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Confirmar contraseña
          </label>
          <input 
            type="password" 
            [(ngModel)]="passwordConfirm"
            (keyup.enter)="submitPassword()"
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            placeholder="Repite la contraseña"
            [disabled]="submitting"
          />
        </div>

        <!-- GDPR Consent (Only for Clients and Owners) -->
        <div class="space-y-3 pt-2" *ngIf="!isStaff">
            <div class="flex items-start gap-3">
                <div class="flex items-center h-5">
                    <input id="privacy" type="checkbox" [(ngModel)]="privacyAccepted" name="privacy" required
                        class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer">
                </div>
                <div class="ml-1 text-sm">
                    <label for="privacy" class="font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        He leído y acepto la <a href="/privacy-policy" target="_blank" class="text-indigo-600 hover:text-indigo-500 underline">política de privacidad</a> *
                    </label>
                </div>
            </div>

            <div class="flex items-start gap-3">
                <div class="flex items-center h-5">
                    <input id="marketing" type="checkbox" [(ngModel)]="marketingAccepted" name="marketing"
                        class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer">
                </div>
                <div class="ml-1 text-sm">
                    <label for="marketing" class="font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                        Acepto recibir comunicaciones comerciales
                    </label>
                </div>
            </div>
        </div>

        <div *ngIf="passwordError" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p class="text-sm text-red-800 dark:text-red-200">{{ passwordError }}</p>
        </div>

        <button 
          (click)="submitPassword()"
          [disabled]="submitting || !password || !passwordConfirm || !name || !surname || (!privacyAccepted && !isStaff)"
          class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          {{ submitting ? 'Creando cuenta...' : 'Crear cuenta' }}
        </button>

        <p class="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
          Después de crear tu contraseña, podrás iniciar sesión en el portal
        </p>
      </div>
    </div>
  </div>
  `
})
export class PortalInviteComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private gdprService = inject(GdprComplianceService);

  // Form data
  password = '';
  passwordConfirm = '';
  name = '';
  surname = '';
  // New fields for Owner invites (New Company)
  companyName = '';
  companyNif = '';

  // GDPR Consent
  privacyAccepted = false;
  marketingAccepted = false;

  // UI state
  loading = true;
  submitting = false;
  success = false;
  error: string | null = null;
  passwordError = '';
  showPasswordForm = false;
  userEmail = '';

  invitationToken = '';
  invitationData: any = null;

  getRoleLabel(role: string): string {

    const roles: Record<string, string> = {
      'owner': 'Propietario',
      'admin': 'Administrador',
      'member': 'Miembro',
      'client': 'Cliente',
      'professional': 'Profesional',
      'agent': 'Agente'
    };
    return roles[role] || role;
  }

  get isStaff(): boolean {
    const role = this.invitationData?.role;
    // Staff roles: professional, agent, member, admin. 
    // Owner also usually needs consents (contracts), but user asked specifically about these roles.
    // Assuming Owner behaves like 'Client' in terms of needing to accept legal terms initially?
    // Actually, Owner creates the company. They MUST accept terms.
    // Staff are invited by Owner, so they are covered by employment/contract.
    return ['professional', 'agent', 'member', 'admin'].includes(role);
  }

  constructor() {
    this.handle();
  }

  private handle = async () => {
    // 1. Primero manejar magic link si existe (viene del email)
    try {
      const rawHash = window.location.hash;
      const fragment = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;
      const hashParams = new URLSearchParams(fragment);

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        // Establecer sesión desde el magic link
        await this.auth.client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        // Limpiar hash para evitar reprocesamiento
        history.replaceState({}, document.title, window.location.pathname + window.location.search);

        // Esperar un momento para que la sesión se establezca
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      console.warn('Error processing magic link:', e);
    }

    // 2. Obtener el token de invitación
    let token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      const fragment = (window.location.hash || '').replace(/^#/, '');
      const hashParams = new URLSearchParams(fragment);
      token = hashParams.get('token') || token;
    }

    if (!token) {
      // Si no hay token, intentar obtener el email de la sesión actual
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (user?.email) {
        // Buscar invitación pendiente por email
        const invData = await this.getInvitationByEmail(user.email);
        if (invData) {
          this.invitationToken = invData.token;
          this.invitationData = invData;
          this.userEmail = invData.email;
          this.loading = false;
          this.showPasswordForm = true;
          return;
        }
      }

      this.loading = false;
      this.error = 'Falta el token de invitación';
      return;
    }

    this.invitationToken = token;

    // 3. Obtener datos de la invitación
    const invData = await this.getInvitationData(token);
    if (!invData) {
      this.loading = false;
      this.error = 'Invitación no válida o expirada';
      return;
    }

    this.invitationData = invData;
    this.userEmail = invData.email;
    this.loading = false;
    this.showPasswordForm = true;
  }

  private async getInvitationByEmail(email: string): Promise<any> {
    try {
      const { data, error } = await this.auth.client
        .from('company_invitations')
        .select('id, email, company_id, role, status, token')
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  private async getInvitationData(token: string): Promise<any> {
    try {
      // Usar cliente anónimo para lectura pública
      const { data, error } = await this.auth.client
        .from('company_invitations')
        .select('id, email, company_id, role, status')
        .eq('token', token)
        .maybeSingle();

      if (error) {
        console.error('Error fetching invitation:', error);
        return null;
      }

      if (!data) {
        console.warn('No invitation found for token');
        return null;
      }

      return data;
    } catch (e) {
      console.error('Exception fetching invitation:', e);
      return null;
    }
  }

  async submitPassword() {
    this.passwordError = '';

    if (!this.password || this.password.length < 6) {
      this.passwordError = 'La contraseña debe tener al menos 6 caracteres';
      return;
    }

    if (this.password !== this.passwordConfirm) {
      this.passwordError = 'Las contraseñas no coinciden';
      return;
    }

    if (!this.name.trim() || !this.surname.trim()) {
      this.passwordError = 'Por favor completa tu nombre y apellidos';
      return;
    }

    // Validation for New Company
    if (this.invitationData?.role === 'owner') {
      if (!this.companyName.trim()) {
        this.passwordError = 'Por favor introduce el nombre de la empresa';
        return;
      }
      if (!this.companyNif.trim()) {
        this.passwordError = 'Por favor introduce el NIF/CIF de la empresa';
        return;
      }
    }

    if (!this.privacyAccepted && !this.isStaff) {
      this.passwordError = 'Debes aceptar la política de privacidad para continuar';
      return;
    }

    this.submitting = true;

    try {
      // Special flow for New Company Owner
      if (this.invitationData?.role === 'owner') {
        await this.handleOwnerRegistration();
        return;
      }

      // Standard flow (Join existing company)
      await this.handleStandardRegistration();

    } catch (e: any) {
      this.passwordError = e?.message || 'Error inesperado';
      this.submitting = false;
    }
  }

  private async handleOwnerRegistration() {
    // 1. Create User via Edge Function (handles Auth user creation)
    // We reuse create-invited-user but it might need to know this is a special case? No, it just makes the auth user.
    // Actually, we should probably use a dedicated function OR update create-invited-user to handle everything.
    // BUT, simpler approach: 
    // a. Create Auth User (using existing function or SignUp if no session)
    // b. Call RPC 'create_company_and_owner' which takes the auth_id and company details.

    // Check session first
    const { data: { user: existingUser } } = await this.auth.client.auth.getUser();
    let authUserId = existingUser?.id;

    if (!existingUser) {
      // Create user
      const response = await fetch(`${environment.supabase.url}/functions/v1/create-invited-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${environment.supabase.anonKey}`,
          'apikey': environment.supabase.anonKey
        },
        body: JSON.stringify({
          email: this.userEmail,
          password: this.password,
          invitation_token: this.invitationToken
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Error al crear la cuenta');
      }

      // Log in immediately to get the token
      const { data: loginData, error: loginError } = await this.auth.client.auth.signInWithPassword({
        email: this.userEmail,
        password: this.password
      });

      if (loginError || !loginData.user) {
        throw new Error('Error al iniciar sesión tras crear cuenta');
      }
      authUserId = loginData.user.id;
    } else {
      // Just update password if needed? Assuming done via magic link flow above if logged in
      // If logged in via magic link, user is already set. We just need to ensure password is set.
      const { error: updateError } = await this.auth.client.auth.updateUser({
        password: this.password
      });
      if (updateError) throw updateError;
    }

    // 2. Call RPC to create company and link user
    // We need a NEW RPC for this: 'register_company_owner'
    // It should: Create Company, Create User (in public.users) linked to company as Owner, Mark Invitation as Accepted.

    const { data: rpcData, error: rpcError } = await this.auth.client.rpc('register_new_owner_from_invite', {
      p_invitation_token: this.invitationToken,
      p_company_name: this.companyName,
      p_company_nif: this.companyNif,
      p_user_name: this.name,
      p_user_surname: this.surname
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      throw new Error(rpcError.message || 'Error al registrar la empresa');
    }

    // Check logical error returned by function
    if (rpcData && (rpcData as any).success === false) {
      console.error('RPC Logic Error:', rpcData);
      throw new Error((rpcData as any).error || 'Error lógico al registrar la empresa');
    }

    // Verify we have a user ID (should be in rpcData or we use the one we created/logged in with)
    // authUserId is valid here.
    if (authUserId) {
      this.saveConsents(authUserId, this.userEmail);
    }

    this.finishSuccess();
  }

  private async handleStandardRegistration() {
    // Verificar si ya hay una sesión activa del magic link
    const { data: { user: existingUser } } = await this.auth.client.auth.getUser();

    if (existingUser) {
      // Usuario ya tiene sesión del magic link, solo necesita configurar contraseña
      const { error: updateError } = await this.auth.client.auth.updateUser({
        password: this.password
      });

      if (updateError) {
        throw new Error(updateError.message || 'Error al configurar la contraseña');
      }
    } else {
      // No hay sesión - usar Edge Function para crear usuario con email confirmado
      const response = await fetch(`${environment.supabase.url}/functions/v1/create-invited-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${environment.supabase.anonKey}`,
          'apikey': environment.supabase.anonKey
        },
        body: JSON.stringify({
          email: this.userEmail,
          password: this.password,
          invitation_token: this.invitationToken
        })
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Error al crear la cuenta');
      }
    }

    // Esperar un momento para que la sesión se establezca
    await new Promise(r => setTimeout(r, 500));

    // Aceptar la invitación
    const res = await this.auth.acceptInvitation(this.invitationToken);
    if (!res.success) {
      console.error('Invitation acceptance failed:', res.error);
      throw new Error(res.error || 'No se pudo aceptar la invitación. Contacta con soporte.');
    }

    // Update User Profile with Name and Surname
    const { data: { user: currentUser } } = await this.auth.client.auth.getUser();
    if (currentUser) {
      const profile = await this.auth.reloadProfile();
      if (profile) {
        await this.auth.updateProfile(profile.id, {
          name: this.name.trim(),
          surname: this.surname.trim()
        });
      }
    }

    // Save GDPR Consent (Async, don't block success)
    if (currentUser) {
      this.saveConsents(currentUser.id, this.userEmail);
    }

    this.finishSuccess();
  }

  private async saveConsents(authUserId: string, email: string) {
    if (this.privacyAccepted) {
      this.gdprService.recordConsent({
        subject_id: authUserId,
        subject_email: email,
        consent_type: 'data_processing',
        consent_given: true,
        consent_method: 'form',
        purpose: 'Aceptación Política Privacidad en Invitación',
        data_processing_purposes: ['service_delivery', 'contractual']
      }).subscribe();
    }

    if (this.marketingAccepted) {
      this.gdprService.recordConsent({
        subject_id: authUserId,
        subject_email: email,
        consent_type: 'marketing',
        consent_given: true,
        consent_method: 'form',
        purpose: 'Aceptación Comunicaciones Comerciales en Invitación',
        data_processing_purposes: ['marketing']
      }).subscribe();

      // Attempt to sync with Clients table if applicable
      // We try to find a client with this email in the linked company
      const companyId = this.invitationData?.company_id;
      if (companyId) {
        // We use the auth client directly to avoid circular dependency or service complex setup
        const { data: clientData } = await this.auth.client
          .from('clients')
          .select('id')
          .eq('email', email)
          .eq('company_id', companyId)
          .maybeSingle();

        if (clientData) {
          await this.auth.client
            .from('clients')
            .update({ marketing_consent: true, privacy_policy_accepted: true })
            .eq('id', clientData.id);

          // Also log consent for the Client ID specifically to be clean (double record but safer)
          this.gdprService.recordConsent({
            subject_id: clientData.id,
            subject_email: email,
            consent_type: 'marketing',
            consent_given: true,
            consent_method: 'form',
            purpose: 'Sincronización GDPR Cliente (Invitación)',
            data_processing_purposes: ['marketing']
          }).subscribe();
        }
      }
    }
  }

  private async finishSuccess() {
    // Éxito: cerrar sesión y redirigir a login para que pruebe su contraseña
    await this.auth.client.auth.signOut();
    this.success = true;
    this.showPasswordForm = false;

    setTimeout(() => {
      this.router.navigate(['/login'], {
        queryParams: {
          email: this.userEmail,
          message: 'Cuenta configurada correctamente. Inicia sesión.'
        }
      });
    }, 800);
  }
}
