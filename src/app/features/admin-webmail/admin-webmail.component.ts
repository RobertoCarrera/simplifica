import { Component, inject, OnInit, signal, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

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
    // private supabase: SupabaseClient;

    activeTab: 'domains' | 'accounts' = 'domains';

    // Domains
    domains = signal<MailDomain[]>([]);
    newDomainName = '';
    isAddingDomain = false;

    // Accounts (System wide view)
    allAccounts = signal<any[]>([]);
    users = signal<any[]>([]);
    selectedUserId = signal<string | null>(null);

    constructor(
        private renderer: Renderer2
    ) {
        // this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);
    }

    authService = inject(AuthService);
    private get supabase() { return this.authService.client; }

    async ngOnInit() {
        await this.loadDomains();
        await this.loadAllAccounts();
        await this.loadUsers();

        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) this.selectedUserId.set(user.id);
    }

    async loadDomains() {
        const { data, error } = await this.supabase
            .from('mail_domains')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) this.domains.set(data);
    }

    async loadAllAccounts() {
        const { data, error } = await this.supabase
            .from('mail_accounts')
            .select('*, users(email)') // Join to see owner
            .order('created_at', { ascending: false });

        if (data) this.allAccounts.set(data);
    }

    async loadUsers() {
        const { data } = await this.supabase
            .from('users')
            .select('id, email, name, role, auth_user_id')
            .order('email');
        if (data) this.users.set(data);
    }

    async addDomain() {
        if (!this.newDomainName) return;

        // Simulate SES verification process
        const { error } = await this.supabase
            .from('mail_domains')
            .insert({
                domain: this.newDomainName,
                is_verified: true // Auto-verify for demo/prototype
            });

        if (error) {
            console.error(error);
            alert('Error al añadir dominio');
        } else {
            this.newDomainName = '';
            this.isAddingDomain = false;
            this.loadDomains();
        }
    }

    async deleteDomain(id: string) {
        if (!confirm('¿Eliminar dominio? Esto puede romper cuentas asociadas.')) return;

        const { error } = await this.supabase
            .from('mail_domains')
            .delete()
            .eq('id', id);

        if (!error) this.loadDomains();
    }

    // --- AWS Integration ---
    awsDomains = signal<any[]>([]);
    isLoadingAws = false;
    showAwsModal = false;

    openAwsModal() {
        this.showAwsModal = true;
        this.renderer.addClass(document.body, 'modal-open');
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

            alert(`Error AWS:\n${msg}\n\nRevisa la consola del navegador para más detalles.`);
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
        const targetPublicId = this.selectedUserId();

        if (!targetPublicId) {
            alert('Por favor, selecciona un usuario para asignar el dominio.');
            return;
        }

        // Find user object to get the real AUTH ID
        const targetUser = this.users().find(u => u.id === targetPublicId);

        if (!targetUser) {
            alert('Error: Usuario no encontrado en la lista local.');
            return;
        }

        // CRITICAL FIX: Use auth_user_id for the FK, not public ID
        const targetAuthId = targetUser.auth_user_id;

        if (!targetAuthId) {
            alert(`Error de Datos: El usuario "${targetUser.email}" no tiene un ID de autenticación vinculado (auth_user_id es null).\n\nEste usuario parece ser un registro antiguo o corrupto. Por favor selecciona otro usuario o contacta soporte.`);
            return;
        }

        const userLabel = targetUser.email || 'usuario seleccionado';

        if (this.isDomainImported(cleanName)) return;

        if (!confirm(`¿Vincular ${cleanName} a ${userLabel}?`)) return;

        const { error } = await this.supabase
            .from('mail_domains')
            .insert({
                domain: cleanName,
                assigned_to_user: targetAuthId, // Correct UUID for auth.users FK
                is_verified: true
            });

        if (error) {
            console.error('Error importing domain:', error);
            if (error.code === '23503') {
                alert(`Error de integridad (FK): El usuario seleccionado no tiene una cuenta de autenticación válida en Supabase.\n\nDetalle: ${error.message}`);
            } else if (error.code === '42501') {
                alert('Error de permisos (RLS): No tienes permisos para asignar dominios. Por favor ejecuta el script SQL proporcionado.');
            } else {
                alert('Error al importar dominio: ' + error.message);
            }
        } else {
            this.loadDomains();
            // Optional: Close modal or show success toast
            this.loadAwsDomains(); // Refresh list to show "Linked" status
        }
    }
}
