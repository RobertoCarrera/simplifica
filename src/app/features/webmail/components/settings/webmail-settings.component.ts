import { Component, inject, signal, ViewChild, OnInit, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MailStoreService } from '../../services/mail-store.service';
import { MailAccountService } from '../../services/mail-account.service';
import { AuthService } from '../../../../services/auth.service';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { ToastService } from '../../../../services/toast.service';

import { ContractProgressDialogComponent } from '../../../../shared/components/contract-progress-dialog/contract-progress-dialog.component';

@Component({
    selector: 'app-webmail-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, ContractProgressDialogComponent],
    templateUrl: './webmail-settings.component.html',
    styleUrls: ['./webmail-settings.component.scss']
})
export class WebmailSettingsComponent implements OnInit {
    // Services
    private supabase = inject(SupabaseClientService);
    private toast = inject(ToastService);
    store = inject(MailStoreService);
    accountService = inject(MailAccountService);
    authService = inject(AuthService);

    @Output() close = new EventEmitter<void>();
    @ViewChild('contractDialog') contractDialog!: ContractProgressDialogComponent;

    // UX State
    activeTab = signal<'accounts' | 'domains'>('accounts');

    // Accounts Tab State
    accounts = this.store.accounts;
    isAdding = false;
    newAccount = {
        prefix: '',
        domain: '',
        name: '',
        signature: ''
    };

    // Domains Tab State
    myDomains = signal<any[]>([]);

    // Domain Purchase Flow State
    // "Registrar Dominio" Modal (New purchase)
    isAddingDomain = false;
    newDomainSearch = '';
    checkResult = signal<any>(null);
    isChecking = false;

    // AWS Legacy Import State
    // "Dominios en AWS Route53" Modal (Legacy)
    // HTML line 208 uses *ngIf="showDomainModal"
    showDomainModal = false;
    // HTML line 212 uses showAwsModal = false, so we sync or just allow it to be a property
    showAwsModal = false;

    awsDomains = signal<any[]>([]);
    isLoadingAws = false;

    constructor() {
        // Allow modal to cover sidebar
        document.body.style.setProperty('--sidebar-z-index', '10');
    }

    async ngOnInit() {
        await this.loadDomains();
        // Accounts are loaded by the store usually, but we can trigger it
        this.store.loadAccounts();
    }

    // ==========================================
    // ACCOUNTS MANAGMENT
    // ==========================================

    toggleAdd() {
        if (this.myDomains().length === 0) {
            this.toast.warning('Aviso', 'Necesitas tener al menos un dominio asignado para crear cuentas. Ve a la pestaña "Mis Dominios".');
            this.activeTab.set('domains');
            return;
        }
        this.isAdding = !this.isAdding;
    }

    async addAccount() {
        if (!this.newAccount.prefix || !this.newAccount.domain) {
            this.toast.error('Error', 'Debes completar el email');
            return;
        }

        const fullEmail = `${this.newAccount.prefix}@${this.newAccount.domain}`;

        try {
            const userProfile = this.authService.userProfile;
            if (!userProfile) {
                this.toast.error('Error', 'No se pudo identificar al usuario. Recarga la página.');
                return;
            }

            await this.accountService.createAccount({
                user_id: userProfile.id,
                email: fullEmail,
                sender_name: this.newAccount.name || this.newAccount.prefix,
                settings: {
                    signature: this.newAccount.signature,
                    smtp_host: '',
                    smtp_port: 587,
                    smtp_user: fullEmail
                },
                provider: 'ses',
            });

            this.newAccount = { prefix: '', domain: '', name: '', signature: '' };
            this.isAdding = false;
            this.store.loadAccounts();
            this.toast.success('Éxito', 'Cuenta creada correctamente');

        } catch (e) {
            console.error('Error adding account', e);
            this.toast.error('Error', 'Error al crear la cuenta. Revisa la consola.');
        }
    }

