import { Component, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseTicketsService, Ticket, TicketStage, TicketStats } from '../../services/supabase-tickets.service';
import { SupabaseServicesService, Service } from '../../services/supabase-services.service';
import { SimpleSupabaseService, SimpleClient } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-supabase-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supabase-tickets.component.html',
  styleUrl: './supabase-tickets.component.scss'
})
export class SupabaseTicketsComponent implements OnInit {
  
  // Company selector for development
  selectedCompanyId: string = '1'; // Default to SatPCGo
  companies: any[] = [];
  
  // Core data
  tickets: Ticket[] = [];
  filteredTickets: Ticket[] = [];
  stages: TicketStage[] = [];
  stats: TicketStats = {
    total: 0,
    open: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    avgResolutionTime: 0,
    totalRevenue: 0
  };
  
  loading = false;
  error: string | null = null;
  
  // Filters and search
  searchTerm = '';
  filterStage = '';
  filterPriority = '';
  filterStatus = '';
  viewMode: 'list' | 'board' = 'list';
  
  // Form management
  showForm = false;
  editingTicket: Ticket | null = null;
  formData: Partial<Ticket> = {};
  
  // Services management
  availableServices: Service[] = [];
  filteredServices: Service[] = [];
  topUsedServices: Service[] = [];
  serviceSearchText: string = '';
  selectedServices: { service: Service; quantity: number }[] = [];
  showServiceForm = false;
  serviceFormData: Partial<Service> = {};
  
  // Customer selection
  customers: SimpleClient[] = [];
  filteredCustomers: SimpleClient[] = [];
  customerSearchText = '';
  selectedCustomer: SimpleClient | null = null;
  showCustomerDropdown = false;
  
  // Form validation
  formErrors: Record<string, string> = {};
  
  private ticketsService = inject(SupabaseTicketsService);
  private servicesService = inject(SupabaseServicesService);
  private simpleSupabase = inject(SimpleSupabaseService);
  private router = inject(Router);

  ngOnInit() {
    this.loadCompanies();
    this.loadTickets();
    this.loadStages();
    this.loadServices();
    this.loadCustomers();
  }

  onCompanyChange() {
    console.log(`Cambiando a empresa ID: ${this.selectedCompanyId}`);
    this.loadTickets();
    this.loadStages();
    this.loadServices();
    this.loadCustomers();
  }

  async loadCompanies() {
    try {
      const res = await this.simpleSupabase.getCompanies();
      if (res.success) {
        this.companies = res.data || [];
        // Default to first company if none selected
        if (!this.selectedCompanyId && this.companies.length > 0) {
          this.selectedCompanyId = this.companies[0].id;
        }
      } else {
        console.warn('No se pudieron cargar companies:', res.error);
      }
    } catch (err) {
      console.error('Error cargando companies', err);
    }
  }

