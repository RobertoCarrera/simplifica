import { Component, EventEmitter, Input, OnInit, Output, inject, computed, HostListener, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ticket, SupabaseTicketsService } from '../../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage } from '../../../services/supabase-ticket-stages.service';
import { SupabaseServicesService, Service, ServiceVariant } from '../../../services/supabase-services.service';
import { ProductsService } from '../../../services/products.service';
import { Product } from '../../../models/product';
import { DevicesService, Device } from '../../../services/devices.service';
import { SimpleSupabaseService, SimpleClient } from '../../../services/simple-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { ProductMetadataService } from '../../../services/product-metadata.service';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';
import { firstValueFrom } from 'rxjs';

export interface TicketTag {
    id: string;
    name: string;
    color: string;
    description?: string;
    company_id?: string;
}

@Component({
    selector: 'app-ticket-form',
    standalone: true,
    imports: [CommonModule, FormsModule, TagManagerComponent],
    templateUrl: './ticket-form.component.html',
    styleUrls: ['./ticket-form.component.scss']
})
export class TicketFormComponent implements OnInit, OnChanges, OnDestroy {
    // Inputs/Outputs
    @Input() companyId: string = '';
    @Input() showForm = false; // Add showForm input to handle visibility logic references if any
    @Input() set editingTicket(ticket: Ticket | null) {
        this._editingTicket = ticket;
        if (ticket) {
            this.prepareEditMode(ticket);
        } else {
            this.resetForm();
        }
    }
    get editingTicket(): Ticket | null {
        return this._editingTicket;
    }
    private _editingTicket: Ticket | null = null;

    @Input() prefilledData: any = null; // For AI or wizard

    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<void>();

    // Services
    private stagesSvc = inject(SupabaseTicketStagesService);
    private servicesService = inject(SupabaseServicesService);
    private productsService = inject(ProductsService);
    private simpleSupabase = inject(SimpleSupabaseService);
    private ticketsService = inject(SupabaseTicketsService);
    private toast = inject(ToastService);
    public authService = inject(AuthService);
    private devicesService = inject(DevicesService);
    private productMetadataService = inject(ProductMetadataService);
    private globalTagsService = inject(GlobalTagsService);

    // Form State
    formData: Partial<Ticket> = {};
    formErrors: Record<string, string> = {};
    loading = false;
    error = '';

    // Data Sources
    stages: TicketStage[] = [];
    staffUsers: any[] = [];

    // Customers
    customers: SimpleClient[] = [];
    filteredCustomers: SimpleClient[] = [];
    customerSearchText = '';
    selectedCustomer: SimpleClient | null = null;
    showCustomerDropdown = false;
    showCustomerForm = false;
    customerFormData: any = {};

    // Services
    availableServices: Service[] = [];
    filteredServices: Service[] = [];
    topUsedServices: Service[] = [];
    serviceSearchText = '';
    selectedServices: { service: Service; quantity: number; variant?: ServiceVariant; unit_price: number }[] = [];
    showServiceForm = false;
    serviceFormData: any = {};

    // Products
    availableProducts: Product[] = [];
    filteredProducts: Product[] = [];
    topUsedProducts: Product[] = [];
    productSearchText = '';
    selectedProducts: { product: Product; quantity: number; unit_price: number }[] = [];
    showProductForm = false;
    productFormData: any = {};

    // Product Metadata (Brands/Categories)
    availableBrands: any[] = [];
    filteredBrands: any[] = [];
    availableCategories: any[] = [];
    filteredCategories: any[] = [];
    brandSearchText = '';
    categorySearchText = '';
    showBrandInput = false;
    showCategoryInput = false;

    // Devices
    customerDevices: Device[] = [];
    filteredCustomerDevices: Device[] = [];
    selectedDevices: Device[] = [];
    deviceSearchText = '';
    showCreateDeviceForm = false;
    deviceFormData: any = {};
    selectedDeviceImages: any[] = [];

