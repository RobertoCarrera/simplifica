
import { Component, EventEmitter, Input, OnInit, Output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ticket } from '../../../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage } from '../../../../services/supabase-ticket-stages.service';
import { SupabaseServicesService, Service, ServiceVariant } from '../../../../services/supabase-services.service';
import { ProductsService } from '../../../../services/products.service';
import { SimpleSupabaseService, SimpleClient } from '../../../../services/simple-supabase.service';
import { ToastService } from '../../../../services/toast.service';
import { AuthService } from '../../../../services/auth.service';
import { DevRoleService } from '../../../../services/dev-role.service';
import { TicketModalService } from '../../../../services/ticket-modal.service';

@Component({
    selector: 'app-ticket-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './ticket-form.component.html',
    styleUrls: ['./ticket-form.component.scss']
})
export class TicketFormComponent implements OnInit {
    @Input() companyId: string = '';
    @Input() initialTicket: Ticket | null = null;
    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<Ticket>();

    // Services
    private stagesSvc = inject(SupabaseTicketStagesService);
    private servicesService = inject(SupabaseServicesService);
    private productsService = inject(ProductsService);
    private simpleSupabase = inject(SimpleSupabaseService);
    private toast = inject(ToastService);
    public authService = inject(AuthService);
    public devRoleService = inject(DevRoleService);

    // State
    formData: Partial<Ticket> = {};
    stages: TicketStage[] = [];
    staffUsers: any[] = [];
    formErrors: Record<string, string> = {};
    loading = false;

    // Customers
    customers: SimpleClient[] = [];
    filteredCustomers: SimpleClient[] = [];
    customerSearchText = '';
    selectedCustomer: SimpleClient | null = null;
    showCustomerDropdown = false;

    // Services & Products
    availableServices: Service[] = [];
    filteredServices: Service[] = [];
    serviceSearchText = '';
    selectedServices: { service: Service; quantity: number; variant?: ServiceVariant; unit_price?: number }[] = [];

    // Computeds
    isClient = computed(() => this.authService.userRole() === 'client');

    ngOnInit() {
        this.initializeForm();
        if (this.companyId) {
            this.loadStages();
            this.loadStaff();
            this.loadServices();
            // this.loadProducts(); // Add if needed
        }
    }

    initializeForm() {
        if (this.initialTicket) {
            this.formData = { ...this.initialTicket };
            this.selectedCustomer = this.initialTicket.client as any;
            this.customerSearchText = this.selectedCustomer?.name || '';
            // Load selected services if applicable (complex mapping might be needed)
        } else {
            this.formData = {
                priority: 'normal',
                stage_id: '',
                title: '',
                description: '',
                estimated_hours: 0
            };
        }
    }

    async loadStages() {
        const { data } = await this.stagesSvc.getVisibleStages(this.companyId);
        this.stages = (data || []).sort((a: any, b: any) => (Number(a.position) - Number(b.position)));
    }

    async loadStaff() {
        const { data } = await this.simpleSupabase.getClient()
            .from('users')
            .select('id, name')
            .eq('company_id', this.companyId)
            .eq('active', true);
        this.staffUsers = data || [];
    }

    async loadServices() {
        try {
            const services = await this.servicesService.getServices(this.companyId);
            this.availableServices = (services || []).filter((s: any) => s.is_active);
            this.filteredServices = this.availableServices.slice(0, 5);
        } catch (e) { console.error(e); }
    }

    // Customer Search
    async filterCustomers() {
        if (!this.customerSearchText.trim()) {
            this.filteredCustomers = [];
            this.showCustomerDropdown = false;
            return;
        }

        // Simple search implementation
        const term = this.customerSearchText.toLowerCase();
        const { data } = await this.simpleSupabase.getClient()
            .from('clients')
            .select('id, name, email, phone')
            .eq('company_id', this.companyId)
            .ilike('name', `%${term}%`)
            .limit(10);

        this.filteredCustomers = data || [];
        this.showCustomerDropdown = true;
    }

    selectCustomer(customer: SimpleClient) {
        this.selectedCustomer = customer;
        this.formData.client_id = customer.id;
        this.customerSearchText = customer.name;
        this.showCustomerDropdown = false;
    }

    // Submit
    async onSubmit() {
        if (!this.validateForm()) return;

        this.loading = true;
        try {
            const ticketData = {
                ...this.formData,
                company_id: this.companyId,
                // Ensure status/priority have defaults if empty
                stage_id: this.formData.stage_id,
                client_id: this.formData.client_id,
                title: this.formData.title,
                priority: this.formData.priority || 'normal',
                description: this.formData.description || '',
                assigned_to: this.formData.assigned_to || null,
                estimated_hours: this.formData.estimated_hours || 0
            };

            const client = this.simpleSupabase.getClient();
            let result;

            if (this.initialTicket?.id) {
                result = await client.from('tickets').update(ticketData).eq('id', this.initialTicket.id).select().single();
            } else {
                // For new ticket, ensure ticket_number is generated by DB trigger or handle it if not?
                // Assuming DB trigger handles ticket_number increment
                result = await client.from('tickets').insert(ticketData).select().single();
            }

            if (result.error) throw result.error;

            this.toast.success('Ticket guardado', 'El ticket se ha guardado correctamente');
            this.saved.emit(result.data);
            this.close.emit();
        } catch (error: any) {
            console.error(error);
            this.toast.error('Error', 'Error al guardar ticket: ' + error.message);
        } finally {
            this.loading = false;
        }
    }

    validateForm(): boolean {
        this.formErrors = {};
        if (!this.formData.title) this.formErrors['title'] = 'El título es obligatorio';
        if (!this.formData.client_id) this.formErrors['client_id'] = 'El cliente es obligatorio';
        if (!this.formData.stage_id) this.formErrors['stage_id'] = 'El estado es obligatorio';
        return Object.keys(this.formErrors).length === 0;
    }

    closeForm() {
        this.close.emit();
    }
}
