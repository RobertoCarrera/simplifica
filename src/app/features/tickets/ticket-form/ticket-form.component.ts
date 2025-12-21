import { Component, EventEmitter, Input, OnInit, Output, inject, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ticket } from '../../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage } from '../../../services/supabase-ticket-stages.service';
import { SupabaseServicesService, Service, ServiceVariant } from '../../../services/supabase-services.service';
import { ProductsService } from '../../../services/products.service';
import { Product } from '../../../models/product';
import { DevicesService, Device } from '../../../services/devices.service';
import { SimpleSupabaseService, SimpleClient } from '../../../services/simple-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { ProductMetadataService } from '../../../services/product-metadata.service';
import { firstValueFrom } from 'rxjs';
import { SupabaseTicketsService } from '../../../services/supabase-tickets.service';

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
    imports: [CommonModule, FormsModule],
    templateUrl: './ticket-form.component.html',
    styleUrls: ['./ticket-form.component.scss']
})
export class TicketFormComponent implements OnInit {
    @Input() companyId: string = '';
    @Input() initialTicket: Ticket | null = null;
    @Input() prefilledData: any = null;
    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<Ticket>();

    // Services
    private stagesSvc = inject(SupabaseTicketStagesService);
    private servicesService = inject(SupabaseServicesService);
    private productsService = inject(ProductsService);
    private simpleSupabase = inject(SimpleSupabaseService);
    private ticketsService = inject(SupabaseTicketsService);
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
    topUsedServices: Service[] = [];
    serviceSearchText = '';
    selectedServices: { service: Service; quantity: number; variant?: ServiceVariant; unit_price?: number }[] = [];
    showServiceForm = false;
    serviceFormData: any = {}; // Products
    availableProducts: Product[] = [];
    filteredProducts: Product[] = [];
    topUsedProducts: Product[] = [];
    productSearchText = '';
    selectedProducts: { product: Product; quantity: number; unit_price: number }[] = [];
    showProductForm = false;
    productFormData: any = {};
    availableBrands: any[] = [];
    filteredBrands: any[] = [];
    availableCategories: any[] = [];
    filteredCategories: any[] = [];
    brandSearchText = '';
    categorySearchText = '';
    showBrandInput = false;
    showCategoryInput = false;

    // Customers
    showCustomerForm = false;
    customerFormData: any = {};

    // Devices
    customerDevices: Device[] = [];
    filteredCustomerDevices: Device[] = [];
    selectedDevices: Device[] = [];
    deviceSearchText = '';
    showCreateDeviceForm = false;
    showDeviceForm = false;
    deviceFormData: any = {};
    selectedDeviceImages: any[] = [];

    // Tags
    availableTags: TicketTag[] = [];
    filteredTags: TicketTag[] = [];
    selectedTags: string[] = [];
    tagSearchText: string = '';
    showTagInput = false;

    // Computeds
    isClient = computed(() => this.authService.userRole() === 'client');
    private devicesService = inject(DevicesService);
    private productMetadataService = inject(ProductMetadataService);

    ngOnInit() {
        this.initializeForm();
        if (this.companyId) {
            this.loadInitialData();
        }
    }

    async loadInitialData() {
        this.loading = true;
        await Promise.all([
            this.loadStages(),
            this.loadStaff(),
            this.loadServices(),
            this.loadProducts(),
            this.loadTags()
        ]);
        this.loading = false;
        this.loadTicketItems(); // Load existing items if editing
    }


    initializeForm() {
        if (this.initialTicket) {
            this.formData = { ...this.initialTicket };
            this.selectedCustomer = this.initialTicket.client as any;
            this.customerSearchText = this.selectedCustomer?.name || '';
            // Load selected services if applicable (complex mapping might be needed)
        } else {
            // New ticket (possibly with prefilled data from AI)
            this.formData = {
                priority: this.prefilledData?.priority || 'normal',
                stage_id: '',
                title: this.prefilledData?.title || '',
                description: this.prefilledData?.description || '',
                estimated_hours: 0,
                assigned_to: undefined
            };

            if (this.prefilledData?.client_name) {
                this.customerSearchText = this.prefilledData.client_name;
                // Trigger search to show matches
                this.filterCustomers();
            }
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
            this.topUsedServices = this.availableServices.slice(0, 3); // Mock top 3
            this.filteredServices = [...this.topUsedServices];
        } catch (e) { console.error(e); }
    }