    // Tags
    availableTags: GlobalTag[] = [];
    selectedTags: GlobalTag[] = [];
    // tagSearchText: string = ''; // Removed

    ngOnInit() {
        this.loadInitialData();
        if (!this.editingTicket) {
            this.resetForm();
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['showForm']) {
            if (this.showForm) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
    }

    ngOnDestroy() {
        document.body.style.overflow = '';
    }

    async loadInitialData() {
        if (!this.companyId) return;

        await Promise.all([
            this.loadStages(),
            this.loadStaff(),
            this.loadStages(),
            this.loadStaff(),
            // this.loadTags(), // Handled by TagManager
            this.loadServices(),
            this.loadServices(),
            this.loadProducts(),
            this.loadCustomers() // We need customers for the search
        ]);

        if (this.editingTicket && this.editingTicket.client) {
            // Ensure selected customer context is loaded
            this.selectCustomer(this.editingTicket.client);
        }
    }



    async loadCustomers() {
        // Initial load of customers - maybe top 50 or recent? 
        // For efficiency we might search-on-type, but let's load some base
        const { data } = await (this.simpleSupabase.getClient() as any)
            .from('clients')
            .select('id, name, surname, email, phone, company_id')
            .eq('company_id', this.companyId)
            .limit(100);
        this.customers = data || [];
        this.filteredCustomers = [...this.customers];
    }

    async loadStages() {
        const { data } = await (this.stagesSvc.getVisibleStages(this.companyId) as any);
        this.stages = (data || []).sort((a: any, b: any) => (Number(a.position) - Number(b.position)));
    }

    async loadStaff() {
        const { data } = await (this.simpleSupabase.getClient() as any)
            .from('users')
            .select('id, name, email') // Added email for display fallback
            .eq('company_id', this.companyId)
            .eq('active', true);

        // Map to format expected by template
        this.staffUsers = (data || []).map((u: any) => ({
            ...u,
            full_name: u.name || u.email
        }));
    }

    resetForm() {
        this.formData = {
            priority: 'normal',
            stage_id: this.stages[0]?.id || '',
            title: '',
            description: '',
            estimated_hours: 1,
            assigned_to: undefined,
            client_id: '',
            company_id: this.companyId
        };

        // Handle prefilled data
        if (this.prefilledData) {
            this.formData.title = this.prefilledData.title || '';
            this.formData.description = this.prefilledData.description || '';
            this.formData.priority = this.prefilledData.priority || 'normal';
            if (this.prefilledData.client_name) {
                this.customerSearchText = this.prefilledData.client_name;
                this.filterCustomers();
            }
        }

        this.selectedCustomer = null;
        this.customerSearchText = '';
        this.selectedServices = [];
        this.selectedProducts = [];
        this.selectedDevices = [];
        this.selectedTags = [];
        this.formErrors = {};
    }

    async prepareEditMode(ticket: Ticket) {
        this.loading = true;
        try {
            this.formData = { ...ticket, assigned_to: ticket.assigned_to };

            // Load tags - Handled by TagManager component
            // const tagNames = await this.loadTagsForTicket(ticket.id);
            // this.selectedTags = tagNames || [];

            // Load Customer
            if (ticket.client) {
                this.selectedCustomer = ticket.client;
                this.customerSearchText = `${ticket.client.name} ${ticket.client.surname || ''}`.trim();
                this.formData.client_id = ticket.client.id;
                this.loadCustomerDevices();
            }

            // Load Items (Services, Products, Devices)
            await this.loadTicketItems(ticket.id);

        } catch (error) {
            console.error('Error preparing edit mode', error);
        } finally {
            this.loading = false;
        }
    }

    // --- Tags ---
    // Tags are now handled by TagManagerComponent
    // We only need to store them here for creation (pending mode)

    // --- Customers ---
    filterCustomers() {
        if (!this.customerSearchText.trim()) {
            this.filteredCustomers = [...this.customers];
            return;
        }

        const searchText = this.customerSearchText.toLowerCase().trim();
        // If we have a lot of customers, we might want to do server-side search here too
        // But for now client-side filter of loaded customers + maybe trigger server load?
        // Let's stick to client filter of what we have + maybe server search if empty?
        // The original code did client side filtering mostly.

        this.filteredCustomers = this.customers.filter(customer =>
            customer.name.toLowerCase().includes(searchText) ||
            (customer.surname && customer.surname.toLowerCase().includes(searchText)) ||
            customer.email?.toLowerCase().includes(searchText) ||
            customer.phone?.toLowerCase().includes(searchText)
        );

        // If list is small/empty and user types, maybe fetch more?
        // For "exact copy", we keep it simple.
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event) {
        const target = event.target as HTMLElement;
        const customerContainer = target.closest('.customer-search-container');
        if (!customerContainer) {
            this.showCustomerDropdown = false;
        }
    }

    onCustomerSearchFocus() {
        this.showCustomerDropdown = true;
        this.filterCustomers();
    }

    onCustomerSearchBlur() {
        setTimeout(() => {
            this.showCustomerDropdown = false;
        }, 200);
    }

    selectCustomer(customer: SimpleClient) {
        this.selectedCustomer = customer;
        this.formData.client_id = customer.id;
        this.customerSearchText = `${customer.name} ${customer.surname || ''}`.trim();
        this.showCustomerDropdown = false;
        this.loadCustomerDevices();
    }

    clearCustomerSelection() {
        this.selectedCustomer = null;
        this.formData.client_id = '';
        this.customerSearchText = '';
        this.customerDevices = [];
        this.filteredCustomerDevices = [];
        this.selectedDevices = [];
    }

    async createNewCustomer() {
        if (!this.customerSearchText.trim()) return;
        this.customerFormData = {
            name: this.customerSearchText.trim()
        };
        this.showCustomerForm = true;
        this.showCustomerDropdown = false;
    }

    openCustomerForm() {
        this.customerFormData = {};
        this.showCustomerForm = true;
        this.showCustomerDropdown = false;
    }

    closeCustomerForm() {
        this.showCustomerForm = false;
        this.customerFormData = {};
    }

    async saveCustomer() {
        if (!this.customerFormData.name?.trim()) return;

        try {
            const { success, data } = await (this.simpleSupabase as any).createClientFull({
                ...this.customerFormData,
                company_id: this.companyId
            });

            if (success && data) {
                this.customers.push(data);
                this.selectCustomer(data);
                this.closeCustomerForm();
                this.toast.success('Éxito', 'Cliente creado');
            } else {
                this.toast.error('Error', 'No se pudo crear el cliente');
            }
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'Error al crear cliente');
        }
    }

