import { Component, OnInit, OnDestroy, ElementRef, ViewChild, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, AppUser } from '../../../services/auth.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { Router, RouterModule } from '@angular/router';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { SupabaseUnitsService, UnitOfMeasure } from '../../../services/supabase-units.service';
import { CompanyAdminComponent } from '../../admin/company/company-admin.component';
import { HelpComponent } from '../../help/help.component';
import { ToastService } from '../../../services/toast.service';
import { UserModulesService, UserModule, ModuleStatus } from '../../../services/user-modules.service';
import { SupabaseSettingsService, type AppSettings, type CompanySettings } from '../../../services/supabase-settings.service';
import { SupabaseModulesService, type EffectiveModule } from '../../../services/supabase-modules.service';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { InvoiceSeries } from '../../../models/invoice.model';
import { firstValueFrom } from 'rxjs';

import { ClientGdprPanelComponent } from '../../customers/components/client-gdpr-panel/client-gdpr-panel.component';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { DataExportImportComponent } from '../data-export-import/data-export-import.component';

@Component({
    selector: 'app-configuracion',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, CompanyAdminComponent, HelpComponent, ClientGdprPanelComponent, DataExportImportComponent],
    templateUrl: './configuracion.component.html',
    styleUrls: ['./configuracion.component.scss']
})
export class ConfiguracionComponent implements OnInit, OnDestroy {
    // UI tabs
    activeTab: 'perfil' | 'empresa' | 'ayuda' | 'ajustes' | 'privacidad' | 'import-export' = 'perfil';
    userProfile: AppUser | null = null;
    profileForm: FormGroup;
    passwordForm: FormGroup;
    loading = false;
    // Migrated to toast service for notifications

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

    // History management for modals
    private popStateListener: any = null;

    // Dev setup properties
    isSettingUpDev = false;
    devMessages: Array<{ type: string, text: string, timestamp: Date }> = [];
    private supabase: SupabaseClient;
    // User modules state
    public userModules: UserModule[] = [];
    // Modules diagnostics
    effectiveModules: EffectiveModule[] | null = null;
    allowedModuleKeysSet: Set<string> | null = null;
    modulesDiagnosticsLoading = false;
    // Settings forms
    appSettingsForm: FormGroup;
    companySettingsForm: FormGroup;
    settingsLoading = false;

    // Invoice series management
    invoiceSeries: InvoiceSeries[] = [];
    seriesLoading = false;
    seriesError: string | null = null;
    creatingInvoiceSeries = false;
    newInvoiceSeries: Partial<InvoiceSeries> = {} as any;

    // Company NIF edit
    companyNifEdit = '';
    savingNif = false;

    // Client role detection - hide tabs and simplify settings for clients
    // Client details (for profile view)
    clientDetails: any | null = null;
    clientDetailsLoading = false;

    get isClient(): boolean {
        return this.authService.userRole() === 'client';
    }

    @ViewChild(ClientGdprPanelComponent) gdprPanel!: ClientGdprPanelComponent;

    constructor(
        private fb: FormBuilder,
        private authService: AuthService,
        public devRoleService: DevRoleService,
        private router: Router,
        private sbClient: SupabaseClientService,
        private unitsService: SupabaseUnitsService,
        private toast: ToastService,
        @Inject(UserModulesService) private userModulesService: UserModulesService,
        @Inject(SupabaseSettingsService) private settingsService: SupabaseSettingsService,
        @Inject(SupabaseModulesService) private modulesService: SupabaseModulesService,
        private invoicesService: SupabaseInvoicesService,
        private customersService: SupabaseCustomersService // Injected service
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

        // Settings forms
        this.appSettingsForm = this.fb.group({
            default_convert_policy: ['manual', [Validators.required]],
            ask_before_convert: [false],
            enforce_globally: [false],
            default_invoice_delay_days: [null],
            // Global tax defaults
            default_prices_include_tax: [false],
            default_iva_enabled: [true],
            default_iva_rate: [21, [Validators.min(0), Validators.max(100)]],
            default_irpf_enabled: [false],
            default_irpf_rate: [15, [Validators.min(0), Validators.max(100)]],
            allow_direct_contracting: [false]
        });
        this.companySettingsForm = this.fb.group({
            convert_policy: [null],
            ask_before_convert: [null],
            enforce_company_defaults: [false],
            default_invoice_delay_days: [null],
            invoice_on_date: [null],
            deposit_percentage: [null],
            // Company tax overrides
            prices_include_tax: [null],
            iva_enabled: [null],
            iva_rate: [null, [Validators.min(0), Validators.max(100)]],
            irpf_enabled: [null],
            irpf_rate: [null, [Validators.min(0), Validators.max(100)]]
        });
    }