    async deleteAccount(id: string) {
        if (!confirm('¿Eliminar esta cuenta?')) return;
        try {
            await this.accountService.deleteAccount(id);
            this.store.loadAccounts();
            this.toast.success('Éxito', 'Cuenta eliminada');
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'Error al eliminar cuenta');
        }
    }

    // ==========================================
    // DOMAINS MANAGEMENT
    // ==========================================

    async loadDomains() {
        const { data, error } = await this.supabase.instance
            .from('mail_domains')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading domains:', error);
            // Try loading AWS domains as fallback/check
            this.loadAwsDomains(); // Background check
            return;
        }
        this.myDomains.set(data || []);
    }

    async loadAwsDomains() {
        this.isLoadingAws = true;
        try {
            const { data, error } = await this.supabase.instance.functions.invoke('aws-domains');
            if (error) throw error;
            console.log('AWS Domains:', data);
            this.awsDomains.set(data.domains || []);
        } catch (e: any) {
            console.error('Error fetching AWS domains', e);
        } finally {
            this.isLoadingAws = false;
        }
    }

    // ==========================================
    // DOMAIN PURCHASE FLOW
    // ==========================================

    // Opens the "Registrar Dominio" modal
    openAddDomainModal() {
        this.isAddingDomain = true;
        this.resetSearch();
        document.body.style.overflow = 'hidden';
    }

    // Closes "Registrar Dominio" modal
    closeAddDomainModal() {
        this.isAddingDomain = false;
        document.body.style.overflow = '';
    }

    // Closes "AWS Import" modal
    closeDomainModal() {
        this.showDomainModal = false;
    }

    resetSearch() {
        this.newDomainSearch = '';
        this.checkResult.set(null);
    }

    async searchDomain() {
        if (!this.newDomainSearch || !this.newDomainSearch.includes('.')) {
            this.toast.error('Error', 'Introduce un dominio válido (ej. miempresa.com)');
            return;
        }

        this.isChecking = true;
        this.checkResult.set(null);

        try {
            const { data, error } = await this.supabase.instance.functions.invoke('aws-manager', {
                body: {
                    action: 'check-availability',
                    payload: { domain: this.newDomainSearch }
                }
            });

            if (error) throw error;

            console.log('AWS Response:', data);

            const status = data.Availability;

            this.checkResult.set({
                domain: this.newDomainSearch,
                name: this.newDomainSearch,
                available: status === 'AVAILABLE',
                price: status === 'AVAILABLE' ? 12.00 : null,
                currency: 'USD',
                status: status
            });

        } catch (error: any) {
            console.error('Error checking domain:', error);
            this.toast.error('Error', 'Error al verificar: ' + (error.message || 'Error desconocido'));
        } finally {
            this.isChecking = false;
        }
    }

    async registerDomain() {
        const domain = this.checkResult();
        if (!domain || !domain.available) return;

        this.closeAddDomainModal(); // Close the purchase modal
        this.contractDialog.startProcess(domain.name); // Start progress dialog

        // SIMULATE PAYMENT
        await new Promise(resolve => setTimeout(resolve, 1500));

        this.contractDialog.updateStep('quote', 'completed');
        this.contractDialog.updateStep('invoice', 'completed');
        this.contractDialog.updateStep('payment', 'completed');

        // REAL REGISTRATION
        this.contractDialog.resultMessage.set('Registrando dominio en AWS... (Esto puede tardar unos segundos)');

        try {
            const { data, error } = await this.supabase.instance.functions.invoke('aws-manager', {
                body: {
                    action: 'register-domain',
                    payload: { domain: domain.name }
                }
            });

            if (error) throw error;

            console.log('Registration Success:', data);

            // Save to DB
            const userId = this.authService.userProfile?.auth_user_id;

            await this.supabase.instance.from('mail_domains').insert({
                domain_name: domain.name,
                assigned_to_user: userId, // Ensure ownership
                status: 'pending_verification',
                provider: 'aws',
                is_verified: false
            });

            this.contractDialog.completeSuccess({
                success: true,
                message: `¡Dominio ${domain.name} registrado con éxito! Recibirás un email de verificación de AWS.`
            });

            this.loadDomains();

        } catch (error: any) {
            console.error('Registration Error:', error);
            this.contractDialog.completeError('payment', 'Error en el registro', error.message || 'Error desconocido al registrar en AWS');
        }
    }

    // ==========================================
    // LEGACY / IMPORT HELPERS
    // ==========================================

    async importAwsDomain(domainName: string) {
        const exists = this.myDomains().find(d => d.domain_name === domainName);
        if (exists) {
            this.toast.info('Info', 'Este dominio ya está en tu lista.');
            return;
        }

        if (!confirm(`¿Vincular ${domainName} (existente en AWS) a tu cuenta?`)) return;

        const userId = this.authService.userProfile?.auth_user_id;

        const { error } = await this.supabase.instance
            .from('mail_domains')
            .insert({
                domain_name: domainName,
                assigned_to_user: userId,
                is_verified: true,
                provider: 'aws'
            });

        if (error) this.toast.error('Error', 'Error: ' + error.message);
        else {
            this.toast.success('Éxito', 'Dominio importado');
            this.loadDomains();
        }
    }
}