    // --- Services ---
    async loadServices() {
        try {
            const services = await (this.servicesService.getServices(this.companyId) as any);
            this.availableServices = (services || []).filter((s: any) => s.is_active);
            this.topUsedServices = this.availableServices.slice(0, 3);
            this.filteredServices = [...this.topUsedServices];
        } catch (e) { console.error(e); }
    }

    filterServices() {
        if (!this.serviceSearchText.trim()) {
            this.filteredServices = [...this.topUsedServices];
            return;
        }
        const text = this.serviceSearchText.toLowerCase();
        this.filteredServices = this.availableServices.filter(s =>
            s.name.toLowerCase().includes(text) ||
            s.description?.toLowerCase().includes(text) ||
            s.category?.toLowerCase().includes(text)
        );
    }

    isServiceSelected(id: string): boolean {
        return this.selectedServices.some(s => s.service.id === id);
    }

    addServiceToTicket(service: Service, variant?: ServiceVariant) {
        const existing = this.selectedServices.find(s =>
            s.service.id === service.id &&
            (variant && s.variant ? s.variant.id === variant.id : (!variant && !s.variant))
        );

        if (existing) {
            existing.quantity++;
        } else {
            const price = variant ? this.getVariantPrice(variant) : (typeof service.base_price === 'number' ? service.base_price : 0);
            this.selectedServices.push({
                service,
                variant,
                quantity: 1,
                unit_price: price
            });
        }
        this.serviceSearchText = '';
        this.filteredServices = [...this.topUsedServices];
    }

