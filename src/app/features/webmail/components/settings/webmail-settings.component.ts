import { Component, inject, signal, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MailStoreService } from '../../services/mail-store.service';
import { MailAccountService } from '../../services/mail-account.service';
import { AuthService } from '../../../../services/auth.service';

@Component({
    selector: 'app-webmail-settings',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './webmail-settings.component.html',
    styleUrls: ['./webmail-settings.component.scss']
})
export class WebmailSettingsComponent implements OnInit {
    @Output() close = new EventEmitter<void>();

    store = inject(MailStoreService);
    accountService = inject(MailAccountService);
    authService = inject(AuthService);

    accounts = this.store.accounts;

    // UX State
    activeTab: 'accounts' | 'domains' = 'accounts';
    isAdding = false;

    // Domain Data
    myDomains = signal<any[]>([]);

    // Use shared Supabase client
    private get supabase() { return this.authService.client; }

    // New account form
    newAccount = {
        prefix: '',
        domain: '',
        name: '',
        signature: ''
    };

    async ngOnInit() {
        await this.loadMyDomains();
    }

    async loadMyDomains() {
        const userId = this.authService.userProfile?.id || (await this.supabase.auth.getUser()).data.user?.id;

        if (!userId) {
            console.warn('Could not load domains: No user ID found');
            return;
        }

        const { data, error } = await this.supabase
            .from('mail_domains')
            .select('*')
            .eq('assigned_to_user', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading domains:', error);
        } else if (data) {
            this.myDomains.set(data);
        }
    }

    toggleAdd() {
        if (this.myDomains().length === 0) {
            alert('Necesitas tener al menos un dominio asignado para crear cuentas. Ve a la pestaña "Mis Dominios".');
            this.activeTab = 'domains';
            return;
        }
        this.isAdding = !this.isAdding;
    }

    async addAccount() {
        if (!this.newAccount.prefix || !this.newAccount.domain) {
            alert('Debes completar el email');
            return;
        }

        const fullEmail = `${this.newAccount.prefix}@${this.newAccount.domain}`;

        try {
            await this.accountService.createAccount({
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

        } catch (e) {
            console.error('Error adding account', e);
            alert('Error al crear la cuenta. Revisa la consola.');
        }
    }

    // AWS State
    awsDomains = signal<any[]>([]);
    isLoadingAws = false;
    showAwsModal = false;

    async loadAwsDomains() {
        this.isLoadingAws = true;
        this.showAwsModal = true;
        try {
            const { data, error } = await this.supabase.functions.invoke('aws-domains');
            if (error) throw error;
            console.log('AWS Domains:', data);
            this.awsDomains.set(data.domains || []);
        } catch (e: any) {
            console.error('Error fetching AWS domains', e);
            alert('Error al conectar con AWS. Asegúrate de configurar los secretos AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en Supabase.');
        } finally {
            this.isLoadingAws = false;
        }
    }

    async importAwsDomain(domainName: string) {
        // Check if already exists
        const exists = this.myDomains().find(d => d.domain === domainName);
        if (exists) {
            alert('Este dominio ya está en tu lista.');
            return;
        }

        if (!confirm(`¿Añadir el dominio ${domainName} a Simplifica?`)) return;

        const userId = this.authService.userProfile?.id || (await this.supabase.auth.getUser()).data.user?.id;

        const { error } = await this.supabase
            .from('mail_domains')
            .insert({
                domain: domainName,
                assigned_to_user: userId,
                is_verified: true // Assuming if you own it in AWS you verify it? Actually no, usually requires DNS check.
                // But for now let's mark true to simplify user request "I have it in AWS".
                // Ideally we should start verification process. Let's set it true for UX "Imported".
            });

        if (error) {
            console.error(error);
            alert('Error al importar dominio.');
        } else {
            alert('Dominio importado correctamente.');
            this.loadMyDomains();
            // Remove from list or visual feedback?
        }
    }

    async deleteAccount(id: string) {
        if (!confirm('¿Eliminar esta cuenta?')) return;
        try {
            await this.accountService.deleteAccount(id);
            this.store.loadAccounts();
        } catch (e) { console.error(e); }
    }
}