  async loadTickets() {
    this.loading = true;
    this.error = null;
    
    try {
      console.log(`Cargando tickets para empresa ID: ${this.selectedCompanyId}`);
      this.tickets = await this.ticketsService.getTickets(parseInt(this.selectedCompanyId));
      this.updateFilteredTickets();
      this.loadStats();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error loading tickets:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadStages() {
    try {
      this.stages = await this.ticketsService.getTicketStages(parseInt(this.selectedCompanyId));
    } catch (error: any) {
      console.error('❌ Error loading stages:', error);
    }
  }

  async loadStats() {
    try {
      this.stats = await this.ticketsService.getTicketStats(parseInt(this.selectedCompanyId));
    } catch (error: any) {
      console.error('❌ Error loading stats:', error);
    }
  }

  async loadServices() {
    try {
      this.availableServices = await this.servicesService.getServices(this.selectedCompanyId);
      // Filtrar solo servicios activos
      this.availableServices = this.availableServices.filter(service => service.is_active);
      
      // Obtener los 3 servicios más usados
      this.topUsedServices = await this.getTopUsedServices();
      
      // Inicialmente mostrar solo los más usados
      this.filteredServices = [...this.topUsedServices];
    } catch (error: any) {
      console.error('❌ Error loading services:', error);
    }
  }

  async getTopUsedServices(): Promise<Service[]> {
    try {
      // Por simplicidad, obtener todos los tickets y contar servicios usados
      const tickets = await this.ticketsService.getTickets(Number(this.selectedCompanyId));
      const serviceCounts = new Map<string, number>();

      // Contar servicios en los tickets existentes (si tienen servicios)
      tickets.forEach(ticket => {
        if (ticket.services && Array.isArray(ticket.services)) {
          ticket.services.forEach((serviceItem: any) => {
            const serviceId = serviceItem.service_id || serviceItem.id;
            serviceCounts.set(serviceId, (serviceCounts.get(serviceId) || 0) + 1);
          });
        }
      });

      // Obtener los servicios más usados
      const sortedServiceIds = Array.from(serviceCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([serviceId]) => serviceId);

      // Filtrar servicios disponibles que coincidan con los más usados
      const topServices = this.availableServices.filter(service => 
        sortedServiceIds.includes(service.id)
      );

      // Si tenemos menos de 3, completar con los primeros servicios disponibles
      if (topServices.length < 3) {
        const usedServiceIds = new Set(topServices.map(s => s.id));
        const additionalServices = this.availableServices
          .filter(s => !usedServiceIds.has(s.id))
          .slice(0, 3 - topServices.length);
        
        return [...topServices, ...additionalServices];
      }

      return topServices;
    } catch (error) {
      console.error('Error getting top used services:', error);
      // Fallback: devolver los primeros 3 servicios disponibles
      return this.availableServices.slice(0, 3);
    }
  }

  async loadCustomers() {
    try {
      // Usar SimpleSupabaseService para obtener clientes
      const response = await this.simpleSupabase.getClients();
      
      if (response.success && response.data) {
        this.customers = response.data;
        this.filteredCustomers = [...this.customers];
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  }

  updateFilteredTickets() {
    let filtered = [...this.tickets];

    // Filter by search term
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(ticket => 
        ticket.title.toLowerCase().includes(term) ||
        ticket.description.toLowerCase().includes(term) ||
        ticket.ticket_number.toLowerCase().includes(term) ||
        ticket.client?.name?.toLowerCase().includes(term)
      );
    }

    // Filter by stage
    if (this.filterStage) {
      filtered = filtered.filter(ticket => ticket.stage_id === this.filterStage);
    }

    // Filter by priority
    if (this.filterPriority) {
      filtered = filtered.filter(ticket => ticket.priority === this.filterPriority);
    }

    // Filter by status
    if (this.filterStatus === 'open') {
      filtered = filtered.filter(ticket => ticket.stage?.name !== 'Completado');
    } else if (this.filterStatus === 'completed') {
      filtered = filtered.filter(ticket => ticket.stage?.name === 'Completado');
    } else if (this.filterStatus === 'overdue') {
      filtered = filtered.filter(ticket => 
        ticket.due_date && new Date(ticket.due_date) < new Date()
      );
    }

    this.filteredTickets = filtered;
  }

  onSearch() {
    this.updateFilteredTickets();
  }

  onFilterChange() {
    this.updateFilteredTickets();
  }

  clearFilters() {
    this.searchTerm = '';
    this.filterStage = '';
    this.filterPriority = '';
    this.filterStatus = '';
    this.updateFilteredTickets();
  }

  // Form methods
  openForm(ticket?: Ticket) {
    this.editingTicket = ticket || null;
    this.formData = ticket ? { ...ticket } : {
      title: '',
      description: '',
      client_id: '',
      stage_id: this.stages[0]?.id || '',
      priority: 'normal',
      estimated_hours: 1,
      company_id: this.selectedCompanyId
    };
    this.formErrors = {};
    this.selectedServices = [];
    this.serviceSearchText = '';
    this.filteredServices = [...this.topUsedServices];
    this.customerSearchText = '';
    this.selectedCustomer = null;
    this.showCustomerDropdown = false;
    this.filteredCustomers = [...this.customers];
    this.showForm = true;
    
    // Bloquear scroll de la página principal de forma más agresiva
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
  }

  closeForm() {
    this.showForm = false;
    this.editingTicket = null;
    this.formData = {};
    this.formErrors = {};
    this.selectedServices = [];
    this.showServiceForm = false;
    
    // Restaurar scroll de la página principal
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
  }

  // Services management methods
  addServiceToTicket(service: Service) {
    const existing = this.selectedServices.find(s => s.service.id === service.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.selectedServices.push({ service, quantity: 1 });
    }
    // Clear search after adding and return to top used services
    this.serviceSearchText = '';
    this.filteredServices = [...this.topUsedServices];
  }

  removeServiceFromTicket(serviceId: string) {
    this.selectedServices = this.selectedServices.filter(s => s.service.id !== serviceId);
  }

  updateServiceQuantity(serviceId: string, quantity: number) {
    const serviceItem = this.selectedServices.find(s => s.service.id === serviceId);
    if (serviceItem) {
      serviceItem.quantity = Math.max(1, quantity);
    }
  }

  filterServices() {
    if (!this.serviceSearchText.trim()) {
      // Si no hay búsqueda, mostrar solo los 3 más usados
      this.filteredServices = [...this.topUsedServices];
      return;
    }

    // Si hay búsqueda, filtrar de todos los servicios disponibles
    const searchText = this.serviceSearchText.toLowerCase().trim();
    this.filteredServices = this.availableServices.filter(service =>
      service.name.toLowerCase().includes(searchText) ||
      service.description?.toLowerCase().includes(searchText) ||
      service.category?.toLowerCase().includes(searchText)
    );
  }

  // Customer search and selection methods
  filterCustomers() {
    if (!this.customerSearchText.trim()) {
      this.filteredCustomers = [...this.customers];
      return;
    }

    const searchText = this.customerSearchText.toLowerCase().trim();
    this.filteredCustomers = this.customers.filter(customer =>
      customer.name.toLowerCase().includes(searchText) ||
      customer.email?.toLowerCase().includes(searchText) ||
      customer.phone?.toLowerCase().includes(searchText)
    );
  }

  selectCustomer(customer: SimpleClient) {
    this.selectedCustomer = customer;
    this.formData.client_id = customer.id;
    this.customerSearchText = customer.name;
    this.showCustomerDropdown = false;
  }

  clearCustomerSelection() {
    this.selectedCustomer = null;
    this.formData.client_id = '';
    this.customerSearchText = '';
  }

  onCustomerSearchFocus() {
    this.showCustomerDropdown = true;
    this.filteredCustomers = [...this.customers];
  }

  // Listen for clicks outside the customer dropdown
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    const customerContainer = target.closest('.customer-search-container');
    if (!customerContainer) {
      this.showCustomerDropdown = false;
    }
  }

  getSelectedServicesTotal(): number {
    return this.selectedServices.reduce((total, item) => {
      return total + (item.service.base_price * item.quantity);
    }, 0);
  }

  getTotalEstimatedHours(): number {
    return this.selectedServices.reduce((total, item) => {
      return total + (item.service.estimated_hours * item.quantity);
    }, 0);
  }

  isServiceSelected(serviceId: string): boolean {
    return this.selectedServices.some(s => s.service.id === serviceId);
  }

  openServiceForm() {
    this.serviceFormData = {
      name: '',
      description: '',
      base_price: 0,
      estimated_hours: 1,
      category: '',
      is_active: true,
      company_id: this.selectedCompanyId
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
        alert('El nombre del servicio es requerido');
        return;
      }

      const newService = await this.servicesService.createService(this.serviceFormData as Service);
      this.availableServices.push(newService);
      this.addServiceToTicket(newService);
      this.closeServiceForm();
    } catch (error: any) {
      console.error('Error creando servicio:', error);
      alert('Error al crear el servicio');
    }
  }

  validateForm(): boolean {
    this.formErrors = {};

    if (!this.formData.title?.trim()) {
      this.formErrors['title'] = 'El título es requerido';
    }

    if (!this.formData.description?.trim()) {
      this.formErrors['description'] = 'La descripción es requerida';
    }

    if (!this.formData.client_id?.trim()) {
      this.formErrors['client_id'] = 'El cliente es requerido';
    }

    if (!this.formData.stage_id?.trim()) {
      this.formErrors['stage_id'] = 'El estado es requerido';
    }

    if (this.formData.estimated_hours && this.formData.estimated_hours <= 0) {
      this.formErrors['estimated_hours'] = 'Las horas estimadas deben ser mayor a 0';
    }

    // Validar que hay al menos un servicio seleccionado
    if (this.selectedServices.length === 0) {
      this.formErrors['services'] = 'Debe seleccionar al menos un servicio';
    }

    return Object.keys(this.formErrors).length === 0;
  }

  async saveTicket() {
    if (!this.validateForm()) return;
    
    this.loading = true;
    try {
      // Autocomputar horas estimadas basándose en los servicios seleccionados
      const totalHours = this.getTotalEstimatedHours();
      
      // Add company_id to form data
      const dataWithCompany = {
        ...this.formData,
        company_id: this.selectedCompanyId,
        estimated_hours: totalHours > 0 ? totalHours : this.formData.estimated_hours
      };

      if (this.editingTicket) {
        await this.ticketsService.updateTicket(this.editingTicket.id, dataWithCompany);
      } else {
        await this.ticketsService.createTicket(dataWithCompany);
      }
      
      this.closeForm();
      await this.loadTickets();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error saving ticket:', error);
    } finally {
      this.loading = false;
    }
  }

  async deleteTicket(ticket: Ticket) {
    if (!confirm(`¿Estás seguro de que deseas eliminar el ticket "${ticket.title}"?`)) {
      return;
    }

    this.loading = true;
    try {
      await this.ticketsService.deleteTicket(ticket.id);
      await this.loadTickets();
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error deleting ticket:', error);
    } finally {
      this.loading = false;
    }
  }

  // Navigation
  viewTicketDetail(ticket: Ticket) {
    this.router.navigate(['/tickets', ticket.id]);
  }

  // Utility methods
  getPriorityColor(priority: string): string {
    return this.ticketsService.getPriorityColor(priority);
  }

  getPriorityLabel(priority: string): string {
    return this.ticketsService.getPriorityLabel(priority);
  }

  formatDate(dateString: string): string {
    return this.ticketsService.formatDate(dateString);
  }

  getStatusBadgeClass(stage: TicketStage): string {
    const baseClasses = 'px-2 py-1 text-xs font-medium rounded-full';
    
    if (stage.name === 'Completado') {
      return `${baseClasses} bg-green-100 text-green-800`;
    } else if (stage.name === 'En Progreso') {
      return `${baseClasses} bg-blue-100 text-blue-800`;
    } else if (stage.name === 'Esperando Cliente') {
      return `${baseClasses} bg-purple-100 text-purple-800`;
    } else if (stage.name === 'En Diagnóstico') {
      return `${baseClasses} bg-yellow-100 text-yellow-800`;
    } else {
      return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  }

  isOverdue(ticket: Ticket): boolean {
    return ticket.due_date ? new Date(ticket.due_date) < new Date() : false;
  }

  getCompanyName(): string {
    const company = this.companies.find(c => c.id === this.selectedCompanyId);
    return company ? company.name : 'Empresa';
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'list' ? 'board' : 'list';
  }

  getTicketsByStage(stageId: string): Ticket[] {
    return this.filteredTickets.filter(ticket => ticket.stage_id === stageId);
  }
}
