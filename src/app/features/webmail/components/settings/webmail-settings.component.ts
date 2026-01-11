import { Component, inject, signal, OnInit, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MailStoreService } from '../../services/mail-store.service';
import { MailAccountService } from '../../services/mail-account.service';
import { AuthService } from '../../../../services/auth.service';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
    selector: 'app-webmail-settings',
    standalone: true,
    imports: [CommonModule, FormsModule],
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

    // State
    accounts = this.store.accounts;
    activeTab = signal<'accounts' | 'domains'>('accounts'); // Kept for now to avoid breaking template references if any left, but we removed the switcher.
    isAdding = false;
    newAccount = {
        prefix: '',
        domain: '',
        name: '',
        signature: ''
    };

    // Data for Dropdown
    myDomains = signal<any[]>([]);

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
            // Note: Since we removed the domains tab, we can't redirect there.
            // Ideally we should redirect to the new global settings or just show a message.
            // For now, let's just warn and maybe point to the new location conceptually.
            // But wait, myDomains() is also being removed?
            // If myDomains() is removed, this check will fail.
            // We need to decide how to handle the "no domains" check for adding accounts.
            // Ideally the store or service should know if there are domains.
            // For now, I will remove this check or assume the user knows what they are doing,
            // OR I should keep a minimal `loadDomains` just for this check?
            // The prompt said "Locate and remove Domains section".
            // If I remove `myDomains`, I must update `toggleAdd`.

            // Let's rely on the user typing a valid domain or
            // maybe we should keep `myDomains` purely for the dropdown in `addAccount`?
            // The HTML for `addAccount` has a dropdown:
            // <option *ngFor="let d of myDomains()" [value]="d.domain">{{ d.domain }}</option>
            // So we DO need `myDomains` for the "Add Account" form to work comfortably!

            // CORRECT APPROACH:
            // Keep `myDomains` and `loadDomains` (fetching from 'domains' table, not 'mail_domains' if changed? No, `mail_domains` was used here).
            // But assume we only READ them for the dropdown.
            // Remove "AWS Import", "Purchase", "Registration" logic.

            // Wait, the user said "elimínalo de 'Webmail > Configuración', claro."
            // But we still need to select a domain when creating an email account.
            // So I should keep the *reading* of domains for the dropdown, but remove the UI to *manage* them.
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

    // ==========================================
    // HELPERS
    // ==========================================

    async loadDomains() {
        // Updated to use 'domains' table as per migration
        const cid = this.authService.currentCompanyId();

        let query = this.supabase.instance
            .from('domains')
            .select('*')
            .order('created_at', { ascending: false });

        if (cid) {
            query = query.eq('company_id', cid);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error loading domains:', error);
            return;
        }
        this.myDomains.set(data || []);
    }
}