    updateServiceQuantity(serviceId: string, quantity: number, variantId?: string) {
        const item = this.selectedServices.find(s =>
            s.service.id === serviceId &&
            (variantId ? s.variant?.id === variantId : !s.variant)
        );
        if (item) item.quantity = Math.max(1, quantity);
    }

    removeServiceFromTicket(serviceId: string, variantId?: string) {
        this.selectedServices = this.selectedServices.filter(s =>
            !(s.service.id === serviceId && (variantId ? s.variant?.id === variantId : !s.variant))
        );
    }

    getVariantPrice(variant: ServiceVariant): number {
        if (variant.pricing?.length > 0) {
            const oneTime = variant.pricing.find(p => p.billing_period === 'one_time');
            if (oneTime) return oneTime.base_price;
            return variant.pricing[0].base_price;
        }
        return variant.base_price || 0;
    }

    openServiceForm() {
        this.serviceFormData = { estimated_hours: 1, base_price: 0, is_active: true };
        this.showServiceForm = true;
    }

    closeServiceForm() {
        this.showServiceForm = false;
        this.serviceFormData = {};
    }

    async createServiceFromTicket() {
        if (!this.serviceFormData.name) return;
        try {
            const newService = await (this.servicesService.createService({
                ...this.serviceFormData,
                company_id: this.companyId
            } as Service) as any);
            this.availableServices.push(newService);
            this.addServiceToTicket(newService);
            this.closeServiceForm();
            this.toast.success('Éxito', 'Servicio creado');
        } catch (e) {
            this.toast.error('Error', 'No se pudo crear el servicio');
        }
    }

    // --- Products ---
    async loadProducts() {
        try {
            // FirstValueFrom is used in original code
            this.productsService.getProducts().subscribe({
                next: async (products) => {
                    this.availableProducts = products || [];
                    this.topUsedProducts = await this.getTopUsedProducts();
                    this.filteredProducts = [...this.topUsedProducts];
                }
            });
        } catch (e) {
            // Fallback
        }
    }

    private async getTopUsedProducts(): Promise<any[]> {
        // RPC Mock or call
        if (this.companyId) {
            const { data } = await (this.simpleSupabase.getClient() as any)
                .rpc('get_top_used_products', { target_company_id: this.companyId, limit_count: 3 });
            if (Array.isArray(data)) return data;
        }
        return this.availableProducts.slice(0, 3);
    }

    filterProducts() {
        if (!this.productSearchText.trim()) {
            this.filteredProducts = [...this.topUsedProducts];
            return;
        }
        const text = this.productSearchText.toLowerCase();
        this.filteredProducts = this.availableProducts.filter(p =>
            p.name.toLowerCase().includes(text) ||
            p.brand?.toLowerCase().includes(text)
        );
    }

    isProductSelected(id: string) {
        return this.selectedProducts.some(p => p.product.id === id);
    }

    addProductToTicket(product: Product) {
        const existing = this.selectedProducts.find(p => p.product.id === product.id);
        if (existing) {
            existing.quantity++;
        } else {
            this.selectedProducts.push({
                product,
                quantity: 1,
                unit_price: product.price
            });
        }
        this.productSearchText = '';
        this.filteredProducts = [...this.topUsedProducts];
    }

    updateProductQuantity(productId: string, quantity: number) {
        const item = this.selectedProducts.find(p => p.product.id === productId);
        if (item) item.quantity = Math.max(1, quantity);
    }

    removeProductFromTicket(productId: string) {
        this.selectedProducts = this.selectedProducts.filter(p => p.product.id !== productId);
    }

    openProductForm() {
        this.productFormData = {
            price: 0,
            stock_quantity: 0
        };
        this.loadBrands();
        this.loadCategories();
        this.showProductForm = true;
    }

    closeProductForm() {
        this.showProductForm = false;
        this.productFormData = {};
    }