    ngOnInit() {
        this.loadUserProfile();
        this.loadUnits();
        this.loadUserModules();
        this.loadModulesCatalog();
        this.loadModulesDiagnostics();
        this.loadSettings();
        this.loadInvoiceSeries();
    }

    ngOnDestroy() {
        // Asegurar que el scroll se restaure si el componente se destruye con modal abierto
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.documentElement.style.overflow = '';

        // Limpiar listener de popstate
        if (this.popStateListener) {
            window.removeEventListener('popstate', this.popStateListener);
            this.popStateListener = null;
        }
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
                    // Cargar NIF de la empresa si existe
                    this.companyNifEdit = (profile.company as any)?.nif || '';
                    // After user profile is available, ensure modules are loaded (in case of timing)
                    this.loadUserModules();

                    // If user is client, load additional details (phone, address, etc.)
                    if (profile.role === 'client' && profile.client_id) {
                        this.clientDetailsLoading = true;
                        this.customersService.getCustomer(profile.client_id).subscribe({
                            next: (customer) => {
                                this.clientDetails = customer;
                                this.clientDetailsLoading = false;
                            },
                            error: (err) => {
                                console.warn('Error loading client details:', err);
                                this.clientDetailsLoading = false;
                            }
                        });
                    }
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
                // 1) Actualizar metadatos en Auth (full_name) si hay sesión
                try {
                    await this.supabase.auth.updateUser({
                        data: { full_name: profileData.full_name }
                    });
                } catch (e) {
                    // No bloquear si falla metadata; seguimos con tabla app
                    console.warn('No se pudo actualizar metadatos de auth:', e);
                }

                // 2) Actualizar tabla public.users (name/surname)
                const userId = this.userProfile?.id;
                if (userId) {
                    const { error } = await this.supabase
                        .from('users')
                        .update({ name: profileData.full_name })
                        .eq('id', userId);
                    if (error) throw error;
                }

                // 3) Refrescar perfil en el servicio para reflejar cambios
                await this.authService.refreshCurrentUser();
                this.showMessage('Perfil actualizado correctamente', 'success');
            } catch (error) {
                this.showMessage('Error al actualizar el perfil', 'error');
                console.error('Error updating profile:', error);
            } finally {
                this.loading = false;
            }
        }
    }

    openRectificationModal() {
        if (this.gdprPanel) {
            this.gdprPanel.openRequestModal('rectification');
        }
    }

    async changePassword() {
        if (this.passwordForm.valid) {
            this.loading = true;
            try {
                const { newPassword } = this.passwordForm.value;
                const result = await this.authService.updatePassword(newPassword);
                if (!result.success) {
                    this.showMessage(result.error || 'Error al cambiar la contraseña', 'error');
                } else {
                    this.showMessage('Contraseña cambiada correctamente', 'success');
                    this.passwordForm.reset();
                }
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
        // Use toast notifications instead of inline status block
        if (type === 'success') {
            this.toast.success('Operación exitosa', message);
        } else {
            this.toast.error('Error', message);
        }
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

        // Añadir entrada al historial para que el botón "atrás" cierre el modal
        history.pushState({ modal: 'unit-form' }, '');

        // Configurar listener de popstate si no existe
        if (!this.popStateListener) {
            this.popStateListener = (event: PopStateEvent) => {
                if (this.showUnitModal) {
                    this.closeUnitModal();
                }
            };
            window.addEventListener('popstate', this.popStateListener);
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

        // Retroceder en el historial solo si hay entrada de modal
        if (window.history.state && window.history.state.modal) {
            window.history.back();
        }

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

    async saveCompanyNif() {
        const companyId = this.userProfile?.company_id;
        if (!companyId) {
            this.showMessage('No se encontró la empresa', 'error');
            return;
        }

        const nif = this.companyNifEdit?.trim().toUpperCase();
        if (!nif || !/^[A-Z0-9]{8,9}$/.test(nif)) {
            this.showMessage('El NIF/CIF debe tener 8-9 caracteres alfanuméricos', 'error');
            return;
        }

        this.savingNif = true;
        try {
            const { error } = await this.supabase
                .from('companies')
                .update({ nif })
                .eq('id', companyId);

            if (error) throw error;

            // Actualizar el objeto local
            if (this.userProfile?.company) {
                (this.userProfile.company as any).nif = nif;
            }

            this.showMessage('NIF guardado correctamente', 'success');
        } catch (err: any) {
            console.error('Error saving NIF:', err);
            this.showMessage('Error al guardar el NIF: ' + (err.message || 'Error desconocido'), 'error');
        } finally {
            this.savingNif = false;
        }
    }

    getRoleDisplayName(role: string): string {
        // Check for Super Admin
        if (this.userProfile?.is_super_admin) return 'Super Admin';

        switch (role) {
            case 'owner': return 'Propietario';
            case 'admin': return 'Administrador';
            case 'member': return 'Equipo';
            case 'client': return 'Cliente';
            default: return role;
        }
    }

    // Catálogo de módulos (labels) y estado desde user_modules (override explícito)
    private _modulesCatalog: Array<{ key: string; name: string }> | null = null;

    // Devuelve lista basada en tabla modules_catalog y estado según user_modules
    get modulesList(): Array<{ key: string; label: string; status: ModuleStatus }> {
        const catalog = this._modulesCatalog || [];
        const statusByKey: Record<string, ModuleStatus> = {} as any;
        for (const um of (this.userModules || [])) {
            statusByKey[um.module_key] = um.status;
        }
        return catalog.map(m => ({
            key: m.key,
            label: m.name,
            // Si no hay fila en user_modules, mostrar Desactivado (según petición)
            status: statusByKey[m.key] || 'desactivado'
        }));
    }

    // Carga el catálogo activo de módulos (labels dinámicos)
    private async loadModulesCatalog() {
        try {
            // FIX: 'modules' table does not exist. Use 'modules_catalog' instead.
            const { data, error } = await this.supabase
                .from('modules_catalog')
                .select('key,name:label') // Alias label as name to match interface
                // .eq('is_active', true) // modules_catalog usually doesn't have is_active, assumed active if present
                .order('key', { ascending: true }); // modules_catalog may not have 'position' column
            if (error) throw error;
            this._modulesCatalog = (data || []).map((d: any) => ({ key: d.key, name: d.name }));
        } catch (e) {
            console.warn('No se pudo cargar modules catalog from "modules" table, trying "modules_catalog"', e);
            try {
                // Some deployments use a separate modules_catalog table (migration -> modules_catalog.key,label)
                const { data: catalogData, error: catalogError } = await this.supabase
                    .from('modules_catalog')
                    .select('key,label')
                    .order('key', { ascending: true });
                if (catalogError) throw catalogError;
                if (catalogData && (catalogData as any[]).length > 0) {
                    this._modulesCatalog = (catalogData || []).map((d: any) => ({ key: d.key, name: d.label }));
                    return;
                }
            } catch (innerErr) {
                console.warn('No se pudo cargar modules_catalog, falling back to defaults', innerErr);
            }

            // Final fallback: static list
            this._modulesCatalog = [
                { key: 'moduloFacturas', name: 'Facturación' },
                { key: 'moduloPresupuestos', name: 'Presupuestos' },
                { key: 'moduloServicios', name: 'Servicios' },
                { key: 'moduloMaterial', name: 'Material' },
                { key: 'moduloSAT', name: 'Tickets' }
            ];
        }
    }

    private async loadUserModules() {
        try {
            // Cargar estados de módulos del usuario actual
            this.userModules = await this.userModulesService.listForCurrentUser();
            // keep modules diagnostics up-to-date if already loaded
            if (this.effectiveModules && !this.allowedModuleKeysSet) {
                this.allowedModuleKeysSet = new Set(this.effectiveModules.filter(m => m.enabled).map(m => m.key));
            }
        } catch (e) {
            console.warn('No se pudieron cargar módulos del usuario:', e);
        }
    }

    // Load effective modules from server and compute allowed keys set
    loadModulesDiagnostics() {
        this.modulesDiagnosticsLoading = true;
        this.modulesService.fetchEffectiveModules().subscribe({
            next: (mods: EffectiveModule[]) => {
                this.effectiveModules = mods;
                this.allowedModuleKeysSet = new Set(mods.filter(m => m.enabled).map(m => m.key));
                this.modulesDiagnosticsLoading = false;
            },
            error: (err) => {
                console.warn('Error cargando módulos efectivos:', err);
                this.effectiveModules = null;
                this.allowedModuleKeysSet = new Set(); // mark as loaded but no permissions
                this.modulesDiagnosticsLoading = false;
            }
        });
    }

    // Expose allowed keys as array for template consumption
    get allowedModuleKeysArray(): string[] | null {
        return this.allowedModuleKeysSet ? Array.from(this.allowedModuleKeysSet) : null;
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

    // ===============================
    // SETTINGS (App & Company)
    // ===============================
    async loadSettings() {
        this.settingsLoading = true;
        try {
            const [app, company] = await Promise.all([
                firstValueFrom(this.settingsService.getAppSettings()),
                firstValueFrom(this.settingsService.getCompanySettings())
            ]);
            if (app) {
                this.appSettingsForm.patchValue({
                    default_convert_policy: app.default_convert_policy || 'manual',
                    ask_before_convert: !!app.ask_before_convert,
                    enforce_globally: !!app.enforce_globally,
                    default_invoice_delay_days: app.default_invoice_delay_days ?? null,
                    default_prices_include_tax: app.default_prices_include_tax ?? false,
                    default_iva_enabled: app.default_iva_enabled ?? true,
                    default_iva_rate: app.default_iva_rate ?? 21,
                    default_irpf_enabled: app.default_irpf_enabled ?? false,
                    default_irpf_rate: app.default_irpf_rate ?? 15
                });
            }
            if (company) {
                this.companySettingsForm.patchValue({
                    convert_policy: company.convert_policy ?? null,
                    ask_before_convert: company.ask_before_convert ?? null,
                    enforce_company_defaults: !!company.enforce_company_defaults,
                    default_invoice_delay_days: company.default_invoice_delay_days ?? null,
                    invoice_on_date: company.invoice_on_date ?? null,
                    deposit_percentage: company.deposit_percentage ?? null,
                    prices_include_tax: company.prices_include_tax ?? null,
                    iva_enabled: company.iva_enabled ?? null,
                    iva_rate: company.iva_rate ?? null,
                    irpf_enabled: company.irpf_enabled ?? null,
                    irpf_rate: company.irpf_rate ?? null
                });
            }
        } catch (e) {
            console.error('Error loading settings', e);
            this.showMessage('Error cargando ajustes', 'error');
        } finally {
            this.settingsLoading = false;
        }
    }

    async saveAppSettings() {
        if (this.appSettingsForm.invalid) return;
        try {
            await firstValueFrom(this.settingsService.upsertAppSettings(this.appSettingsForm.value));
            this.showMessage('Ajustes globales guardados', 'success');
        } catch (e) {
            this.showMessage('Error guardando ajustes globales', 'error');
        }
    }

    async saveCompanySettings() {
        if (this.companySettingsForm.invalid) return;
        try {
            await firstValueFrom(this.settingsService.upsertCompanySettings(this.companySettingsForm.value));
            this.showMessage('Ajustes de empresa guardados', 'success');
        } catch (e) {
            this.showMessage('Error guardando ajustes de empresa', 'error');
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

    // ===============================
    // INVOICE SERIES MANAGEMENT
    // ===============================
    loadInvoiceSeries() {
        this.seriesLoading = true;
        this.seriesError = null;
        this.invoicesService.getAllInvoiceSeries().subscribe({
            next: (rows) => {
                this.invoiceSeries = rows || [];
                this.seriesLoading = false;
            },
            error: (e: any) => {
                this.seriesError = e?.message || 'No se pudieron cargar las series';
                this.seriesLoading = false;
            }
        });
    }

    startCreateSeries() {
        this.creatingInvoiceSeries = true;
        this.newInvoiceSeries = {
            series_code: '',
            series_name: '',
            year: new Date().getFullYear(),
            prefix: '',
            next_number: 1,
            is_active: true,
            is_default: false,
            verifactu_enabled: false
        } as any;
    }

    cancelCreateSeries() {
        this.creatingInvoiceSeries = false;
        this.newInvoiceSeries = {} as any;
    }

    createInvoiceSeries() {
        if (!this.newInvoiceSeries.series_code || !this.newInvoiceSeries.series_name) {
            this.seriesError = 'Código y nombre son obligatorios';
            return;
        }
        this.seriesLoading = true;
        this.invoicesService.createInvoiceSeries(this.newInvoiceSeries).subscribe({
            next: () => {
                this.cancelCreateSeries();
                this.seriesLoading = false;
                this.loadInvoiceSeries();
                this.showMessage('Serie creada correctamente', 'success');
            },
            error: (e: any) => {
                this.seriesError = e?.message || 'Error creando serie';
                this.seriesLoading = false;
            }
        });
    }

    toggleSeriesActive(s: InvoiceSeries) {
        this.seriesLoading = true;
        this.invoicesService.updateInvoiceSeries(s.id, { is_active: !s.is_active }).subscribe({
            next: () => {
                this.seriesLoading = false;
                this.loadInvoiceSeries();
            },
            error: (e: any) => {
                this.seriesError = e?.message || 'Error actualizando serie';
                this.seriesLoading = false;
            }
        });
    }

    toggleSeriesDefault(s: InvoiceSeries) {
        this.seriesLoading = true;
        this.invoicesService.setDefaultInvoiceSeries(s.id).subscribe({
            next: () => {
                this.seriesLoading = false;
                this.loadInvoiceSeries();
                this.showMessage('Serie por defecto actualizada', 'success');
            },
            error: (e: any) => {
                this.seriesError = e?.message || 'Error marcando serie por defecto';
                this.seriesLoading = false;
            }
        });
    }

    toggleSeriesVerifactu(s: InvoiceSeries) {
        this.seriesLoading = true;
        this.invoicesService.updateInvoiceSeries(s.id, { verifactu_enabled: !s.verifactu_enabled }).subscribe({
            next: () => {
                this.seriesLoading = false;
                this.loadInvoiceSeries();
            },
            error: (e: any) => {
                this.seriesError = e?.message || 'Error actualizando VeriFactu';
                this.seriesLoading = false;
            }
        });
    }
}
