import { Component, inject, signal, OnInit, ViewChild, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeService } from '../../../services/theme.service';
import { CompaniesService } from '../../../services/companies.service';
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
    themeService = inject(ThemeService);
    companiesService = inject(CompaniesService);

    // Signals
    @Input() embedded = false;

    isAdmin = this.authService.isAdmin;
    isSuperAdmin = this.authService.isSuperAdmin;

    @ViewChild('contractDialog') contractDialog!: ContractProgressDialogComponent;

    // State
    activeTab = signal<'domains' | 'logs' | 'orders'>('domains');
    myDomains = signal<any[]>([]);
    inboundLogs = signal<any[]>([]);
    domainOrders = signal<any[]>([]);
    isLoadingLogs = signal(false);
    isLoadingOrders = signal(false);

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
    }

    async ngOnInit() {
        await this.loadDomains();
        if (this.activeTab() === 'logs') {
            await this.loadInboundLogs();
        }
        if (this.activeTab() === 'orders' && this.isSuperAdmin()) {
            await this.loadDomainOrders();
        }
    }

    setTab(tab: 'domains' | 'logs' | 'orders') {
        this.activeTab.set(tab);
        if (tab === 'logs') {
            this.loadInboundLogs();
        }
        if (tab === 'orders' && this.isSuperAdmin()) {
            this.loadDomainOrders();
        }
    }

    async loadDomainOrders() {
        if (!this.isSuperAdmin()) return;
        this.isLoadingOrders.set(true);
        try {
            const { data, error } = await this.supabase.instance
                .from('domain_orders')
                .select('*, companies(name)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.domainOrders.set(data || []);
        } catch (error: any) {
            console.error('Error loading domain orders:', error);
            this.toast.error('Error', 'No se pudieron cargar los pedidos de dominio.');
        } finally {
            this.isLoadingOrders.set(false);
        }
    }

    async approveOrder(order: any) {
        if (!confirm(`¿Aprobar y registrar el dominio ${order.domain_name}? Esto realizará el cargo real en AWS.`)) return;

        this.toast.info('Procesando', 'Registrando dominio en AWS...');
        
        try {
            // 1. Llamar a AWS vía Edge Function (como SuperAdmin)
            const { data, error } = await this.supabase.instance.functions.invoke('aws-manager', {
                body: {
                    action: 'register-domain',
                    payload: { domain: order.domain_name }
                }
            });

            if (error) throw error;

            // 2. Marcar pedido como pagado y completado
            const { error: updateErr } = await this.supabase.instance
                .from('domain_orders')
                .update({ 
                    status: 'completed',
                    payment_status: 'paid' 
                })
                .eq('id', order.id);

            if (updateErr) throw updateErr;

            // 3. Insertar en la tabla de dominios final vinculando a la empresa
            await this.supabase.instance.from('domains').insert({
                domain: order.domain_name,
                company_id: order.company_id,
                status: 'pending_verification',
                provider: 'aws',
                is_verified: false
            });

            this.toast.success('Éxito', `Dominio ${order.domain_name} registrado y asignado.`);
            await this.loadDomainOrders();
            await this.loadDomains();
        } catch (error: any) {
            console.error('Approve Order Error:', error);
            console.error('Error procesando registro:', error.message);
            this.toast.error('Error', 'No se pudo procesar el registro.');
        }
    }

    async rejectOrder(order: any) {
        if (!confirm(`¿Rechazar la solicitud del dominio ${order.domain_name}?`)) return;

        try {
            const { error } = await this.supabase.instance
                .from('domain_orders')
                .update({ status: 'rejected' })
                .eq('id', order.id);

            if (error) throw error;
            this.toast.info('Solicitud rechazada', 'Se ha actualizado el estado del pedido.');
            await this.loadDomainOrders();
        } catch (error: any) {
            console.error('Error al rechazar:', error.message);
            this.toast.error('Error', 'No se pudo rechazar el registro.');
        }
    }

    async loadInboundLogs() {
        this.isLoadingLogs.set(true);
        try {
            const { data, error } = await this.supabase.instance
                .from('inbound_email_audit')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            this.inboundLogs.set(data || []);
        } catch (error: any) {
            console.error('Error loading inbound logs:', error);
            this.toast.error('Error', 'No se pudieron cargar los registros de correo.');
        } finally {
            this.isLoadingLogs.set(false);
        }
    }

    async reprocessEmail(log: any) {
        if (!log.s3_key) return;

        this.toast.info('Procesando', 'Re-intentando entrega del correo...');
        
        try {
            const { data, error } = await this.supabase.instance.functions.invoke('process-inbound-email', {
                body: { 
                    action: 'reprocess', 
                    s3_key: log.s3_key,
                    messageId: log.message_id 
                }
            });

            if (error) throw error;
            
            this.toast.success('Éxito', 'Correo procesado correctamente.');
            await this.loadInboundLogs();
        } catch (error: any) {
            console.error('Reprocess Error:', error);
            console.error('Error al re-procesar correo:', error.message);
            this.toast.error('Error', 'No se pudo re-procesar el correo.');
            await this.loadInboundLogs();
        }
    }

    async loadDomains() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) {
            console.warn('loadDomains: no company_id available, skipping');
            return;
        }

        const { data, error } = await this.supabase.instance
            .from('domains')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading domains:', error);
            // Fallback check
            if (this.isSuperAdmin()) {
                this.loadAwsDomains();
            }
            return;
        }
        this.myDomains.set(data || []);

        // ONLY load AWS domains for SuperAdmin, to populate the discovery section
        if (this.isSuperAdmin()) {
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

            if (data.success === false) {
                const msg = `[${data.awsError || data.error}] ${data.message || 'Error desconocido'}`;
                this.toast.error('Error AWS', msg);
                return;
            }

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
            console.error('Error al verificar:', error.message);
            this.toast.error('Error', 'No se pudo verificar el dominio.');
        } finally {
            this.isChecking = false;
        }
    }

    async registerDomain() {
        const domain = this.checkResult();
        if (!domain || !domain.available) return;

        this.closeAddDomainModal();
        this.contractDialog.startProcess(domain.name);

        try {
            // 1. SOLICITAR INTENCIÓN DE COMPRA (CREAR REGISTRO DE PEDIDO)
            this.contractDialog.resultMessage.set('Creando solicitud de pedido...');
            
            const { data: order, error: orderErr } = await this.supabase.instance
                .from('domain_orders')
                .insert({
                    domain_name: domain.name,
                    company_id: this.authService.currentCompanyId(),
                    status: 'pending_approval',
                    amount: 12.00,
                    currency: 'USD'
                })
                .select()
                .single();

            if (orderErr) throw orderErr;

            this.contractDialog.updateStep('quote', 'completed');
            this.contractDialog.updateStep('invoice', 'completed');

            // 2. FLUJO DE PAGO O APROBACIÓN
            this.contractDialog.resultMessage.set('Su solicitud ha sido enviada al administrador para validación y pago.');
            
            // Aquí podríamos integrar Stripe:
            /*
            const { data: session } = await this.supabase.instance.functions.invoke('create-checkout-session', { ... });
            if (session.url) window.location.href = session.url;
            */

            // Por ahora, simulamos el proceso de aprobación externa
            this.toast.success('Solicitud enviada', `El administrador revisará el dominio ${domain.name} y procederá con el pago.`);
            
            this.contractDialog.completeSuccess({
                success: true,
                message: `Solicitud de registro enviada. El dominio ${domain.name} se registrará tras la validación manual del administrador.`
            });

            // No llamamos a aws-manager directamente aquí por seguridad.
            // El registro real lo disparará un webhook de Stripe o el SuperAdmin en el backend.

        } catch (error: any) {
            console.error('Registration/Order Error:', error);
            this.contractDialog.completeError('quote', 'Error en la solicitud', error.message || 'Error desconocido al procesar el pedido');
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
        if (!this.isSuperAdmin()) {
            console.warn('Bloqueado: Solo SuperAdmins pueden listar todos los dominios de AWS.');
            this.awsDomains.set([]);
            return;
        }
        
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

        const { error } = await this.supabase.instance
            .from('domains')
            .insert({
                domain: domainName,
                company_id: this.authService.currentCompanyId(),
                is_verified: true,
                provider: 'aws'
            });

        if (error) {
            console.error('Error en dominios:', error.message);
            this.toast.error('Error', 'Ocurrió un error inesperado.');
        }
        else {
            this.toast.success('Éxito', 'Dominio importado');
            this.loadDomains();
        }
    }
}