    async loadProducts() {
        try {
            const products = await firstValueFrom(this.productsService.getProducts()); // Corrected: getProducts() takes no args or optional args, verifies
            // Assuming getProducts handles companyId internally or via auth service as seen in file view
            this.availableProducts = (products || []).filter((p: any) => p.stock_quantity > 0);
            this.topUsedProducts = this.availableProducts.slice(0, 3);
            this.filteredProducts = [...this.topUsedProducts];
        } catch (e) { console.error('Error loading products', e); }
    }

    async loadTicketItems() {
        if (!this.initialTicket?.id) return;

        // Load Services
        const { data: ticketServices } = await this.simpleSupabase.getClient()
            .from('ticket_services')
            .select(`
                *,
                service:services(*),
                variant:service_variants(*)
            `)
            .eq('ticket_id', this.initialTicket.id);

        if (ticketServices) {
            this.selectedServices = ticketServices.map((item: any) => ({
                service: item.service,
                variant: item.variant,
                quantity: item.quantity,
                unit_price: item.unit_price
            }));
        }

        // Load Products
        const { data: ticketProducts } = await this.simpleSupabase.getClient()
            .from('ticket_products')
            .select(`
                *,
                product:products(*)
            `)
            .eq('ticket_id', this.initialTicket.id);

        if (ticketProducts) {
            this.selectedProducts = ticketProducts.map((item: any) => ({
                product: item.product,
                quantity: item.quantity,
                unit_price: item.unit_price
            }));
        }

        // Load Devices
        const { data: relations } = await this.simpleSupabase.getClient()
            .from('ticket_device_relations')
            .select(`
                device:devices(*)
            `)
            .eq('ticket_id', this.initialTicket.id);

        if (relations) {
            this.selectedDevices = relations.map((r: any) => r.device).filter(Boolean);
        }
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

        // Load devices for this customer
        this.loadCustomerDevices();
    }