    async createProductFromTicket() {
        if (!this.productFormData.name) return;
        try {
            const product = await firstValueFrom(this.productsService.createProduct({
                ...this.productFormData,
                company_id: this.companyId
            }));
            this.availableProducts.push(product);
            this.addProductToTicket(product);
            this.closeProductForm();
            this.toast.success('Éxito', 'Producto creado');
        } catch (e) {
            this.toast.error('Error', 'No se pudo crear el producto');
        }
    }

    // --- Product Metadata (Brands/Categories) ---
    async loadBrands() {
        try { this.availableBrands = await firstValueFrom(this.productMetadataService.getBrands()); } catch { }
        this.filteredBrands = [...this.availableBrands];
    }
    async loadCategories() {
        try { this.availableCategories = await firstValueFrom(this.productMetadataService.getCategories()); } catch { }
        this.filteredCategories = [...this.availableCategories];
    }

    // ... Implement helpers like selectBrand, selectCategory etc. similarly to SupabaseTickets ...
    selectBrand(brand: any) {
        this.productFormData.brand = brand.name;
        this.productFormData.brand_id = brand.id;
        this.showBrandInput = false;
    }

    selectCategory(category: any) {
        this.productFormData.category = category.name;
        this.productFormData.category_id = category.id;
        this.showCategoryInput = false;
    }

    onBrandSearchChange() {
        this.filteredBrands = this.availableBrands.filter(b => b.name.toLowerCase().includes(this.brandSearchText.toLowerCase()));
    }

    onCategorySearchChange() {
        this.filteredCategories = this.availableCategories.filter(c => c.name.toLowerCase().includes(this.categorySearchText.toLowerCase()));
    }

    hasExactBrandMatch() { return this.availableBrands.some(b => b.name.toLowerCase() === this.brandSearchText.toLowerCase()); }
    getExactBrandMatch() { return this.availableBrands.find(b => b.name.toLowerCase() === this.brandSearchText.toLowerCase()); }
    selectExistingBrandMatch() { const m = this.getExactBrandMatch(); if (m) this.selectBrand(m); }

    hasExactCategoryMatch() { return this.availableCategories.some(c => c.name.toLowerCase() === this.categorySearchText.toLowerCase()); }
    getExactCategoryMatch() { return this.availableCategories.find(c => c.name.toLowerCase() === this.categorySearchText.toLowerCase()); }
    selectExistingCategoryMatch() { const m = this.getExactCategoryMatch(); if (m) this.selectCategory(m); }

    async createNewBrand() {
        try {
            const brand = await this.productMetadataService.createBrand(this.brandSearchText, this.companyId);
            this.availableBrands.push(brand);
            this.selectBrand(brand);
        } catch { this.toast.error('Error', 'Error creando marca'); }
    }

    async createNewCategory() {
        try {
            const cat = await this.productMetadataService.createCategory(this.categorySearchText, this.companyId);
            this.availableCategories.push(cat);
            this.selectCategory(cat);
        } catch { this.toast.error('Error', 'Error creando categoría'); }
    }

    // --- Devices ---
    async loadCustomerDevices() {
        if (!this.selectedCustomer) return;
        try {
            // Use customer's company ID if available, otherwise current company
            const cid = this.selectedCustomer.company_id || this.companyId;
            const devices = await this.devicesService.getDevices(cid);
            this.customerDevices = (devices || []).filter(d => d.client_id === this.selectedCustomer?.id);
            this.filteredCustomerDevices = [...this.customerDevices];
        } catch (e) { }
    }

    filterCustomerDevices() {
        if (!this.deviceSearchText) {
            this.filteredCustomerDevices = [...this.customerDevices];
            return;
        }
        const text = this.deviceSearchText.toLowerCase();
        this.filteredCustomerDevices = this.customerDevices.filter(d =>
            d.brand.toLowerCase().includes(text) ||
            d.model.toLowerCase().includes(text) ||
            d.imei?.toLowerCase().includes(text)
        );
    }

