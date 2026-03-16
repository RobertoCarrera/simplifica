import { Component, inject, OnInit, signal, Renderer2, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ThemeService } from '../../services/theme.service';

interface MailDomain {
    id: string;
    domain: string;
    is_verified: boolean;
    created_at: string;
}

@Component({
    selector: 'app-admin-webmail',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './admin-webmail.component.html',
    styleUrl: './admin-webmail.component.scss'
})
export class AdminWebmailComponent implements OnInit {

    // Inline confirm modal state
    showConfirmModal = signal(false);
    confirmConfig = signal<{ title: string; message: string; icon: string; iconColor: string; confirmText: string; cancelText: string }>({ title: '', message: '', icon: '', iconColor: 'blue', confirmText: 'Confirmar', cancelText: 'Cancelar' });
    private confirmResolve: ((value: boolean) => void) | null = null;

    activeTab: 'domains' | 'accounts' | 'inbound-logs' = 'domains';

    // Domains
    domains = signal<MailDomain[]>([]);
    newDomainName = '';
    isAddingDomain = false;

    // Accounts (System wide view)
    allAccounts = signal<any[]>([]);
    users = signal<any[]>([]);
    selectedUserId = signal<string | null>(null);
    companies = signal<any[]>([]);
    selectedCompanyId = signal<string | null>(null);

    // Inbound Audit Logs
    inboundLogs = signal<any[]>([]);
    isLoadingLogs = signal(false);

    constructor(
        private renderer: Renderer2
    ) {
        // this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);
    }

    authService = inject(AuthService);
    toast = inject(ToastService);
    themeService = inject(ThemeService);
    private get supabase() { return this.authService.client; }

    async ngOnInit() {
        await this.loadDomains();
        await this.loadAllAccounts();
        await this.loadUsers();
        await this.loadCompanies();
        await this.loadInboundLogs();

        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.selectedUserId.set(user.id);
    }

    async loadDomains() {
        const { data, error } = await this.supabase
            .from('domains')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        if (data) this.domains.set(data);
    }

    async loadAllAccounts() {
        const { data, error } = await this.supabase
            .from('mail_accounts')
            .select('*, users(email)') // Join to see owner
            .order('created_at', { ascending: false })
            .limit(500);

        if (data) this.allAccounts.set(data);
    }

    async loadUsers() {
        const { data } = await this.supabase
            .from('users')
            .select('id, email, name, auth_user_id')
            .order('email')
            .limit(1000);
        if (data) this.users.set(data);
    }

    async loadCompanies() {
        const { data } = await this.supabase
            .from('companies')
            .select('id, name')
            .order('name')
            .limit(500);
        if (data) this.companies.set(data);
    }

