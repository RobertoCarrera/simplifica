import { Component, inject, signal, OnInit, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MailStoreService } from '../../services/mail-store.service';
import { MailAccountService } from '../../services/mail-account.service';
import { AuthService } from '../../../../services/auth.service';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { ToastService } from '../../../../services/toast.service';

import { TiptapEditorComponent } from '../../../../shared/ui/tiptap-editor/tiptap-editor.component';

@Component({
    selector: 'app-webmail-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, TiptapEditorComponent],
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
    activeTab = signal<'accounts' | 'domains'>('accounts');
    isAdding = false;
    isEditing = false;
    currentEditId: string | null = null;

    // Unified Form Model
    formModel = {
        prefix: '',
        domain: '',
        email: '', // Logic: if editing, display full email
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
        this.store.loadAccounts();
    }

    // ==========================================
    // ACCOUNTS MANAGMENT
    // ==========================================

    toggleAdd() {
        if (this.isEditing) {
            this.cancelEdit();
            return;
        }
        this.isAdding = !this.isAdding;
        this.resetForm();
    }

    editAccount(acc: any) { // Type as MailAccount ideally
        this.isAdding = false;
        this.isEditing = true;
        this.currentEditId = acc.id;

        // Populate form
        this.formModel = {
            prefix: '', // Not used in edit
            domain: '', // Not used in edit
            email: acc.email,
            name: acc.sender_name || '',
            signature: acc.settings?.signature || ''
        };
    }

    cancelEdit() {
        this.isEditing = false;
        this.currentEditId = null;
        this.resetForm();
    }

    resetForm() {
        this.formModel = { prefix: '', domain: '', email: '', name: '', signature: '' };
    }

    async saveAccount() {
        if (this.isEditing) {
            await this.performUpdate();
        } else {
            await this.performCreate();
        }
    }

    async performCreate() {
        if (!this.formModel.prefix || !this.formModel.domain) {
            this.toast.error('Error', 'Debes completar el email');
            return;
        }

        const fullEmail = `${this.formModel.prefix}@${this.formModel.domain}`;

        try {
            const userProfile = this.authService.userProfile;
            if (!userProfile) return;

            await this.accountService.createAccount({
                user_id: userProfile.id,
                email: fullEmail,
                sender_name: this.formModel.name || this.formModel.prefix,
                settings: {
                    signature: this.formModel.signature,
                    smtp_host: '',
                    smtp_port: 587,
                    smtp_user: fullEmail
                },
                provider: 'ses',
            });

            this.toggleAdd();
            this.store.loadAccounts();
            this.toast.success('Éxito', 'Cuenta creada correctamente');

        } catch (e) {
            console.error('Error adding account', e);
            this.toast.error('Error', 'Error al crear la cuenta.');
        }
    }

    async performUpdate() {
        if (!this.currentEditId) return;

        try {
            // Need to get current account to preserve other settings if needed
            // Or just merge in DB (JSONB merge behavior depends on query, likely replace)
            // Here we construct the new settings object. 
            // Better to fetch current settings first? 
            // For now, I'll update signature and preserve others if I had them in store.

            const currentAcc = this.accounts().find(a => a.id === this.currentEditId);
            const currentSettings = currentAcc?.settings || {};

            await this.accountService.updateAccount(this.currentEditId, {
                sender_name: this.formModel.name,
                settings: {
                    ...currentSettings,
                    signature: this.formModel.signature
                }
            });

            this.cancelEdit();
            this.store.loadAccounts();
            this.toast.success('Éxito', 'Cuenta actualizada');
        } catch (e) {
            console.error('Error updating account', e);
            this.toast.error('Error', 'Error al actualizar cuenta.');
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