    toggleDeviceSelection(device: Device) {
        const index = this.selectedDevices.findIndex(d => d.id === device.id);
        if (index !== -1) this.selectedDevices.splice(index, 1);
        else this.selectedDevices.push(device);
    }

    isDeviceSelected(id: string) { return this.selectedDevices.some(d => d.id === id); }

    removeDeviceFromTicket(id: string) {
        this.selectedDevices = this.selectedDevices.filter(d => d.id !== id);
    }

    openCreateDeviceForm() {
        this.deviceFormData = { status: 'received', priority: 'normal' };
        this.selectedDeviceImages = [];
        this.showCreateDeviceForm = true;
    }

    cancelCreateDevice() {
        this.showCreateDeviceForm = false;
        this.deviceFormData = {};
    }

    onDeviceImagesSelected(event: any) {
        // ... (copy image logic)
        const files = event.target.files;
        if (files) {
            Array.from(files).forEach((file: any) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.selectedDeviceImages.push({ file, preview: e.target?.result });
                }
                reader.readAsDataURL(file);
            });
        }
    }

    removeDeviceImage(index: number) { this.selectedDeviceImages.splice(index, 1); }

    async createAndSelectDevice() {
        if (!this.deviceFormData.brand || !this.selectedCustomer) return;
        try {
            const device = await (this.devicesService.createDevice({
                ...this.deviceFormData,
                client_id: this.selectedCustomer.id,
                company_id: this.selectedCustomer.company_id || this.companyId
            }));

            // Upload images...
            if (this.selectedDeviceImages.length > 0) {
                for (const img of this.selectedDeviceImages) {
                    await this.devicesService.uploadDeviceImage(device.id, img.file, 'arrival', 'Init', undefined, undefined, { brand: device.brand, model: device.model });
                }
            }
            this.selectedDevices.push(device);
            this.cancelCreateDevice();
            this.loadCustomerDevices();
            this.toast.success('Éxito', 'Dispositivo creado');
        } catch { this.toast.error('Error', 'Error creando dispositivo'); }
    }

    getDeviceStatusLabel(status: string) {
        const map: any = { 'received': 'Recibido', 'ready': 'Listo', 'delivered': 'Entregado' }; // Add all
        return map[status] || status;
    }

    // --- Load Ticket Data (Private helper) ---
    private async loadTicketItems(ticketId: string) {
        // Load Services
        const { data: ticketServices } = await (this.simpleSupabase.getClient() as any)
            .from('ticket_services')
            .select(`*, service:services(*), variant:service_variants(*)`)
            .eq('ticket_id', ticketId);

        if (ticketServices) {
            this.selectedServices = ticketServices.map((item: any) => ({
                service: item.service,
                variant: item.variant,
                quantity: item.quantity,
                unit_price: item.price_per_unit || item.unit_price // SupabaseTickets logic
            }));
        }

        // Load Products
        const { data: ticketProducts } = await (this.simpleSupabase.getClient() as any)
            .from('ticket_products')
            .select(`*, product:products(*)`)
            .eq('ticket_id', ticketId);

        if (ticketProducts) {
            this.selectedProducts = ticketProducts.map((item: any) => ({
                product: item.product,
                quantity: item.quantity,
                unit_price: item.price_per_unit || item.unit_price
            }));
        }

        // Load Devices
        const { data: relations } = await (this.simpleSupabase.getClient() as any)
            .from('ticket_devices')
            .select(`device:devices(*)`)
            .eq('ticket_id', ticketId);

        if (relations) {
            this.selectedDevices = relations.map((r: any) => r.device).filter(Boolean);
        }
    }

    // --- Calculations ---
    getTotalEstimatedHours() {
        return this.selectedServices.reduce((sum, s) => sum + (s.service.estimated_hours * s.quantity), 0);
    }

    getGrandTotal() {
        const services = this.selectedServices.reduce((sum, s) => sum + (s.unit_price * s.quantity), 0);
        const products = this.selectedProducts.reduce((sum, p) => sum + (p.unit_price * p.quantity), 0);
        return services + products;
    }

    // --- Save ---
    validateForm() {
        this.formErrors = {};
        if (!this.formData.title) this.formErrors['title'] = 'Requiere título';
        if (!this.formData.client_id) this.formErrors['client_id'] = 'Requiere cliente';
        if (!this.formData.stage_id) this.formErrors['stage_id'] = 'Requiere estado';
        return Object.keys(this.formErrors).length === 0;
    }

    async saveTicket() {
        if (!this.validateForm()) return;
        this.loading = true;
        try {
            const ticketData = {
                ...this.formData,
                company_id: this.companyId,
                estimated_hours: this.getTotalEstimatedHours() || this.formData.estimated_hours,
                total_amount: this.getGrandTotal()
            };

            let savedInfo: any;
            if (this.editingTicket) {
                savedInfo = await this.ticketsService.updateTicket(this.editingTicket.id, ticketData);

                // Update services
                const serviceItems = this.selectedServices.map(s => ({
                    service_id: s.service.id,
                    variant_id: s.variant?.id,
                    quantity: s.quantity,
                    unit_price: s.unit_price
                }));
                await this.ticketsService.replaceTicketServices(this.editingTicket.id, this.companyId, serviceItems);

                // Update products
                const productItems = this.selectedProducts.map(p => ({
                    product_id: p.product.id,
                    quantity: p.quantity,
                    unit_price: p.unit_price
                }));
                await this.ticketsService.replaceTicketProducts(this.editingTicket.id, this.companyId, productItems);

            } else {
                // Create
                const serviceItems = this.selectedServices.map(s => ({
                    service_id: s.service.id,
                    variant_id: s.variant?.id,
                    quantity: s.quantity,
                    unit_price: s.unit_price
                }));
                const productItems = this.selectedProducts.map(p => ({
                    product_id: p.product.id,
                    quantity: p.quantity,
                    unit_price: p.unit_price
                }));

                // Create ticket with items
                savedInfo = await this.ticketsService.createTicketWithItems(ticketData, serviceItems, productItems);
            }

            // Sync Devices
            if (savedInfo?.id) {
                await this.syncTicketDevices(savedInfo.id, this.selectedDevices);
            }

            // Sync tags - Only on creation
            if (savedInfo?.id && !this.editingTicket) {
                await this.syncTicketTags(savedInfo.id, this.selectedTags);
            }

            this.toast.success('Éxito', 'Ticket guardado');
            this.saved.emit();
            this.closeForm();

        } catch (e: any) {
            console.error(e);
            this.toast.error('Error', e.message);
        } finally { this.loading = false; }
    }

    async syncTicketDevices(ticketId: string, devices: Device[]) {
        const client = this.simpleSupabase.getClient();
        // Get current relations
        const { data: currentRels } = await (client as any).from('ticket_devices').select('device_id').eq('ticket_id', ticketId);
        const currentIds = (currentRels || []).map((r: any) => r.device_id);
        const newIds = devices.map(d => d.id);

        // To Add
        const toAdd = newIds.filter(id => !currentIds.includes(id));
        for (const id of toAdd) {
            await this.devicesService.linkDeviceToTicket(ticketId, id, 'repair').catch(() => { });
        }

        // To Remove
        const toRemove = currentIds.filter((id: string) => !newIds.includes(id));
        for (const id of toRemove) {
            await (client as any).from('ticket_devices').delete().match({ ticket_id: ticketId, device_id: id });
        }
    }

    async syncTicketTags(ticketId: string, tags: GlobalTag[]) {
        if (!tags || tags.length === 0) return;

        const client = this.simpleSupabase.getClient();
        // Since tags are already created (GlobalTag objects), we just link them

        for (const tag of tags) {
            await (client as any).from('tickets_tags').insert({
                ticket_id: ticketId,
                tag_id: tag.id
            }).catch((err: any) => console.error('Error linking tag', err));
        }
    }

    closeForm() {
        this.close.emit();
    }
}