    async loadInboundLogs() {
        this.isLoadingLogs.set(true);
        const { data, error } = await this.supabase
            .from('inbound_email_audit')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error al cargar logs:', error.message);
            this.toast.error('Error al cargar logs', 'No se pudieron cargar los registros.');
        } else if (data) {
            this.inboundLogs.set(data);
        }
        this.isLoadingLogs.set(false);
    }

    async reprocessEmail(log: any) {
        if (!log.s3_key) {
            this.toast.error('Error', 'Este log no tiene una referencia a S3 válida.');
            return;
        }

        const confirmed = await this.openConfirm({
            title: 'Re-procesar Correo',
            message: `¿Intentar procesar de nuevo el correo "${log.subject}"?`,
            icon: 'fas fa-sync',
            iconColor: 'blue',
            confirmText: 'Re-procesar',
            cancelText: 'Cancelar'
        });

        if (!confirmed) return;

        this.toast.info('Procesando', 'Re-intentando procesamiento...');

        try {
            // We simulate the Lambda behavior by calling the Edge Function with the stored metadata
            // But we need the Body. Since the Edge Function logic is designed to process the JSON payload,
            // we have a problem: the parsed body is NOT in the audit log (for GDPR).
            
            // OPTION A: Add a "reprocess" trigger to the Edge Function that fetches from S3 itself.
            // This is the most robust way.
            
            const { data, error } = await this.supabase.functions.invoke('process-inbound-email', {
                body: { 
                    action: 'reprocess',
                    s3_key: log.s3_key,
                    messageId: log.message_id
                }
            });

            if (error) throw error;

            this.toast.success('Éxito', 'Correo re-procesado correctamente.');
            this.loadInboundLogs();
        } catch (e: any) {
            this.toast.error('Error al re-procesar', e.message);
        }
    }

    // Domain Search State
    isChecking = false;
    checkResult = signal<{ domain: string, available: boolean, price?: string } | null>(null);

    async checkAvailability() {
        if (!this.newDomainName) return;

        this.isChecking = true;
        this.checkResult.set(null);

        try {
            const { data, error } = await this.supabase.functions.invoke('aws-manager', {
                body: {
                    action: 'check-availability',
                    payload: { domain: this.newDomainName }
                }
            });

            if (error) throw error;

            // AWS Response: { Availability: 'AVAILABLE' | 'UNAVAILABLE' | ... }
            const isAvailable = data.Availability === 'AVAILABLE';

            this.checkResult.set({
                domain: this.newDomainName,
                available: isAvailable,
                price: isAvailable ? '12.00 USD/año' : undefined // Mock price until we query pricing API
            });

        } catch (e: any) {
            console.error('Error checking availability:', e);
            alert('Error al comprobar dominio: ' + e.message);
        } finally {
            this.isChecking = false;
        }
    }

    async registerDomain() {
        const result = this.checkResult();
        if (!result || !result.available) return;

        // Logic to proceed to purchase (Phase 3)
        // For now, we simulate the "Buy" -> "Add to DB" flow
        if (!confirm(`¿Comprar y registrar ${result.domain} por ${result.price}?`)) return;

        // Simulate SES verification process
        const { error } = await this.supabase
            .from('domains')
            .insert({
                domain: result.domain,
                // In a real flow, assigned_to_user would come from context or current admin
                // For admin panel, maybe ask "Assign to whom?" or default to self/admin
                is_verified: false, // Starts unverified until automation kicks in
                // status: 'registering' (if we had that column)
            });

        if (error) {
            console.error(error);
            alert('Error al registrar dominio en BD');
        } else {
            alert('Dominio registrado (Simulación). El proceso de aprovisionamiento comenzaría ahora.');
            this.newDomainName = '';
            this.isAddingDomain = false;
            this.checkResult.set(null);
            this.loadDomains();
        }
    }

    async deleteDomain(id: string) {
        const confirmed = await this.openConfirm({
            title: 'Eliminar Dominio',
            message: '¿Desvincular y eliminar este dominio? Esto romperá las cuentas de correo asociadas.',
            icon: 'fas fa-exclamation-triangle',
            iconColor: 'red',
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar'
        });
        if (!confirmed) return;

        // Fetch the domain first to know its name and company_id for the notification
        const { data: domainObj, error: fetchError } = await this.supabase
            .from('domains')
            .select('domain, company_id')
            .eq('id', id)
            .single();

        if (fetchError || !domainObj) {
            this.toast.error('Error', 'No se pudo encontrar el dominio antes de eliminarlo.');
            return;
        }

        const { error } = await this.supabase
            .from('domains')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error al eliminar dominio:', error.message);
            this.toast.error('Error al intentar eliminar', 'No se pudo eliminar el dominio.');
        } else {
            this.toast.success('Dominio eliminado', `El dominio ${domainObj.domain} se ha desvinculado correctamente.`);
            
            if (domainObj.company_id) {
                await this.notifyCompany(
                    domainObj.company_id,
                    'Dominio desvinculado',
                    `El dominio ${domainObj.domain} ha sido desvinculado de tu empresa por un administrador.`
                );
            }

            this.loadDomains();
            this.loadAwsDomains(); // Refresh AWS list to allow importing it again
        }
    }

    private async notifyCompany(companyId: string, title: string, content: string) {
        // Find users belonging to this company to notify them
        const { data: companyUsers } = await this.supabase
            .from('users')
            .select('id')
            .eq('company_id', companyId);

        if (companyUsers && companyUsers.length > 0) {
            const notificationsToInsert = companyUsers.map(u => ({
                company_id: companyId,
                recipient_id: u.id,
                title: title,
                content: content,
                type: 'info',
                is_read: false,
                reference_id: companyId // Fix: reference_id is NOT NULL and requires a valid UUID
            }));

            await this.supabase.from('notifications').insert(notificationsToInsert);
        }
    }

    // --- Inline Confirm Modal ---
    openConfirm(config: { title: string; message: string; icon: string; iconColor: string; confirmText: string; cancelText: string }): Promise<boolean> {
        this.confirmConfig.set(config);
        this.showConfirmModal.set(true);
        return new Promise<boolean>((resolve) => {
            this.confirmResolve = resolve;
        });
    }

    onConfirm() {
        this.showConfirmModal.set(false);
        if (this.confirmResolve) {
            this.confirmResolve(true);
            this.confirmResolve = null;
        }
    }

    onCancelConfirm() {
        this.showConfirmModal.set(false);
        if (this.confirmResolve) {
            this.confirmResolve(false);
            this.confirmResolve = null;
        }
    }

    // --- AWS Integration ---
    awsDomains = signal<any[]>([]);
    isLoadingAws = false;
    showAwsModal = false;
    
    // Searchable Select State
    searchCompanyTerm = signal('');
    isCompanyDropdownOpen = signal(false);
    
    filteredCompanies = computed(() => {
        const term = this.searchCompanyTerm().toLowerCase();
        return this.companies().filter(c => c.name.toLowerCase().includes(term));
    });

    selectedCompanyName = computed(() => {
        const id = this.selectedCompanyId();
        if (!id) return 'Seleccionar Empresa';
        const c = this.companies().find(comp => comp.id === id);
        return c ? c.name : 'Seleccionar Empresa';
    });

    toggleCompanyDropdown() {
        this.isCompanyDropdownOpen.update(v => !v);
    }

    selectCompany(id: string | null) {
        this.selectedCompanyId.set(id);
        this.isCompanyDropdownOpen.set(false);
        this.searchCompanyTerm.set('');
    }

    openAwsModal() {
        this.showAwsModal = true;
        this.renderer.addClass(document.body, 'modal-open');
        this.loadCompanies();
        this.loadAwsDomains();
    }

    closeAwsModal() {
        this.showAwsModal = false;
        this.renderer.removeClass(document.body, 'modal-open');
        this.awsDomains.set([]);
    }

    async loadAwsDomains() {
        // Method triggered by openAwsModal now
        this.isLoadingAws = true;
        try {
            const { data, error } = await this.supabase.functions.invoke('aws-domains');
            if (error) throw error; // This error object might contain the response body
            console.log('AWS Domains:', data);
            this.awsDomains.set(data.domains || []);
        } catch (e: any) {
            console.error('Error fetching AWS domains', e);
            // Try to extract meaningful message
            let msg = 'Error desconocido al conectar con AWS.';
            if (e && e.message) msg = e.message;
            if (e && e.context && e.context.json) {
                // FunctionsHttpError often has context about the response
                try {
                    const body = await e.context.json();
                    if (body.error) msg = body.error + (body.details ? '\n' + body.details : '');
                } catch { }
            }

            this.toast.error('Error AWS', `${msg}\n\nRevisa la consola del navegador para más detalles.`);
        } finally {
            this.isLoadingAws = false;
        }
    }

    // Helper to check if domain exists in the DB list
    isDomainImported(domainName: string): boolean {
        // Strip trailing dot if present in AWS response
        const cleanName = domainName.replace(/\.$/, '');
        return this.domains().some(d => d.domain.toLowerCase() === cleanName.toLowerCase());
    }

    async importAwsDomain(domainName: string) {
        const cleanName = domainName.replace(/\.$/, '');
        const targetCompanyId = this.selectedCompanyId();

        if (!targetCompanyId) {
            this.toast.warning('Atención', 'Por favor, selecciona una empresa para asignar el dominio.');
            return;
        }

        const targetCompany = this.companies().find(c => c.id === targetCompanyId);
        const companyLabel = targetCompany?.name || 'empresa seleccionada';

        if (this.isDomainImported(cleanName)) return;

        // Hide the AWS modal, show inline confirm
        this.closeAwsModal();

        const confirmed = await this.openConfirm({
            title: 'Vincular Dominio',
            message: `¿Vincular de forma permanente el dominio ${cleanName} a la empresa ${companyLabel}?`,
            icon: 'fab fa-aws',
            iconColor: 'amber',
            confirmText: 'Vincular',
            cancelText: 'Cancelar'
        });

        if (!confirmed) {
            this.openAwsModal(); // Re-open properly if cancelled
            return;
        }

        const { error } = await this.supabase
            .from('domains')
            .insert({
                domain: cleanName,
                company_id: targetCompanyId, 
                is_verified: true,
                provider: 'aws',
                status: 'verified'
            });

        if (error) {
            console.error('Error importing domain:', error);
            if (error.code === '23503') {
                this.toast.error('Error de integridad', 'El usuario seleccionado no tiene una cuenta de autenticación válida.');
            } else if (error.code === '42501') {
                this.toast.error('Error de permisos (RLS)', 'No tienes permisos para asignar dominios. Por favor ejecuta el script SQL proporcionado.');
            } else {
                console.error('Error al importar dominio:', error.message);
                this.toast.error('Error al importar dominio', 'No se pudo vincular el dominio.');
            }
        } else {
            this.toast.success('¡Éxito!', `Dominio ${cleanName} vinculado correctamente a la empresa ${companyLabel}`);
            
            await this.notifyCompany(
                targetCompanyId,
                'Nuevo dominio asignado',
                `El dominio ${cleanName} ha sido vinculado a tu empresa.`
            );

            this.loadDomains();
            this.loadAwsDomains(); // Refresh list to show "Linked" status
        }
    }
}