    clearCustomerSelection() {
        this.selectedCustomer = null;
        this.formData.client_id = '';
        this.customerSearchText = '';
        this.selectedDevices = [];
        this.customerDevices = [];
        this.filteredCustomerDevices = [];
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event) {
        const target = event.target as HTMLElement;
        if (!target.closest('.customer-search-container')) {
            this.showCustomerDropdown = false;
        }
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
                estimated_hours: this.getTotalEstimatedHours() || this.formData.estimated_hours || 0,
                total_amount: this.getGrandTotal()
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

            const ticketId = result.data.id;

            // Save Ticket Items (Services)
            // Replace existing items (delete all and insert new) - Simplest strategy for now
            if (this.initialTicket?.id) {
                await this.simpleSupabase.getClient().from('ticket_services').delete().eq('ticket_id', ticketId);
                await this.simpleSupabase.getClient().from('ticket_products').delete().eq('ticket_id', ticketId);
                // Note: Device relations might be preserved or handled differently, but for now we won't auto-delete unless needed
            }

            // Insert Services
            if (this.selectedServices.length > 0) {
                const serviceItems = this.selectedServices.map(s => ({
                    ticket_id: ticketId,
                    service_id: s.service.id,
                    variant_id: s.variant?.id,
                    quantity: s.quantity,
                    unit_price: s.unit_price,
                    company_id: this.companyId
                }));
                await this.simpleSupabase.getClient().from('ticket_services').insert(serviceItems);
            }

            // Insert Products
            if (this.selectedProducts.length > 0) {
                const productItems = this.selectedProducts.map(p => ({
                    ticket_id: ticketId,
                    product_id: p.product.id,
                    quantity: p.quantity,
                    unit_price: p.unit_price,
                    company_id: this.companyId
                }));
                await this.simpleSupabase.getClient().from('ticket_products').insert(productItems);
            }

            // Link Devices
            if (this.selectedDevices.length > 0) {
                // Check existing links to avoid duplicates
                const { data: existingLinks } = await this.simpleSupabase.getClient()
                    .from('ticket_device_relations')
                    .select('device_id')
                    .eq('ticket_id', ticketId);

                const existingDeviceIds = new Set((existingLinks || []).map((l: any) => l.device_id));

                const newLinks = this.selectedDevices
                    .filter(d => !existingDeviceIds.has(d.id))
                    .map(d => ({
                        ticket_id: ticketId,
                        device_id: d.id,
                        type: 'repair', // Default type
                        company_id: this.companyId
                    }));

                if (newLinks.length > 0) {
                    await this.simpleSupabase.getClient().from('ticket_device_relations').insert(newLinks);
                }
            }

            // Save tags
            await this.syncTicketTags(ticketId, this.selectedTags);

            this.toast.success('Ticket guardado', 'El ticket se ha guardado correctamente');
            this.saved.emit(result.data);
            this.close.emit();
        } catch (error: any) {
            console.error(error);
            this.formErrors['save'] = error.message;
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
    // --- Services Logic ---
    filterServices() {
        if (!this.serviceSearchText.trim()) {
            this.filteredServices = [...this.topUsedServices];
            return;
        }
        const term = this.serviceSearchText.toLowerCase();
        this.filteredServices = this.availableServices.filter(s =>
            s.name.toLowerCase().includes(term) ||
            s.description?.toLowerCase().includes(term) ||
            s.category?.toLowerCase().includes(term)
        );
    }

    addServiceToTicket(service: Service, variant?: ServiceVariant) {
        // Check if already selected
        const existing = this.selectedServices.find(s => s.service.id === service.id && s.variant?.id === variant?.id);
        if (existing) {
            existing.quantity++;
        } else {
            this.selectedServices.push({
                service,
                variant,
                quantity: 1,
                unit_price: variant ? this.getVariantPrice(variant) : service.base_price
            });
        }
    }

    updateServiceQuantity(serviceId: string, quantity: number, variantId?: string) {
        const item = this.selectedServices.find(s => s.service.id === serviceId && s.variant?.id === variantId);
        if (item) {
            item.quantity = Math.max(1, quantity);
        }
    }

    removeServiceFromTicket(serviceId: string, variantId?: string) {
        this.selectedServices = this.selectedServices.filter(s => !(s.service.id === serviceId && s.variant?.id === variantId));
    }

    getVariantPrice(variant: ServiceVariant): number {
        // Try pricing array first (handle string or object parsing if needed, but assuming typed here)
        if (variant.pricing && Array.isArray(variant.pricing) && variant.pricing.length > 0) {
            // Use the first pricing option's base_price as default for now
            // In a better UI we would let user select billing period
            const firstPrice = variant.pricing[0];
            return firstPrice.base_price || 0;
        }
        // Fallback deprecated
        return variant.base_price || 0;
    }

    // --- Service Creation Methods ---

    openServiceForm() {
        this.serviceFormData = {
            name: '',
            description: '',
            base_price: 0,
            estimated_hours: 1,
            category: '',
            is_active: true,
            company_id: this.companyId
        };
        this.showServiceForm = true;
    }

    closeServiceForm() {
        this.showServiceForm = false;
        this.serviceFormData = {};
    }

    async createServiceFromTicket() {
        try {
            if (!this.serviceFormData.name?.trim()) {
                this.toast.error('Error', 'El nombre del servicio es requerido');
                return;
            }

            this.serviceFormData.company_id = this.companyId;
            const newService = await this.servicesService.createService(this.serviceFormData as Service);
            this.availableServices.push(newService);
            this.addServiceToTicket(newService);
            this.closeServiceForm();
            this.toast.success('Servicio creado', 'El servicio se ha creado correctamente');
        } catch (error: any) {
            console.error('Error creando servicio:', error);
            this.toast.error('Error', 'Error al crear el servicio');
        }
    }

    // --- Product Creation Methods ---

    openProductForm() {
        this.productFormData = {
            name: '',
            description: '',
            category: '',
            brand: '',
            model: '',
            price: 0,
            stock_quantity: 0
        };
        this.brandSearchText = '';
        this.categorySearchText = '';
        this.showBrandInput = false;
        this.showCategoryInput = false;

        // Load brands and categories for autocomplete
        this.loadBrands();
        this.loadCategories();

        this.showProductForm = true;
    }

    closeProductForm() {
        this.showProductForm = false;
        this.productFormData = {};
    }

    async loadBrands() {
        try {
            this.availableBrands = await firstValueFrom(this.productMetadataService.getBrands());
            this.filteredBrands = [...this.availableBrands];
        } catch (error) {
            console.error('Error cargando marcas:', error);
            this.availableBrands = [];
            this.filteredBrands = [];
        }
    }

    async loadCategories() {
        try {
            this.availableCategories = await firstValueFrom(this.productMetadataService.getCategories());
            this.filteredCategories = [...this.availableCategories];
        } catch (error) {
            console.error('Error cargando categorías:', error);
            this.availableCategories = [];
            this.filteredCategories = [];
        }
    }

    async createNewBrand() {
        try {
            if (!this.brandSearchText.trim()) return;

            const newBrand = await this.productMetadataService.createBrand(
                this.brandSearchText.trim(),
                this.companyId
            );

            this.availableBrands.push(newBrand);
            this.selectBrand(newBrand);
        } catch (error) {
            console.error('Error creando marca:', error);
            this.toast.error('Error', 'Error al crear la marca. Puede que ya exista.');
        }
    }

    async createNewCategory() {
        try {
            if (!this.categorySearchText.trim()) return;

            const newCategory = await this.productMetadataService.createCategory(
                this.categorySearchText.trim(),
                this.companyId
            );

            this.availableCategories.push(newCategory);
            this.selectCategory(newCategory);
        } catch (error) {
            console.error('Error creando categoría:', error);
            this.toast.error('Error', 'Error al crear la categoría. Puede que ya exista.');
        }
    }

    selectBrand(brand: any) {
        this.productFormData.brand = brand.name;
        this.productFormData.brand_id = brand.id;
        this.brandSearchText = brand.name;
        this.showBrandInput = false;
    }

    selectCategory(category: any) {
        this.productFormData.category = category.name;
        this.productFormData.category_id = category.id;
        this.categorySearchText = category.name;
        this.showCategoryInput = false;
    }

    onBrandSearchChange() {
        if (!this.brandSearchText.trim()) {
            this.filteredBrands = [...this.availableBrands];
            return;
        }
        const searchText = this.brandSearchText.toLowerCase().trim();
        this.filteredBrands = this.availableBrands.filter(brand =>
            brand.name.toLowerCase().includes(searchText)
        );
    }

    onCategorySearchChange() {
        if (!this.categorySearchText.trim()) {
            this.filteredCategories = [...this.availableCategories];
            return;
        }
        const searchText = this.categorySearchText.toLowerCase().trim();
        this.filteredCategories = this.availableCategories.filter(category =>
            category.name.toLowerCase().includes(searchText)
        );
    }

    hasExactBrandMatch(): boolean {
        if (!this.brandSearchText.trim()) return false;
        const searchText = this.brandSearchText.toLowerCase().trim();
        return this.availableBrands.some(b => b.name.toLowerCase() === searchText);
    }

    getExactBrandMatch(): any {
        const searchText = this.brandSearchText.toLowerCase().trim();
        return this.availableBrands.find(b => b.name.toLowerCase() === searchText);
    }

    hasExactCategoryMatch(): boolean {
        if (!this.categorySearchText.trim()) return false;
        const searchText = this.categorySearchText.toLowerCase().trim();
        return this.availableCategories.some(c => c.name.toLowerCase() === searchText);
    }

    getExactCategoryMatch(): any {
        const searchText = this.categorySearchText.toLowerCase().trim();
        return this.availableCategories.find(c => c.name.toLowerCase() === searchText);
    }

    async createProductFromTicket() {
        try {
            if (!this.productFormData.name?.trim()) {
                this.toast.error('Error', 'El nombre del producto es requerido');
                return;
            }
            // Ensure numeric fields
            const payload = {
                name: this.productFormData.name,
                description: this.productFormData.description || null,
                category: this.productFormData.category || null,
                brand: this.productFormData.brand || null,
                model: this.productFormData.model || null,
                price: Number(this.productFormData.price || 0),
                stock_quantity: Number(this.productFormData.stock_quantity || 0),
                company_id: this.companyId
            };
            const newProduct = await firstValueFrom(this.productsService.createProduct(payload));
            this.availableProducts.push(newProduct);
            this.addProductToTicket(newProduct);
            this.closeProductForm();
            this.toast.success('Producto creado', 'El producto se ha creado correctamente');
        } catch (error) {
            console.error('Error creando producto:', error);
            this.toast.error('Error', 'Error al crear el producto');
        }
    }

    // --- Device Creation Methods ---

    openCreateDeviceForm() {
        this.deviceFormData = {
            company_id: this.selectedCustomer?.company_id || this.companyId,
            client_id: this.selectedCustomer?.id || '',
            status: 'received',
            priority: 'normal'
        };
        this.selectedDeviceImages = [];
        this.showCreateDeviceForm = true;
    }

    closeDeviceForm() {
        this.showCreateDeviceForm = false;
        this.deviceFormData = {};
    }

    onDeviceImagesSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files) {
            Array.from(input.files).forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        this.selectedDeviceImages.push({
                            file: file,
                            preview: e.target?.result as string
                        });
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    }

