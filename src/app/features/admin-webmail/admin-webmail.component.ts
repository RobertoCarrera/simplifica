import { Component, inject, OnInit, signal } from '@angular/core';
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

    constructor() {
        // this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);
    }

    authService = inject(AuthService);
    private get supabase() { return this.authService.client; }

    async ngOnInit() {
        await this.loadDomains();
        await this.loadAllAccounts();
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

    async loadAwsDomains() {
        this.isLoadingAws = true;
        this.showAwsModal = true;
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

        // Double check
        if (this.isDomainImported(cleanName)) return;

        if (!confirm(`¿Vincular el dominio ${cleanName} al sistema?`)) return;

        // Assign to current Admin User for now
        const userId = this.authService.userProfile?.id;

        const { error } = await this.supabase
            .from('mail_domains')
            .insert({
                domain: cleanName,
                assigned_to_user: userId,
                is_verified: true
            });

        if (error) {
            console.error(error);
            alert('Error al importar dominio.');
        } else {
            // alert('Dominio importado correctamente.'); // Remove alert for smoother UX? Or keep distinct toast?
            // User feedback
            this.loadDomains(); // Reload DB list
            // We do NOT close the modal so they can import more.
            // effectively, the UI will update to "Linkado" due to isDomainImported check
        }
    }
}
