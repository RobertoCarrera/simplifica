import { Component, inject, signal, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { ContractProgressDialogComponent } from '../../../shared/components/contract-progress-dialog/contract-progress-dialog.component';

@Component({
    selector: 'app-domains',
    standalone: true,
    imports: [CommonModule, FormsModule, ContractProgressDialogComponent],
    templateUrl: './domains.component.html',
    styleUrls: ['./domains.component.scss']
})
export class DomainsComponent implements OnInit {
    private supabase = inject(SupabaseClientService);
    private toast = inject(ToastService);
    private authService = inject(AuthService);

    // Signals
    isAdmin = this.authService.isAdmin;

    @ViewChild('contractDialog') contractDialog!: ContractProgressDialogComponent;

    // State
    myDomains = signal<any[]>([]);

    // Registration State
    isAddingDomain = false;
    newDomainSearch = '';
    checkResult = signal<any>(null);
    isChecking = false;

    // AWS Legacy Import
    showDomainModal = false; // Legacy AWS Modal
    awsDomains = signal<any[]>([]);
    isLoadingAws = false;
    showAwsModal = false; // Controls the list modal

    constructor() {
        // Styling hack for modals if needed, can be removed if css handles it
    }

    async ngOnInit() {
        await this.loadDomains();
    }

    async loadDomains() {
        // CHANGED: Table name 'mail_domains' -> 'domains'
        const { data, error } = await this.supabase.instance
            .from('domains')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading domains:', error);
            // Fallback check
            if (this.isAdmin()) {
                this.loadAwsDomains();
            }
            return;
        }
        this.myDomains.set(data || []);

        // Also load AWS domains if admin, to populate the discovery section
        if (this.isAdmin()) {
            this.loadAwsDomains();
        }
    }

    // ==========================================
    // DOMAIN PURCHASE FLOW
    // ==========================================

    openAddDomainModal() {
        this.isAddingDomain = true;
        this.resetSearch();
        document.body.style.overflow = 'hidden';
    }

    closeAddDomainModal() {
        this.isAddingDomain = false;
        document.body.style.overflow = '';
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

        this.closeAddDomainModal();
        this.contractDialog.startProcess(domain.name);

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

            const userId = this.authService.userProfile?.auth_user_id;

            // CHANGED: Table name 'mail_domains' -> 'domains'
            await this.supabase.instance.from('domains').insert({
                domain: domain.name,
                assigned_to_user: userId,
                // status: 'pending_verification',
                // provider: 'aws',
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
    // AWS IMPORT FLOW
    // ==========================================

    openAwsModal() {
        this.showAwsModal = true;
        this.loadAwsDomains();
    }

    closeAwsModal() {
        this.showAwsModal = false;
    }

    async loadAwsDomains() {
        this.isLoadingAws = true;
        try {
            const { data, error } = await this.supabase.instance.functions.invoke('aws-domains');
            if (error) throw error;
            this.awsDomains.set(data.domains || []);
        } catch (e: any) {
            console.error('Error fetching AWS domains', e);
        } finally {
            this.isLoadingAws = false;
        }
    }

    async importAwsDomain(domainName: string) {
        const exists = this.myDomains().find(d => d.domain === domainName);
        if (exists) {
            this.toast.info('Info', 'Este dominio ya está en tu lista.');
            return;
        }

        if (!confirm(`¿Vincular ${domainName} (existente en AWS) a tu cuenta?`)) return;

        const userId = this.authService.userProfile?.auth_user_id;

        // CHANGED: Table name 'mail_domains' -> 'domains'
        const { error } = await this.supabase.instance
            .from('domains')
            .insert({
                domain: domainName,
                assigned_to_user: userId,
                is_verified: true, // If it's already in AWS under our account, we assume verified for now or let AWS confirm
                // provider: 'aws' matches nothing in DB
            });

        if (error) this.toast.error('Error', 'Error: ' + error.message);
        else {
            this.toast.success('Éxito', 'Dominio importado');
            this.loadDomains();
        }
    }
}