    removeDeviceImage(index: number) {
        this.selectedDeviceImages.splice(index, 1);
    }

    async createAndSelectDevice() {
        if (!this.deviceFormData.brand || !this.deviceFormData.model ||
            !this.deviceFormData.device_type || !this.deviceFormData.reported_issue ||
            !this.selectedCustomer) {
            this.toast.warning('Faltan datos', 'Por favor complete todos los campos requeridos del dispositivo');
            return;
        }

        try {
            const deviceData: any = {
                ...this.deviceFormData,
                client_id: this.selectedCustomer.id,
                // Ensure the device is created under the customer's company (company authoritative)
                company_id: this.selectedCustomer?.company_id || this.companyId,
                status: 'received',
                priority: 'normal',
                received_at: new Date().toISOString()
            };

            // Call Service to Create Device
            const newDevice = await this.devicesService.createDevice(deviceData);

            // Upload images if any
            if (this.selectedDeviceImages.length > 0) {
                for (const img of this.selectedDeviceImages) {
                    try {
                        await this.devicesService.uploadDeviceImage(
                            newDevice.id,
                            img.file,
                            'arrival',
                            'Estado del dispositivo al llegar',
                            undefined,
                            undefined,
                            { brand: newDevice.brand, model: newDevice.model }
                        );
                    } catch (imageError) {
                        console.error('Error uploading device image:', imageError);
                    }
                }
            }

            // Add to selected devices
            this.selectedDevices.push(newDevice);

            // Refresh customer devices list
            await this.loadCustomerDevices();

            // Reset form
            this.closeDeviceForm();
            this.toast.success('Dispositivo creado', 'El dispositivo se ha creado y seleccionado');

        } catch (error) {
            console.error('Error creating device:', error);
            this.toast.error('Error', 'Error al crear el dispositivo');
        }
    }

