import { Component, inject, OnInit, signal, Renderer2, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
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
    imports: [CommonModule, FormsModule, TranslocoPipe],
    templateUrl: './admin-webmail.component.html',
    styleUrl: './admin-webmail.component.scss'
})
export class AdminWebmailComponent implements OnInit {

    // Inline confirm modal state
    showConfirmModal = signal(false);
    confirmConfig = signal<{ title: string; message: string; icon: string; iconColor: string; confirmText: string; cancelText: string }>({ title: '', message: '', icon: '', iconColor: 'blue', confirmText: '', cancelText: '' });
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

    // Account stats (aggregated from inbound_email_audit)
    accountStats = signal<Map<string, { total: number; delivered: number; errors: number; bounced: number }>>(new Map());

    // Edit account modal
    editingAccount = signal<any | null>(null);
    showEditModal = signal(false);
    editForm = signal({ sender_name: '', is_active: true, user_id: '' });
    companyMembers = signal<any[]>([]); // professionals for reassignment
    isLoadingMembers = signal(false);

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
    private translocoService = inject(TranslocoService);
    private get supabase() { return this.authService.client; }

    async ngOnInit() {
        await this.loadDomains();
        await this.loadAllAccounts();
        await this.loadUsers();
        await this.loadCompanies();
        await this.loadInboundLogs();
        await this.loadAccountStats();

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
            .select('*, users(id, email, name, surname)')
            .order('created_at', { ascending: false });

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
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorLoadingLogs'), this.translocoService.translate('adminWebmail.toast.errorLoadingLogsMsg'));
        } else if (data) {
            this.inboundLogs.set(data);
        }
        this.isLoadingLogs.set(false);
    }

    async loadAccountStats() {
        // Aggregate stats from inbound_email_audit per recipient (email account)
        const { data, error } = await this.supabase
            .from('inbound_email_audit')
            .select('recipient, status')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

        if (error || !data) return;

        const statsMap = new Map<string, { total: number; delivered: number; errors: number; bounced: number }>();
        for (const row of data) {
            const email = row.recipient as string;
            if (!email) continue;
            if (!statsMap.has(email)) {
                statsMap.set(email, { total: 0, delivered: 0, errors: 0, bounced: 0 });
            }
            const s = statsMap.get(email)!;
            s.total++;
            if (row.status === 'delivered') s.delivered++;
            else if (row.status === 'account_not_found') s.bounced++;
            else if (row.status === 'error') s.errors++;
        }
        this.accountStats.set(statsMap);
    }

    async loadCompanyMembers() {
        this.isLoadingMembers.set(true);
        const companyId = this.authService.currentCompanyId();
        if (!companyId) {
            this.isLoadingMembers.set(false);
            return;
        }
        const { data, error } = await this.supabase
            .from('users')
            .select('id, email, name, surname')
            .eq('company_id', companyId)
            .order('email');

        if (data) this.companyMembers.set(data);
        this.isLoadingMembers.set(false);
    }

    getAccountStats(email: string) {
        return this.accountStats().get(email) ?? { total: 0, delivered: 0, errors: 0, bounced: 0 };
    }

    openEditModal(account: any) {
        this.editingAccount.set(account);
        this.editForm.set({
            sender_name: account.sender_name || '',
            is_active: account.is_active ?? true,
            user_id: account.user_id || ''
        });
        this.showEditModal.set(true);
        this.loadCompanyMembers();
        this.renderer.addClass(document.body, 'modal-open');
    }

    closeEditModal() {
        this.showEditModal.set(false);
        this.editingAccount.set(null);
        this.renderer.removeClass(document.body, 'modal-open');
    }

    async updateAccount() {
        const account = this.editingAccount();
        if (!account) return;

        const form = this.editForm();
        const confirmed = await this.openConfirm({
            title: this.translocoService.translate('adminWebmail.confirm.saveChanges.title'),
            message: this.translocoService.translate('adminWebmail.confirm.saveChanges.message', { email: account.email }),
            icon: 'fas fa-save',
            iconColor: 'blue',
            confirmText: this.translocoService.translate('adminWebmail.confirm.saveChanges.confirmText'),
            cancelText: this.translocoService.translate('adminWebmail.confirm.saveChanges.cancelText')
        });

        if (!confirmed) return;

        const { error } = await this.supabase
            .from('mail_accounts')
            .update({
                sender_name: form.sender_name,
                is_active: form.is_active,
                user_id: form.user_id,
                updated_at: new Date().toISOString()
            })
            .eq('id', account.id);

        if (error) {
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorUpdatingAccount'), error.message);
        } else {
            this.toast.success(this.translocoService.translate('adminWebmail.toast.accountUpdated'), this.translocoService.translate('adminWebmail.toast.accountUpdatedMsg', { email: account.email }));
            this.closeEditModal();
            await this.loadAllAccounts();
        }
    }

    async deleteAccount(account: any) {
        const confirmed = await this.openConfirm({
            title: this.translocoService.translate('adminWebmail.confirm.deleteAccount.title'),
            message: this.translocoService.translate('adminWebmail.confirm.deleteAccount.message', { email: account.email }),
            icon: 'fas fa-exclamation-triangle',
            iconColor: 'red',
            confirmText: this.translocoService.translate('adminWebmail.confirm.deleteAccount.confirmText'),
            cancelText: this.translocoService.translate('adminWebmail.confirm.deleteAccount.cancelText')
        });

        if (!confirmed) return;

        const { error } = await this.supabase
            .from('mail_accounts')
            .delete()
            .eq('id', account.id);

        if (error) {
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorDeletingAccount'), error.message);
        } else {
            this.toast.success(this.translocoService.translate('adminWebmail.toast.accountDeleted'), this.translocoService.translate('adminWebmail.toast.accountDeletedMsg', { email: account.email }));
            await this.loadAllAccounts();
        }
    }

    async reprocessEmail(log: any) {
        if (!log.s3_key) {
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorNoS3Reference'), this.translocoService.translate('adminWebmail.toast.errorNoS3ReferenceMsg'));
            return;
        }

        const confirmed = await this.openConfirm({
            title: this.translocoService.translate('adminWebmail.confirm.reprocessEmail.title'),
            message: this.translocoService.translate('adminWebmail.confirm.reprocessEmail.message', { subject: log.subject }),
            icon: 'fas fa-sync',
            iconColor: 'blue',
            confirmText: this.translocoService.translate('adminWebmail.confirm.reprocessEmail.confirmText'),
            cancelText: this.translocoService.translate('adminWebmail.confirm.reprocessEmail.cancelText')
        });

        if (!confirmed) return;

        this.toast.info(this.translocoService.translate('adminWebmail.toast.processing'), this.translocoService.translate('adminWebmail.toast.processingRetryMsg'));

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

            this.toast.success(this.translocoService.translate('adminWebmail.toast.successReprocess'), this.translocoService.translate('adminWebmail.toast.successReprocessMsg'));
            this.loadInboundLogs();
        } catch (e: any) {
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorReprocessing'), e.message);
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
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorAws'), 'Error al comprobar dominio: ' + e.message);
        } finally {
            this.isChecking = false;
        }
    }

    async registerDomain() {
        const result = this.checkResult();
        if (!result || !result.available) return;

        // Logic to proceed to purchase (Phase 3)
        // For now, we simulate the "Buy" -> "Add to DB" flow
        const confirmed = await this.openConfirm({
            title: this.translocoService.translate('adminWebmail.toast.confirmBuy.title'),
            message: this.translocoService.translate('adminWebmail.toast.confirmBuy.message', { domain: result.domain, price: result.price }),
            icon: 'fas fa-shopping-cart',
            iconColor: 'green',
            confirmText: this.translocoService.translate('adminWebmail.domains.buyAndRegister'),
            cancelText: this.translocoService.translate('adminWebmail.domains.cancel')
        });

        if (!confirmed) return;

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
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorRegisteringDomain'), '');
        } else {
            this.toast.success(this.translocoService.translate('adminWebmail.toast.successImportingDomain'), this.translocoService.translate('adminWebmail.toast.successRegisteringDomain'));
            this.newDomainName = '';
            this.isAddingDomain = false;
            this.checkResult.set(null);
            this.loadDomains();
        }
    }

    async deleteDomain(id: string) {
        const confirmed = await this.openConfirm({
            title: this.translocoService.translate('adminWebmail.confirm.deleteDomain.title'),
            message: this.translocoService.translate('adminWebmail.confirm.deleteDomain.message'),
            icon: 'fas fa-exclamation-triangle',
            iconColor: 'red',
            confirmText: this.translocoService.translate('adminWebmail.confirm.deleteDomain.confirmText'),
            cancelText: this.translocoService.translate('adminWebmail.confirm.deleteDomain.cancelText')
        });
        if (!confirmed) return;

        // DELETE is revoked from authenticated (security audit 20260318200500).
        // Uses SECURITY DEFINER RPC that verifies super_admin + writes RGPD audit trail.
        const { data, error } = await this.supabase
            .rpc('admin_delete_domain', { p_domain_id: id });

        if (error || !data?.success) {
            console.error('Error al eliminar dominio:', error?.message);
            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorDeletingDomain'), this.translocoService.translate('adminWebmail.toast.domainDeletedMsg', { domain: data?.domain || '' }));
        } else {
            this.toast.success(this.translocoService.translate('adminWebmail.toast.domainDeleted'), this.translocoService.translate('adminWebmail.toast.domainDeletedMsg', { domain: data.domain }));

            if (data.company_id) {
                await this.notifyCompany(
                    data.company_id,
                    this.translocoService.translate('adminWebmail.toast.domainDeleted'),
                    this.translocoService.translate('adminWebmail.toast.domainDeletedMsg', { domain: data.domain })
                );
            }

            this.loadDomains();
            this.loadAwsDomains(); // Refresh AWS list to allow importing it again
        }
    }

    private async notifyCompany(companyId: string, title: string, content: string) {
        // Domain notifications go only to owners (not all company members)
        // users.role was dropped in migration 20260111130000 — use company_members + app_roles
        const { data: companyUsers } = await this.supabase
            .from('company_members')
            .select('user_id, app_roles!inner(name)')
            .eq('company_id', companyId)
            .eq('app_roles.name', 'owner');

        if (companyUsers && companyUsers.length > 0) {
            const notificationsToInsert = companyUsers.map(u => ({
                company_id: companyId,
                recipient_id: u.user_id,
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
        if (!id) return this.translocoService.translate('adminWebmail.awsModal.selectCompany');
        const c = this.companies().find(comp => comp.id === id);
        return c ? c.name : this.translocoService.translate('adminWebmail.awsModal.selectCompany');
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

            this.toast.error(this.translocoService.translate('adminWebmail.toast.errorAws'), `${msg}\n\n${this.translocoService.translate('adminWebmail.toast.checkConsole')}`);
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
            this.toast.warning(this.translocoService.translate('adminWebmail.toast.selectCompanyFirst'), this.translocoService.translate('adminWebmail.toast.selectCompanyFirstMsg'));
            return;
        }

        const targetCompany = this.companies().find(c => c.id === targetCompanyId);
        const companyLabel = targetCompany?.name || 'empresa seleccionada';

        if (this.isDomainImported(cleanName)) return;

        // Hide the AWS modal, show inline confirm
        this.closeAwsModal();

        const confirmed = await this.openConfirm({
            title: this.translocoService.translate('adminWebmail.confirm.linkDomain.title'),
            message: this.translocoService.translate('adminWebmail.confirm.linkDomain.message', { domain: cleanName, company: companyLabel }),
            icon: 'fab fa-aws',
            iconColor: 'amber',
            confirmText: this.translocoService.translate('adminWebmail.confirm.linkDomain.confirmText'),
            cancelText: this.translocoService.translate('adminWebmail.confirm.linkDomain.cancelText')
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
                this.toast.error(this.translocoService.translate('adminWebmail.toast.errorIntegrity'), this.translocoService.translate('adminWebmail.toast.errorIntegrityMsg'));
            } else if (error.code === '42501') {
                this.toast.error(this.translocoService.translate('adminWebmail.toast.errorPermissions'), this.translocoService.translate('adminWebmail.toast.errorPermissionsMsg'));
            } else {
                console.error('Error al importar dominio:', error.message);
                this.toast.error(this.translocoService.translate('adminWebmail.toast.errorImportingDomain'), this.translocoService.translate('adminWebmail.toast.errorImportingDomain'));
            }
        } else {
            this.toast.success(this.translocoService.translate('adminWebmail.toast.successImportingDomain'), this.translocoService.translate('adminWebmail.toast.domainLinkedMsg', { domain: cleanName, company: companyLabel }));
            
            await this.notifyCompany(
                targetCompanyId,
                this.translocoService.translate('adminWebmail.toast.successImportingDomain'),
                this.translocoService.translate('adminWebmail.toast.domainLinkedMsg', { domain: cleanName, company: companyLabel })
            );

            this.loadDomains();
            this.loadAwsDomains(); // Refresh list to show "Linked" status
        }
    }
}