    getDeviceStatusLabel(status: string): string {
        const statusMap: Record<string, string> = {
            'received': 'Recibido',
            'in_diagnosis': 'En Diagnóstico',
            'in_repair': 'En Reparación',
            'waiting_parts': 'Esperando Repuestos',
            'waiting_client': 'Esperando Cliente',
            'ready': 'Listo',
            'delivered': 'Entregado',
            'cancelled': 'Cancelado'
        };
        return statusMap[status] || status;
    }

    // --- Customer Creation Methods ---

    openCustomerForm() {
        // Logic for new customer form - if implemented as a sub-modal.
        // Assuming simple inline expansion or a separate modal property if needed.
        // For now, let's assume we use a dedicated modal for it too if requested.
        // Checking SupabaseTicketsComponent, it had 'showCustomerForm'.
        this.customerFormData = {
            name: '',
            email: '',
            phone: '',
            address: '',
            city: '',
            postal_code: '',
            notes: ''
        };
        this.showCustomerForm = true;
    }

    closeCustomerForm() {
        this.showCustomerForm = false;
        this.customerFormData = {};
    }

    async saveCustomer() {
        if (!this.customerFormData.name?.trim()) {
            return;
        }

        try {
            // Persist client using service (RLS-aware)
            const { success, data, error } = await this.simpleSupabase.createClientFull({
                name: this.customerFormData.name.trim(),
                email: this.customerFormData.email?.trim() || undefined,
                phone: this.customerFormData.phone?.trim() || undefined,
                company_id: this.companyId,
                address: this.customerFormData.address ? { raw: this.customerFormData.address, city: this.customerFormData.city, postal_code: this.customerFormData.postal_code } : undefined
            });

            if (!success || !data) {
                console.error('Error creando cliente:', error);
                this.toast.error('Error', 'No se pudo crear el cliente.');
                return;
            }

            // Update in-memory lists and selection
            this.customers.push(data);
            this.selectCustomer(data);
            this.filteredCustomers = [...this.customers];
            this.closeCustomerForm();
            this.toast.success('Cliente creado', 'Cliente creado correctamente');

        } catch (error) {
            console.error('Error creating customer:', error);
            this.toast.error('Error', 'Error inesperado al crear el cliente');
        }
    }
    // --- Products Logic ---
    filterProducts() {
        if (!this.productSearchText.trim()) {
            this.filteredProducts = [...this.topUsedProducts];
            return;
        }
        const term = this.productSearchText.toLowerCase();
        this.filteredProducts = this.availableProducts.filter(p =>
            p.name.toLowerCase().includes(term) ||
            p.description?.toLowerCase().includes(term)
        );
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
    }

    updateProductQuantity(productId: string, quantity: number) {
        const item = this.selectedProducts.find(p => p.product.id === productId);
        if (item) {
            item.quantity = Math.max(1, quantity);
        }
    }

    removeProductFromTicket(productId: string) {
        this.selectedProducts = this.selectedProducts.filter(p => p.product.id !== productId);
    }

    // --- Devices Logic ---
    async loadCustomerDevices() {
        if (!this.selectedCustomer) return;
        try {
            const devices = await this.devicesService.getDevices(this.companyId);
            this.customerDevices = devices.filter(d => d.client_id === this.selectedCustomer?.id);
            this.filteredCustomerDevices = [...this.customerDevices];
        } catch (e) {
            console.error('Error loading devices', e);
        }
    }

    addDeviceToTicket(device: Device) {
        if (!this.selectedDevices.find(d => d.id === device.id)) {
            this.selectedDevices.push(device);
        }
    }

    removeDeviceFromTicket(deviceId: string) {
        this.selectedDevices = this.selectedDevices.filter(d => d.id !== deviceId);
    }

    isDeviceSelected(deviceId: string): boolean {
        return this.selectedDevices.some(d => d.id === deviceId);
    }

    // --- Calculations ---
    getSelectedServicesTotal(): number {
        return this.selectedServices.reduce((acc, item) => acc + ((item.unit_price || 0) * item.quantity), 0);
    }

    getSelectedProductsTotal(): number {
        return this.selectedProducts.reduce((acc, item) => acc + ((item.unit_price || 0) * item.quantity), 0);
    }

    getTotalEstimatedHours(): number {
        return this.selectedServices.reduce((acc, item) => acc + ((item.service.estimated_hours || 0) * item.quantity), 0);
    }

    getGrandTotal(): number {
        return this.getSelectedServicesTotal() + this.getSelectedProductsTotal();
    }
    // Tags Management
    async loadTags() {
        try {
            const { data, error } = await this.simpleSupabase.getClient()
                .from('ticket_tags')
                .select('*')
                .eq('company_id', this.companyId)
                .order('name');

            if (error) throw error;
            this.availableTags = data || [];
            this.filteredTags = [...this.availableTags];
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    }

    filterTags() {
        if (!this.tagSearchText.trim()) {
            this.filteredTags = [...this.availableTags];
            return;
        }
        const search = this.tagSearchText.toLowerCase();
        this.filteredTags = this.availableTags.filter(t => t.name.toLowerCase().includes(search));
    }

    toggleTag(tagName: string) {
        const index = this.selectedTags.indexOf(tagName);
        if (index >= 0) {
            this.selectedTags.splice(index, 1);
        } else {
            this.selectedTags.push(tagName);
        }
    }

    removeTag(tagName: string) {
        const index = this.selectedTags.indexOf(tagName);
        if (index >= 0) {
            this.selectedTags.splice(index, 1);
        }
    }

    async syncTicketTags(ticketId: string, tagNames: string[]) {
        if (!ticketId) return;

        try {
            // Get IDs for selected tags
            const tagIds: string[] = [];
            for (const name of tagNames) {
                const tag = this.availableTags.find(t => t.name === name);
                if (tag) {
                    tagIds.push(tag.id);
                }
            }

            // Sync: delete existing relations and insert new
            await this.simpleSupabase.getClient()
                .from('ticket_tag_relations')
                .delete()
                .eq('ticket_id', ticketId);

            if (tagIds.length > 0) {
                const relations = tagIds.map(tagId => ({
                    ticket_id: ticketId,
                    tag_id: tagId,
                    company_id: this.companyId
                }));
                await this.simpleSupabase.getClient()
                    .from('ticket_tag_relations')
                    .insert(relations);
            }
        } catch (error) {
            console.error('Error syncing tags:', error);
        }
    }
}
