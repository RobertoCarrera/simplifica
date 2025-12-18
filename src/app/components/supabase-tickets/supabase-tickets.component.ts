import { Component, OnInit, OnDestroy, inject, HostListener, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { TicketModalService } from '../../services/ticket-modal.service';
import { SupabaseTicketsService, Ticket, TicketStage, TicketStats } from '../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage as ConfigStage } from '../../services/supabase-ticket-stages.service';
import { SupabaseServicesService, Service } from '../../services/supabase-services.service';
import { ProductsService } from '../../services/products.service';
import { ProductMetadataService } from '../../services/product-metadata.service';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SimpleSupabaseService, SimpleClient } from '../../services/simple-supabase.service';
import { DevicesService, Device } from '../../services/devices.service';
import { DevRoleService } from '../../services/dev-role.service';
import { AuthService } from '../../services/auth.service';
import { PortalTicketWizardComponent } from '../portal-ticket-wizard/portal-ticket-wizard.component';
import { SkeletonLoaderComponent } from '../../shared/components/skeleton-loader/skeleton-loader.component';

// Interfaces para tags
export interface TicketTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  company_id?: string;
}

export interface TagWithCount extends TicketTag {
  count: number;
}

@Component({
  selector: 'app-supabase-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, PortalTicketWizardComponent, SkeletonLoaderComponent],
  templateUrl: './supabase-tickets.component.html',
  styleUrl: './supabase-tickets.component.scss'
})
export class SupabaseTicketsComponent implements OnInit, OnDestroy {
  // Emit when the internal modal is closed so dynamic hosts can cleanup
  modalClosed: EventEmitter<void> = new EventEmitter<void>();

  // Company selector for development
  selectedCompanyId: string = ''; // Will be set from first available company
  companies: any[] = [];
  devRoleService = inject(DevRoleService);
  private authService = inject(AuthService);

  // Role detection for client portal
  isClient = computed(() => this.authService.userRole() === 'client');

  // Core data
  tickets: Ticket[] = [];
  filteredTickets: Ticket[] = [];
  stages: ConfigStage[] = [];

  private stagesSvc = inject(SupabaseTicketStagesService);
  availableTags: TicketTag[] = [];
  selectedTags: string[] = [];
  stats: TicketStats = {
    total: 0,
    open: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    avgResolutionTime: 0,
    totalRevenue: 0,
    totalEstimatedHours: 0,
    totalActualHours: 0
  };

  loading = false;
  error: string | null = null;

  // Filters and search
  searchTerm = '';
  filterStage = '';
  filterPriority = '';
  filterStatus = '';
  // Realtime
  private realtimeChannel: RealtimeChannel | null = null;

  filterTags: string[] = [];
  viewMode: 'list' | 'board' = 'list';
  // Visibility toggles
  showCompleted = false;
  showDeleted = false;

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalItems = 0;
  Math = Math; // For use in template

  // Custom dropdown states
  stageDropdownOpen = false;
  priorityDropdownOpen = false;

  // Priority options for dropdown
  priorityOptions = [
    { value: '', label: 'Todas las prioridades' },
    { value: 'low', label: 'Baja' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'Alta' },
    { value: 'critical', label: 'Crítica' }
  ];

  // Form management
  showForm = false;
  showWizard = false; // State for client wizard
  editingTicket: Ticket | null = null;
  formData: Partial<Ticket> = {};

  // History management for modals
  private popStateListener: any = null;

  // Services management
  availableServices: Service[] = [];
  filteredServices: Service[] = [];
  topUsedServices: Service[] = [];
  serviceSearchText: string = '';
  selectedServices: { service: Service; quantity: number }[] = [];
  showServiceForm = false;
  serviceFormData: Partial<Service> = {};

  // Products management
  availableProducts: any[] = [];
  filteredProducts: any[] = [];
  topUsedProducts: any[] = [];
  productSearchText: string = '';
  selectedProducts: { product: any; quantity: number }[] = [];
  showProductForm = false;
  productFormData: any = {};

  // Product autocomplete for brands and categories
  availableBrands: any[] = [];
  filteredBrands: any[] = [];
  brandSearchText: string = '';
  showBrandInput = false;

  availableCategories: any[] = [];
  filteredCategories: any[] = [];
  categorySearchText: string = '';
  showCategoryInput = false;

  // Customer selection
  customers: SimpleClient[] = [];
  filteredCustomers: SimpleClient[] = [];
  customerSearchText = '';
  selectedCustomer: SimpleClient | null = null;
  showCustomerDropdown = false;
  showCustomerForm = false;
  customerFormData = {
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    notes: ''
  };

  // Device management
  availableDevices: Device[] = [];
  selectedDevices: Device[] = [];
  showDeviceForm = false;
  deviceFormData: Partial<Device> = {};
  showCreateDeviceForm = false;
  deviceSearchText = '';
  filteredCustomerDevices: Device[] = [];
  customerDevices: Device[] = [];
  selectedDeviceImages: { file: File; preview: string }[] = [];

  // Form validation
  formErrors: Record<string, string> = {};

  // Delete reason modal (for client portal)
  showDeleteReasonModal = false;
  deleteReasonText = '';
  ticketToDelete: Ticket | null = null;
  private ticketsService = inject(SupabaseTicketsService);
  private servicesService = inject(SupabaseServicesService);
  private productsService = inject(ProductsService);
  private productMetadataService = inject(ProductMetadataService);
  private simpleSupabase = inject(SimpleSupabaseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private ticketModalService = inject(TicketModalService);
  private devicesService = inject(DevicesService);

  // Badge configurations
  ticketPriorityConfig: { [key: string]: { label: string; classes: string; icon: string } } = {
    low: {
      label: 'Baja',
      classes: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
      icon: 'fa-flag'
    },
    normal: {
      label: 'Normal',
      classes: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
      icon: 'fa-flag'
    },
    high: {
      label: 'Alta',
      classes: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
      icon: 'fa-flag'
    },
    urgent: {
      label: 'Crítica',
      classes: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
      icon: 'fa-flag'
    }
  };

  private isValidUuid(id: string | undefined | null): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  private setupRealtimeSubscription() {
    if (this.realtimeChannel) {
      return;
    }

    const client = this.simpleSupabase.getClient();
    this.realtimeChannel = client
      .channel('public:tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          console.log('[SupabaseTickets] Realtime change received:', payload);
          // Reload tickets on any change
          this.loadTickets().then(async () => {
            // Load tags for the new tickets
            await this.loadTicketTagsForTickets();
            // Also reload stats as they might have changed
            await this.loadStats();
          });
        }
      )
      .subscribe();
  }

  ngOnInit() {
    this.initializeComponent();
  }

  // Listen to programmatic modal open requests from other components
  ngAfterViewInit() {
    this.ticketModalService.open$.subscribe(async (ticket) => {
      console.debug('[SupabaseTickets] ticketModalService.open$ event received', ticket && (ticket.id || ticket));
      // If we received an id, load the ticket first
      let toOpen = ticket;
      if (typeof ticket === 'string') {
        try {
          const { data: ticketData, error } = await this.simpleSupabase.getClient()
            .from('tickets')
            .select(`*, client:clients(id, name, email, phone), stage:ticket_stages(id, name, color, position), company:companies(id, name)`)
            .eq('id', ticket)
            .single();
          if (!error) toOpen = ticketData;
        } catch (e) {
          console.warn('No se pudo cargar ticket para editar:', e);
          return;
        }
      }

      if (toOpen) {
        this.openForm(toOpen as any);
      }
    });
  }

  private async initializeComponent() {
    try {
      this.loading = true;
      await this.loadCompanies();

      if (this.companies.length === 0) {
        this.error = 'No hay compañías disponibles. Por favor, ejecute el script de configuración de la base de datos.';
        return;
      }
      // Intentar resolver la empresa por defecto a partir del usuario autenticado
      try {
        const client = this.simpleSupabase.getClient();
        const { data: userRes, error: userErr } = await client.auth.getUser();
        if (!userErr && userRes?.user?.id) {
          const authUid = userRes.user.id;
          // Resolver company por tabla users
          let resolvedCompany: string | null = null;
          try {
            const { data: uRow } = await client
              .from('users')
              .select('company_id')
              .eq('auth_user_id', authUid)
              .limit(1)
              .maybeSingle();
            if (uRow && this.isValidUuid(uRow.company_id)) {
              resolvedCompany = uRow.company_id;
            }
          } catch (e) {
            console.warn('No se pudo resolver company_id desde users:', e);
          }

          // Fallback: buscar en clients si no se encontró en users
          if (!resolvedCompany) {
            try {
              const { data: cRow } = await client
                .from('clients')
                .select('company_id')
                .eq('auth_user_id', authUid)
                .limit(1)
                .maybeSingle();
              if (cRow && this.isValidUuid(cRow.company_id)) {
                resolvedCompany = cRow.company_id;
              }
            } catch (e) {
              console.warn('No se pudo resolver company_id desde clients:', e);
            }
          }

          if (resolvedCompany && this.isValidUuid(resolvedCompany)) {
            this.selectedCompanyId = resolvedCompany;
          }
        }
      } catch (e) {
        console.warn('No se pudo resolver la empresa por defecto desde el usuario, se usará fallback al primer registro:', e);
      }

      // Fallback: primera empresa válida si aún no se ha seleccionado
      if (!this.selectedCompanyId) {
        const candidate = this.companies[0]?.id;
        if (this.isValidUuid(candidate)) {
          this.selectedCompanyId = candidate;
        } else {
          console.warn('SupabaseTicketsComponent: first company id is not a UUID, leaving selectedCompanyId empty:', candidate);
          this.selectedCompanyId = '';
        }
      }

      // Establecer el contexto de compañía en el servicio para que RLS y filtros funcionen para todos los usuarios
      if (this.selectedCompanyId) {
        try {
          await this.simpleSupabase.setCurrentCompany(this.selectedCompanyId);
        } catch (e) {
          console.warn('No se pudo establecer el contexto de compañía (setCurrentCompany). Continuando...', e);
        }
      }

      // Load stages first, then tickets (and tags/stats in parallel after tickets)
      await this.loadStages();

      // Load tickets and other independent data in parallel
      await Promise.all([
        this.loadTickets(1),
        this.loadStats(), // Does not depend on tickets, only company
        this.loadServices(),
        this.loadProducts(),
        this.loadCustomers(),
        this.loadTags()
      ]);

      // Tags depend on loaded tickets, so run after tickets are loaded if needed
      // But loadTickets already calls loadTicketTagsForTickets internally now if we structure it right
      // Or we chain it within loadTickets promise


      this.setupRealtimeSubscription();

    } catch (error) {
      console.error('Error initializing component:', error);
      this.error = 'Error al cargar los datos. Verifique la configuración de la base de datos.';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    // Unsubscribe from realtime
    if (this.realtimeChannel) {
      this.simpleSupabase.getClient().removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }

    // Asegurar que el scroll se restaure si el componente se destruye con modal abierto
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';

    // Limpiar listener de popstate
    if (this.popStateListener) {
      window.removeEventListener('popstate', this.popStateListener);
      this.popStateListener = null;
    }
  }

  private async loadCompanies() {
    try {
      // Get all available companies using simpleSupabase
      const response = await this.simpleSupabase.getCompanies();

      if (response.success) {
        this.companies = response.data || [];
      } else {
        console.error('Error loading companies:', response.error);
        this.companies = [];
      }
    } catch (error) {
      console.error('Error in loadCompanies:', error);
      this.companies = [];
    }
  }

  async onCompanyChange() {
    // Actualizar el contexto de compañía antes de recargar datos para que RLS aplique correctamente
    if (this.isValidUuid(this.selectedCompanyId)) {
      try {
        await this.simpleSupabase.setCurrentCompany(this.selectedCompanyId);
      } catch (e) {
        console.warn('No se pudo establecer el contexto de compañía al cambiarla:', e);
      }
    }

    // Load order: stages first, then tickets
    await this.loadStages();
    await this.loadTickets(1);
    await this.loadStats();

    // Load other data in parallel
    await Promise.all([
      this.loadServices(),
      this.loadProducts(),
      this.loadCustomers(),
      this.loadDevices(),
      this.loadTags()
    ]);
  }

  // Pagination Handler
  async onPageChange(page: number) {
    if (page < 1 || page > Math.ceil(this.totalItems / this.pageSize)) return;
    this.currentPage = page;
    await this.loadTickets(page);
  }

  async loadTickets(page: number = this.currentPage) {
    this.loading = true;
    this.error = null;
    this.currentPage = page;

    if (!this.selectedCompanyId) {
      this.loading = false;
      return;
    }

    try {
      const from = (page - 1) * this.pageSize;
      const to = from + this.pageSize - 1;

      // Usar UUID directamente, no convertir a número
      let query: any = this.simpleSupabase.getClient()
        .from('tickets')
        .select(`
          *,
          client:clients(id, name, email, phone),
          stage:ticket_stages(id, name, color, position, stage_category, workflow_category),
          company:companies(id, name)
        `, { count: 'exact' });

      // Exclude deleted by default; include when toggled
      if (!this.showDeleted) {
        query = query.is('deleted_at', null);
      }

      // --- Server-Side Filters ---

      // 1. Company Filter
      if (this.isValidUuid(this.selectedCompanyId)) {
        query = query.eq('company_id', this.selectedCompanyId);
      } else {
        console.warn('⚠️ Skipping company_id filter for tickets because selectedCompanyId is invalid:', this.selectedCompanyId);
      }

      // 2. Client Portal Filter
      if (this.isClient()) {
        const clientId = (this.authService as any).currentProfile?.client_id;
        if (clientId) {
          query = query.eq('client_id', clientId);
        }
      }

      // 3. Stage Filter
      if (this.filterStage) {
        query = query.eq('stage_id', this.filterStage);
      }

      // 4. Search Filter (Title or Ticket Number)
      if (this.searchTerm && this.searchTerm.trim() !== '') {
        const term = this.searchTerm.trim();
        // Use ILIKE for case-insensitive search on title OR ticket_number
        query = query.or(`title.ilike.%${term}%,ticket_number.ilike.%${term}%`);
      }

      // 5. Priority Filter (optional)
      if (this.filterPriority) {
        query = query.eq('priority', this.filterPriority);
      }

      // Order and Pagination
      query = query.order('created_at', { ascending: false })
        .range(from, to);

      const { data: tickets, error, count } = await query;

      if (error) {
        throw new Error(`Error al cargar tickets: ${error.message}`);
      }

      this.tickets = tickets || [];
      this.totalItems = count || 0;

      // Load tags only for the current page tickets
      await this.loadTicketTagsForTickets();

      // Client-side filtering check (for legacy compatibility or small adjustments)
      this.updateFilteredTickets();

    } catch (error) {
      console.error('Error in loadTickets:', error);
      this.error = 'Error de conexión al cargar los tickets';
    } finally {
      this.loading = false;
    }
  }

  async loadStages() {
    if (!this.selectedCompanyId) return;

    try {
      // Usar la fuente de verdad de "estados visibles" (genéricos no ocultos + específicos de empresa)
      const { data, error } = await this.stagesSvc.getVisibleStages(this.selectedCompanyId);
      if (error) {
        console.error('Error cargando stages visibles:', error);
        this.stages = [];
        return;
      }
      // Ensure UI ordering by position
      this.stages = (data || []).slice().sort((a: any, b: any) => (Number(a?.position ?? 0) - Number(b?.position ?? 0)));
    } catch (error) {
      console.error('Error in loadStages:', error);
    }
  }

  async loadStats() {
    if (!this.selectedCompanyId) return;

    try {

      // Usar la función del backend para calcular estadísticas
      const { data: statsResult, error } = await this.simpleSupabase.getClient()
        .rpc('get_ticket_stats', { target_company_id: this.selectedCompanyId });

      if (error) {
        console.error('Error obteniendo estadísticas del backend:', error);
        // Fallback: calcular en frontend si la función no existe
        this.calculateStatsInFrontend();
        return;
      }

      if (statsResult) {
        this.stats = {
          total: statsResult.total || 0,
          open: statsResult.open || 0,
          inProgress: statsResult.inProgress || 0,
          completed: statsResult.completed || 0,
          overdue: statsResult.overdue || 0,
          avgResolutionTime: statsResult.avgResolutionTime || 0,
          totalRevenue: statsResult.totalRevenue || 0,
          totalEstimatedHours: statsResult.totalEstimatedHours || 0,
          totalActualHours: statsResult.totalActualHours || 0
        };

      } else {
        // Fallback si no hay datos
        this.calculateStatsInFrontend();
      }

    } catch (error) {
      console.error('Error en loadStats:', error);
      // Fallback: calcular en frontend
      this.calculateStatsInFrontend();
    }
  }

  private calculateStatsInFrontend() {

    // Calcular estadísticas desde los tickets reales usando stage_category
    const totalTickets = this.tickets.length;

    // Usar stage_category para clasificación confiable
    const openTickets = this.tickets.filter(t => t.stage?.workflow_category === 'waiting' || t.stage?.stage_category === 'open').length;
    const inProgressTickets = this.tickets.filter(t => (
      t.stage?.workflow_category === 'analysis' || t.stage?.workflow_category === 'action' || t.stage?.stage_category === 'in_progress'
    )).length;
    const completedTickets = this.tickets.filter(t => (
      t.stage?.workflow_category === 'final' || t.stage?.workflow_category === 'cancel' || t.stage?.stage_category === 'completed'
    )).length;

    // Fallback: si no hay stage_category, usar nombres (backward compatibility)
    const openTicketsFallback = openTickets > 0 ? openTickets : this.tickets.filter(t =>
      t.stage?.name?.toLowerCase().includes('abierto') ||
      t.stage?.name?.toLowerCase().includes('pendiente') ||
      t.stage?.name?.toLowerCase().includes('recibido')
    ).length;

    const inProgressTicketsFallback = inProgressTickets > 0 ? inProgressTickets : this.tickets.filter(t =>
      t.stage?.name?.toLowerCase().includes('progreso') ||
      t.stage?.name?.toLowerCase().includes('proceso')
    ).length;

    const completedTicketsFallback = completedTickets > 0 ? completedTickets : this.tickets.filter(t =>
      t.stage?.name?.toLowerCase().includes('completado') ||
      t.stage?.name?.toLowerCase().includes('finalizado')
    ).length;

    const overdueTickets = this.tickets.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;
    const totalRevenue = this.tickets.reduce((sum, t) => sum + (t.total_amount || 0), 0);

    // Calcular suma de horas estimadas y reales
    const totalEstimatedHours = this.tickets.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const totalActualHours = this.tickets.reduce((sum, t) => sum + (t.actual_hours || 0), 0);

    // Calcular tiempo promedio de resolución para tickets completados
    const completedTicketsWithDates = this.tickets.filter(t =>
      (t.stage?.workflow_category === 'final' || t.stage?.workflow_category === 'cancel' || t.stage?.stage_category === 'completed' ||
        t.stage?.name?.toLowerCase().includes('completado') ||
        t.stage?.name?.toLowerCase().includes('finalizado')) &&
      t.created_at && t.updated_at
    );

    let avgResolutionTime = 0;
    if (completedTicketsWithDates.length > 0) {
      const totalResolutionTime = completedTicketsWithDates.reduce((sum, t) => {
        const created = new Date(t.created_at).getTime();
        const completed = new Date(t.updated_at).getTime();
        return sum + (completed - created);
      }, 0);
      avgResolutionTime = Math.round(totalResolutionTime / completedTicketsWithDates.length / (1000 * 60 * 60 * 24)); // días
    }

    this.stats = {
      total: totalTickets,
      open: openTicketsFallback,
      inProgress: inProgressTicketsFallback,
      completed: completedTicketsFallback,
      overdue: overdueTickets,
      avgResolutionTime: avgResolutionTime,
      totalRevenue: totalRevenue,
      totalEstimatedHours: totalEstimatedHours,
      totalActualHours: totalActualHours
    };

  }

  // Toggle handlers
  toggleShowCompleted() {
    this.showCompleted = !this.showCompleted;
    this.updateFilteredTickets();
  }

  async toggleShowDeleted() {
    this.showDeleted = !this.showDeleted;
    await this.loadTickets(1);
    this.updateFilteredTickets(); // Redundant but safe
  }

  setViewMode(mode: 'list' | 'board') {
    this.viewMode = mode;
  }

  async loadServices() {
    if (!this.selectedCompanyId) return;

    try {

      const services = await this.servicesService.getServices(this.selectedCompanyId);

      // Filtrar solo servicios activos
      this.availableServices = (services || []).filter((service: any) => service.is_active);

      // Obtener los servicios más usados
      this.topUsedServices = await this.getTopUsedServices();

      // Inicialmente mostrar SOLO los más usados
      this.filteredServices = [...this.topUsedServices];

    } catch (error) {
      console.error('Error in loadServices:', error);
      this.availableServices = [];
      this.filteredServices = [];
    }
  }

  async getTopUsedServices(): Promise<Service[]> {
    try {
      // Prefer server-side computation via RPC for performance and analytics consistency
      if (this.selectedCompanyId) {
        const { data, error } = await this.simpleSupabase
          .getClient()
          .rpc('get_top_used_services', { target_company_id: this.selectedCompanyId, limit_count: 3 });
        if (!error && Array.isArray(data)) {
          return data as Service[];
        }
        if (error) {
          console.warn('get_top_used_services RPC failed, falling back to local slice:', error);
        }
      }
      // Fallback: take first 3 active services if RPC is unavailable
      return this.availableServices.slice(0, 3);
    } catch (error) {
      console.error('Error getting top used services:', error);
      return this.availableServices.slice(0, 3);
    }
  }

  async loadCustomers() {
    if (!this.selectedCompanyId) return;

    try {
      // Obtener clientes filtrando explícitamente por company_id para evitar depender del estado local
      const response = await this.simpleSupabase.getClientsForCompany(this.selectedCompanyId);

      if (response.success && response.data) {
        // Ya vienen filtrados por empresa
        this.customers = response.data;
        this.filteredCustomers = [...this.customers];

      } else {
        console.error('Error loading customers:', response.error);
        this.customers = [];
        this.filteredCustomers = [];
      }
    } catch (error) {
      console.error('Error in loadCustomers:', error);
      this.customers = [];
      this.filteredCustomers = [];
    }
  }

  async loadDevices() {
    if (!this.selectedCompanyId) return;

    try {

      const devices = await this.devicesService.getDevices(this.selectedCompanyId);

      this.availableDevices = devices || [];
    } catch (error) {
      console.error('Error in loadDevices:', error);
      this.availableDevices = [];
    }
  }

  // Load ticket services when editing
  async loadTicketServicesForEdit(ticketId: string) {
    if (!ticketId) return;

    try {

      // Query ticket_services table to get services associated with the ticket
      const { data: ticketServices, error } = await this.simpleSupabase.getClient()
        .from('ticket_services')
        .select(`
          quantity,
          price_per_unit,
          total_price,
          service:services (
            id,
            name,
            description,
            base_price,
            estimated_hours,
            category,
            is_active
          )
        `)
        .eq('ticket_id', ticketId);

      if (error) {
        console.error('Error loading ticket services:', error);
        return;
      }

      // Transform the data to match our selectedServices format
      this.selectedServices = (ticketServices || []).map((ts: any) => ({
        service: ts.service,
        quantity: ts.quantity || 1
      }));


    } catch (error) {
      console.error('Error en loadTicketServicesForEdit:', error);
    }
  }
  async loadTags() {
    try {

      const client = this.simpleSupabase.getClient();
      // Comprobación segura: intentamos obtener una fila con company_id; si falla, asumimos que la columna no existe
      let hasCompany = false;
      try {
        // Use a full-row sample select to avoid PostgREST rejecting a narrow projection in some setups
        const { data: sample, error: sampleErr } = await client
          .from('ticket_tags')
          .select('*')
          .limit(1);

        if (!sampleErr && sample && sample.length > 0) {
          hasCompany = Object.prototype.hasOwnProperty.call(sample[0], 'company_id');
        }
      } catch (e) {
        // Si falla la comprobación, no hacer nada especial; se tomará la ruta sin company_id
        console.warn('Comprobación de company_id en ticket_tags fallida, continuando sin filtro:', e);
      }

      // Primero obtenemos tags generales (sin filtro). Si existe company_id y tenemos company válido, pedimos filtrados.
      const baseFields = 'id, name, color, description';
      let baseResponse: any = await client.from('ticket_tags').select(baseFields).order('name', { ascending: true });

      if (baseResponse.error) {
        console.error('Error cargando tags base desde BD:', baseResponse.error);
        this.availableTags = [
          { id: '1', name: 'Urgente', color: '#ef4444', description: 'Tickets que requieren atención inmediata' },
          { id: '2', name: 'Hardware', color: '#3b82f6', description: 'Problemas relacionados con componentes físicos' },
          { id: '3', name: 'Software', color: '#10b981', description: 'Problemas de sistema operativo o aplicaciones' }
        ];
        return;
      }

      let tags = (baseResponse && baseResponse.data) ? baseResponse.data : [];

      // Si la tabla tiene company_id y el companyId es válido, solicitar tags filtrados por company_id
      if (hasCompany && this.isValidUuid(this.selectedCompanyId)) {
        const { data: companyTags, error: companyTagsErr } = await client
          .from('ticket_tags')
          .select('id, name, color, description, company_id')
          .eq('company_id', this.selectedCompanyId)
          .order('name', { ascending: true });

        if (!companyTagsErr && companyTags) {
          tags = companyTags;
        }
      }

      // Assign final tags to availableTags
      this.availableTags = tags || [];

    } catch (error) {
      console.error('Error in loadTags:', error);
      this.availableTags = [];
    }
  }

  // Attach tags to tickets by reading ticket_tag_relations -> ticket_tags
  async loadTicketTagsForTickets() {
    try {
      if (!this.tickets || this.tickets.length === 0) return;

      const ticketIds = this.tickets.map(t => t.id).filter(Boolean);
      if (ticketIds.length === 0) return;

      const client = this.simpleSupabase.getClient();

      const relResp: any = await client
        .from('ticket_tag_relations')
        .select('ticket_id, tag:ticket_tags(id, name)')
        .in('ticket_id', ticketIds);

      if (relResp.error) {
        console.warn('No se pudieron cargar ticket_tag_relations:', relResp.error.message);
        return;
      }

      // Mapear tags por ticket
      const tagsByTicket: Record<string, string[]> = {};
      (relResp.data || []).forEach((r: any) => {
        const tid = r.ticket_id;
        const tagName = r.tag?.name;
        if (!tid || !tagName) return;
        if (!tagsByTicket[tid]) tagsByTicket[tid] = [];
        if (!tagsByTicket[tid].includes(tagName)) tagsByTicket[tid].push(tagName);
      });

      // Asignar a los tickets cargados
      this.tickets = this.tickets.map(t => ({
        ...t,
        tags: tagsByTicket[t.id] || []
      }));

      // Actualizar la vista filtrada
      this.updateFilteredTickets();
    } catch (error) {
      console.error('Error en loadTicketTagsForTickets:', error);
    }
  }

  // Load tags for a single ticket and return array of tag names
  async loadTagsForTicket(ticketId: string): Promise<string[]> {
    try {
      const client = this.simpleSupabase.getClient();
      const relResp: any = await client
        .from('ticket_tag_relations')
        .select('ticket_id, tag:ticket_tags(id, name)')
        .eq('ticket_id', ticketId);

      if (relResp.error) {
        console.warn('Error cargando tags para ticket', ticketId, relResp.error.message);
        return [];
      }

      const names = (relResp.data || []).map((r: any) => r.tag?.name).filter(Boolean);
      return Array.from(new Set(names));
    } catch (error) {
      console.error('Error en loadTagsForTicket:', error);
      return [];
    }
  }

  updateFilteredTickets() {
    // With server-side pagination, 'tickets' contains only the current page data.
    // Client-side filtering is now limited to what's loaded.
    // Major filters (Stage, Search, Priority) are handled server-side in loadTickets().

    let filtered = [...this.tickets];

    // Filter by tags (Client-side usage only on current page)
    if (this.filterTags.length > 0) {
      filtered = filtered.filter(ticket => {
        if (!ticket.tags || ticket.tags.length === 0) return false;
        return this.filterTags.some(filterTag =>
          ticket.tags?.includes(filterTag)
        );
      });
    }

    // Status visual filtering
    // Note: server loadTickets does not filter by status/workflow category actively for 'open'/'completed' status toggles
    // unless mapped to stages.
    if (!this.showCompleted) {
      filtered = filtered.filter(t => (
        t.stage?.workflow_category !== 'final' &&
        t.stage?.stage_category !== 'completed'
      ));
    }

    // Additional cleanup for deleted if server didn't catch it (e.g. recent delete)
    if (!this.showDeleted) {
      filtered = filtered.filter(t => !t.deleted_at && t.stage?.workflow_category !== 'cancel');
    }

    this.filteredTickets = filtered;
  }

  getVisibleBoardStages(): ConfigStage[] {
    return this.stages.filter(stage => {
      // If showDeleted is false, hide stages with 'cancel' workflow category
      if (!this.showDeleted && stage.workflow_category === 'cancel') {
        return false;
      }
      // If showCompleted is false, hide stages with 'final' or 'completed' categories
      if (!this.showCompleted && (stage.workflow_category === 'final' || stage.stage_category === 'completed')) {
        return false;
      }
      return true;
    });
  }

  onSearch() {
    this.loadTickets(1);
  }

  onFilterChange() {
    this.loadTickets(1);
  }

  // Custom dropdown methods
  toggleStageDropdown() {
    this.stageDropdownOpen = !this.stageDropdownOpen;
    this.priorityDropdownOpen = false;
  }

  togglePriorityDropdown() {
    this.priorityDropdownOpen = !this.priorityDropdownOpen;
    this.stageDropdownOpen = false;
  }

  selectStageFilter(value: string) {
    this.filterStage = value;
    this.stageDropdownOpen = false;
    this.loadTickets(1);
  }

  selectPriorityFilter(value: string) {
    this.filterPriority = value;
    this.priorityDropdownOpen = false;
    this.loadTickets(1);
  }

  getSelectedStageLabel(): string {
    if (!this.filterStage) return 'Todos los estados';
    const stage = this.stages.find(s => s.id === this.filterStage);
    return stage?.name || 'Todos los estados';
  }

  getSelectedPriorityLabel(): string {
    return this.priorityOptions.find(o => o.value === this.filterPriority)?.label || 'Todas las prioridades';
  }

  closeAllDropdowns() {
    this.stageDropdownOpen = false;
    this.priorityDropdownOpen = false;
  }

  clearFilters() {
    this.searchTerm = '';
    this.filterStage = '';
    this.filterPriority = '';
    this.filterStatus = '';
    this.filterTags = [];
    this.closeAllDropdowns();
    this.updateFilteredTickets();
  }

  // Tag management methods
  toggleTagFilter(tagName: string) {
    const index = this.filterTags.indexOf(tagName);
    if (index === -1) {
      this.filterTags.push(tagName);
    } else {
      this.filterTags.splice(index, 1);
    }
    this.updateFilteredTickets();
  }

  isTagSelected(tagName: string): boolean {
    return this.filterTags.includes(tagName);
  }

  addTagToTicket(tagName: string) {
    if (!this.selectedTags.includes(tagName)) {
      this.selectedTags.push(tagName);
    }
  }

  removeTagFromTicket(tagName: string) {
    const index = this.selectedTags.indexOf(tagName);
    if (index !== -1) {
      this.selectedTags.splice(index, 1);
    }
  }

  getTagColor(tagName: string): string {
    const tag = this.availableTags.find(t => t.name === tagName);
    return tag?.color || '#6b7280';
  }

  onWizardTicketCreated() {
    this.showWizard = false;
    this.loadTickets();
  }

  // Form methods
  async openForm(ticket?: Ticket) {
    // If client is creating a new ticket, use the wizard
    if (this.isClient() && !ticket) {
      this.showWizard = true;
      return;
    }

    this.editingTicket = ticket || null;
    this.formData = ticket ? { ...ticket } : {
      title: '',
      description: '',
      client_id: '',
      stage_id: this.stages[0]?.id || '',
      priority: 'normal',
      estimated_hours: 1,
      company_id: this.selectedCompanyId,
      tags: []
    };
    this.selectedTags = [];
    this.formErrors = {};
    this.selectedServices = [];
    this.selectedProducts = [];
    this.serviceSearchText = '';
    this.productSearchText = '';
    this.filteredServices = [...this.topUsedServices];
    this.filteredProducts = [...this.topUsedProducts];
    this.customerSearchText = '';
    this.selectedCustomer = null;
    this.showCustomerDropdown = false;
    this.filteredCustomers = [...this.customers];
    this.selectedDevices = [];

    // If editing a ticket, load its services, tags and customer data
    if (ticket) {
      await this.loadTicketServicesForEdit(ticket.id);
      // Load tags from relations
      try {
        const tagNames = await this.loadTagsForTicket(ticket.id);
        this.selectedTags = tagNames || [];
      } catch (err) {
        console.warn('No se pudieron cargar tags para edición, usando []');
        this.selectedTags = [];
      }
      // Set customer data if available
      if (ticket.client) {
        this.selectedCustomer = ticket.client;
        this.customerSearchText = ticket.client.name;
        this.formData.client_id = ticket.client.id;
      }
    }

    this.showForm = true;

    // Añadir entrada al historial para que el botón "atrás" cierre el modal
    history.pushState({ modal: 'ticket-form' }, '');

    // Configurar listener de popstate si no existe
    if (!this.popStateListener) {
      this.popStateListener = (event: PopStateEvent) => {
        if (this.showProductForm) {
          this.closeProductForm();
        } else if (this.showServiceForm) {
          this.closeServiceForm();
        } else if (this.showForm) {
          this.closeForm();
        } else if (this.showWizard) {
          this.showWizard = false;
        }
      };
      window.addEventListener('popstate', this.popStateListener);
    }

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
    this.selectedProducts = [];
    this.showServiceForm = false;
    this.showProductForm = false;

    // Restaurar scroll de la página principal
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';

    // Retroceder en el historial solo si hay entrada de modal
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    }
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

  // Products management methods
  async loadProducts() {
    try {
      this.productsService.getProducts().subscribe({
        next: async (products) => {
          this.availableProducts = products || [];
          // Fetch top used products from server-side RPC (default 3)
          this.topUsedProducts = await this.getTopUsedProducts();
          // By default, show only the top 3 products; full list appears on search
          this.filteredProducts = [...this.topUsedProducts];
        },
        error: (error) => {
          console.error('Error loading products:', error);
          this.availableProducts = [];
          this.filteredProducts = [];
        }
      });
    } catch (e) {
      console.error('loadProducts error:', e);
      this.availableProducts = [];
      this.filteredProducts = [];
    }
  }

  private async getTopUsedProducts(): Promise<any[]> {
    try {
      if (this.selectedCompanyId) {
        const { data, error } = await this.simpleSupabase
          .getClient()
          .rpc('get_top_used_products', { target_company_id: this.selectedCompanyId, limit_count: 3 });
        if (!error && Array.isArray(data)) return data as any[];
        if (error) console.warn('get_top_used_products RPC failed, falling back to slice(0,3):', error);
      }
      return this.availableProducts.slice(0, 3);
    } catch (err) {
      console.error('Error getting top used products:', err);
      return this.availableProducts.slice(0, 3);
    }
  }

  filterProducts() {
    if (!this.productSearchText.trim()) {
      // No search: show only the top used products to match Services UX
      this.filteredProducts = [...this.topUsedProducts];
      return;
    }

    const searchText = this.productSearchText.toLowerCase().trim();
    this.filteredProducts = this.availableProducts.filter(product =>
      product.name.toLowerCase().includes(searchText) ||
      product.description?.toLowerCase().includes(searchText) ||
      product.category?.toLowerCase().includes(searchText)
    );
  }

  addProductToTicket(product: any) {
    const existing = this.selectedProducts.find(p => p.product.id === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.selectedProducts.push({ product, quantity: 1 });
    }
    // Clear search after adding and return to top used products
    this.productSearchText = '';
    this.filteredProducts = [...this.topUsedProducts];
  }

  removeProductFromTicket(productId: string) {
    this.selectedProducts = this.selectedProducts.filter(p => p.product.id !== productId);
  }

  updateProductQuantity(productId: string, quantity: number) {
    const productItem = this.selectedProducts.find(p => p.product.id === productId);
    if (productItem) {
      productItem.quantity = Math.max(1, quantity);
    }
  }

  isProductSelected(productId: string): boolean {
    return this.selectedProducts.some(p => p.product.id === productId);
  }

  // Product creation from Ticket form
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

  async createProductFromTicket() {
    try {
      if (!this.productFormData.name?.trim()) {
        alert('El nombre del producto es requerido');
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
        stock_quantity: Number(this.productFormData.stock_quantity || 0)
      };
      const newProduct = await firstValueFrom(this.productsService.createProduct(payload));
      this.availableProducts.push(newProduct);
      this.addProductToTicket(newProduct);
      this.closeProductForm();
    } catch (error) {
      console.error('Error creando producto:', error);
      alert('Error al crear el producto');
    }
  }

  // Brand autocomplete methods
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

  selectBrand(brand: any) {
    this.productFormData.brand = brand.name;
    this.productFormData.brand_id = brand.id;
    this.brandSearchText = brand.name;
    this.showBrandInput = false;
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

  selectExistingBrandMatch() {
    const match = this.getExactBrandMatch();
    if (match) {
      this.selectBrand(match);
    }
  }

  async createNewBrand() {
    try {
      if (!this.brandSearchText.trim()) return;

      const newBrand = await this.productMetadataService.createBrand(
        this.brandSearchText.trim(),
        this.selectedCompanyId
      );

      this.availableBrands.push(newBrand);
      this.selectBrand(newBrand);
    } catch (error) {
      console.error('Error creando marca:', error);
      alert('Error al crear la marca. Puede que ya exista.');
    }
  }

  // Category autocomplete methods
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

  selectCategory(category: any) {
    this.productFormData.category = category.name;
    this.productFormData.category_id = category.id;
    this.categorySearchText = category.name;
    this.showCategoryInput = false;
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

  selectExistingCategoryMatch() {
    const match = this.getExactCategoryMatch();
    if (match) {
      this.selectCategory(match);
    }
  }

  async createNewCategory() {
    try {
      if (!this.categorySearchText.trim()) return;

      const newCategory = await this.productMetadataService.createCategory(
        this.categorySearchText.trim(),
        this.selectedCompanyId
      );

      this.availableCategories.push(newCategory);
      this.selectCategory(newCategory);
    } catch (error) {
      console.error('Error creando categoría:', error);
      alert('Error al crear la categoría. Puede que ya exista.');
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
      service.category?.toLowerCase().includes(searchText) ||
      (Array.isArray(service.tags) && service.tags.some((t: string) => t.toLowerCase().includes(searchText)))
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

    // If customer has a company_id, set company context so RLS-scoped queries use the right company
    const customerCompanyId = customer.company_id;
    if (customerCompanyId && this.isValidUuid(customerCompanyId)) {
      // Fire and forget, then load devices
      this.simpleSupabase.setCurrentCompany(customerCompanyId).finally(() => {
        this.selectedCompanyId = customerCompanyId!;
        this.loadCustomerDevices();
      });
    } else {
      // Load customer devices with current selected company as fallback
      this.loadCustomerDevices();
    }
  }

  clearCustomerSelection() {
    this.selectedCustomer = null;
    this.formData.client_id = '';
    this.customerSearchText = '';
    // Clear devices when customer is cleared
    this.customerDevices = [];
    this.filteredCustomerDevices = [];
    this.selectedDevices = [];
  }

  onCustomerSearchFocus() {
    if (!this.selectedCustomer) {
      this.showCustomerDropdown = true;
      this.filteredCustomers = [...this.customers];
    }
  }

  // Device management methods
  addDeviceToTicket(device: Device) {
    const exists = this.selectedDevices.some(d => d.id === device.id);
    if (!exists) {
      this.selectedDevices.push(device);
    }
  }

  removeDeviceFromTicket(deviceId: string) {
    this.selectedDevices = this.selectedDevices.filter(d => d.id !== deviceId);
  }

  // Open modal to create a new device (prefill company/client context)
  openCreateDeviceForm() {
    this.deviceFormData = {
      company_id: this.selectedCustomer?.company_id || this.selectedCompanyId,
      client_id: this.selectedCustomer?.id || '',
      status: 'received',
      priority: 'normal'
    };
    this.selectedDeviceImages = [];
    this.showCreateDeviceForm = true;
  }

  openDeviceForm() {
    this.deviceFormData = {
      // Prefer the customer's company_id when available (company authoritative)
      company_id: this.selectedCustomer?.company_id || this.selectedCompanyId,
      client_id: this.selectedCustomer?.id || '',
      status: 'received',
      priority: 'normal',
      warranty_status: 'unknown'
    };
    this.showDeviceForm = true;
  }

  closeDeviceForm() {
    this.showDeviceForm = false;
    this.deviceFormData = {};
  }

  async saveNewDevice() {
    try {
      if (!this.deviceFormData.client_id || !this.deviceFormData.brand ||
        !this.deviceFormData.model || !this.deviceFormData.reported_issue) {
        alert('Por favor, completa todos los campos requeridos');
        return;
      }

      const newDevice = await this.devicesService.createDevice(this.deviceFormData);
      this.addDeviceToTicket(newDevice);
      this.closeDeviceForm();
      await this.loadDevices(); // Actualizar lista de dispositivos
    } catch (error) {
      console.error('Error creating device:', error);
      alert('Error al crear el dispositivo');
    }
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

  getSelectedProductsTotal(): number {
    return this.selectedProducts.reduce((total, item) => {
      return total + (item.product.price * item.quantity);
    }, 0);
  }

  getGrandTotal(): number {
    return this.getSelectedServicesTotal() + this.getSelectedProductsTotal();
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

    // Validar que hay al menos un servicio, producto o dispositivo seleccionado
    if (this.selectedServices.length === 0 && this.selectedProducts.length === 0 && this.selectedDevices.length === 0) {
      const msg = 'Debe seleccionar al menos un servicio, producto o dispositivo';
      this.formErrors['items'] = msg;     // Para la sección de productos
      this.formErrors['services'] = msg;  // Para la sección de servicios
      this.formErrors['devices'] = msg;   // Para la sección de dispositivos
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
      // Compute total amount from selected services and products (unit price * quantity)
      const servicesTotal = (this.selectedServices || []).reduce((sum, s) => {
        const unit = typeof s.service.base_price === 'number' ? s.service.base_price : 0;
        const qty = Math.max(1, Number(s.quantity || 1));
        return sum + (unit * qty);
      }, 0);

      const productsTotal = (this.selectedProducts || []).reduce((sum, p) => {
        const unit = typeof p.product.price === 'number' ? p.product.price : 0;
        const qty = Math.max(1, Number(p.quantity || 1));
        return sum + (unit * qty);
      }, 0);

      const dataWithCompany = {
        ...this.formData,
        company_id: this.selectedCompanyId,
        estimated_hours: totalHours > 0 ? totalHours : this.formData.estimated_hours,
        total_amount: Number((servicesTotal + productsTotal).toFixed(2))
      };

      let savedTicket;
      if (this.editingTicket) {
        savedTicket = await this.ticketsService.updateTicket(this.editingTicket.id, dataWithCompany);
      } else {
        // Build service and product items payload
        const serviceItems = (this.selectedServices || []).map(s => ({
          service_id: s.service.id,
          quantity: s.quantity || 1,
          unit_price: typeof s.service.base_price === 'number' ? s.service.base_price : 0
        }));

        const productItems = (this.selectedProducts || []).map(p => ({
          product_id: p.product.id,
          quantity: p.quantity || 1,
          unit_price: typeof p.product.price === 'number' ? p.product.price : 0
        }));

        savedTicket = await this.ticketsService.createTicketWithItems(dataWithCompany, serviceItems, productItems);
      }

      // If updateTicket/createTicket returned an object but didn't include total_amount,
      // ensure local reference has the amount we computed so subsequent operations use it.
      if (savedTicket && typeof savedTicket === 'object') {
        try {
          (savedTicket as any).total_amount = (savedTicket as any).total_amount ?? dataWithCompany.total_amount;
        } catch { }
      }

      // Persist selected services and products into ticket_services/ticket_products only when updating an existing ticket
      if (this.editingTicket) {
        try {
          const serviceItems = (this.selectedServices || []).map(s => ({
            service_id: s.service.id,
            quantity: s.quantity || 1,
            unit_price: typeof s.service.base_price === 'number' ? s.service.base_price : 0
          }));
          await this.ticketsService.replaceTicketServices(savedTicket.id, this.selectedCompanyId, serviceItems);
        } catch (svcErr) {
          console.warn('No se pudieron guardar los servicios del ticket:', svcErr);
        }

        try {
          const productItems = (this.selectedProducts || []).map(p => ({
            product_id: p.product.id,
            quantity: p.quantity || 1,
            unit_price: typeof p.product.price === 'number' ? p.product.price : 0
          }));
          await this.ticketsService.replaceTicketProducts(savedTicket.id, this.selectedCompanyId, productItems);
        } catch (prodErr) {
          console.warn('No se pudieron guardar los productos del ticket:', prodErr);
        }
      }

      // Sincronizar tags seleccionadas con la relación ticket_tag_relations
      try {
        await this.syncTicketTags(savedTicket.id, this.selectedTags || []);
      } catch (err) {
        console.warn('Error sincronizando tags del ticket:', err);
      }

      // Vincular dispositivos al ticket si hay dispositivos seleccionados (no bloquear guardado)
      if (this.selectedDevices.length > 0 && savedTicket) {
        const results = await Promise.allSettled(
          this.selectedDevices.map((device) => this.devicesService.linkDeviceToTicket(savedTicket.id, device.id, 'repair'))
        );
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
          console.warn(`Algunos dispositivos no se pudieron vincular (${failed.length}/${results.length}). Revisa RLS y permisos.`);
        }
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

  // Ensure tag rows exist and synchronize ticket_tag_relations for a ticket
  async syncTicketTags(ticketId: string, tagNames: string[]) {
    if (!ticketId) return;
    const client = this.simpleSupabase.getClient();

    // Normalize and dedupe
    const uniqueNames = Array.from(new Set((tagNames || []).map(n => (n || '').trim()).filter(Boolean)));
    try {
      // Detect if ticket_tags has company_id using a safe sample query (some deployments do not expose information_schema via REST)
      let hasCompany = false;
      try {
        // Use a full-row sample select to avoid PostgREST rejecting a narrow projection in some setups
        const { data: sample, error: sampleErr } = await client
          .from('ticket_tags')
          .select('*')
          .limit(1);

        if (!sampleErr && sample && sample.length > 0) {
          hasCompany = Object.prototype.hasOwnProperty.call(sample[0], 'company_id');
        }
      } catch (e) {
        console.warn('No se pudo determinar company_id en ticket_tags (sample check failed), assuming no company column', e);
      }

      // 1) Ensure tags exist
      for (const name of uniqueNames) {
        // Check if exists
        let q = client.from('ticket_tags').select('id, name');
        q = q.eq('name', name);
        if (hasCompany && this.isValidUuid(this.selectedCompanyId)) q = q.eq('company_id', this.selectedCompanyId);
        const { data: exists, error: existsErr } = await q.limit(1);
        if (existsErr) continue;
        if (!exists || exists.length === 0) {
          const insertObj: any = { name, color: '#6b7280' };
          if (hasCompany) insertObj.company_id = this.selectedCompanyId;
          const { error: insErr } = await client.from('ticket_tags').insert(insertObj).select().limit(1);
          if (insErr) {
            // ignore insert errors (race conditions)
            console.warn('No se pudo insertar tag', name, insErr.message || insErr);
          }
        }
      }

      // 2) Fetch tag ids for the names (scoped to company if applicable)
      let tagsQuery = client.from('ticket_tags').select('id, name');
      tagsQuery = tagsQuery.in('name', uniqueNames);
      if (hasCompany && this.isValidUuid(this.selectedCompanyId)) tagsQuery = tagsQuery.eq('company_id', this.selectedCompanyId);
      const { data: tagsRows, error: fetchErr } = await tagsQuery;
      if (fetchErr) throw fetchErr;

      const nameToId: Record<string, string> = {};
      (tagsRows || []).forEach((r: any) => { nameToId[r.name] = r.id; });

      // 3) Insert relations for desired tags (ignore duplicates)
      for (const name of uniqueNames) {
        const tagId = nameToId[name];
        if (!tagId) continue;
        const { error: relErr } = await client.from('ticket_tag_relations').insert({ ticket_id: ticketId, tag_id: tagId });
        if (relErr) {
          // ignore duplicate/key errors
        }
      }

      // 4) Remove relations for tags not in the desired list for this ticket
      const { data: existingRel, error: existingErr } = await client.from('ticket_tag_relations').select('tag_id').eq('ticket_id', ticketId);
      if (!existingErr) {
        const existingIds = (existingRel || []).map((r: any) => r.tag_id);
        const desiredIds = uniqueNames.map(n => nameToId[n]).filter(Boolean);
        const toRemove = existingIds.filter((id: string) => !desiredIds.includes(id));
        if (toRemove.length > 0) {
          const { error: delErr } = await client.from('ticket_tag_relations').delete().eq('ticket_id', ticketId).in('tag_id', toRemove);
          if (delErr) {
            console.warn('No se pudieron eliminar relaciones antiguas', delErr.message || delErr);
          }
        }
      }
    } catch (error) {
      console.error('Error sincronizando ticket tags:', error);
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

  // Client portal: open delete reason modal instead of direct delete
  openDeleteReasonModal(ticket: Ticket) {
    this.ticketToDelete = ticket;
    this.deleteReasonText = '';
    this.showDeleteReasonModal = true;
  }

  closeDeleteReasonModal() {
    this.showDeleteReasonModal = false;
    this.ticketToDelete = null;
    this.deleteReasonText = '';
  }

  async confirmDeleteWithReason() {
    if (!this.ticketToDelete) return;
    if (!this.deleteReasonText.trim()) {
      this.error = 'Por favor, indica la razón para eliminar el ticket.';
      return;
    }

    this.loading = true;
    try {
      // Get current user ID for the comment
      const { data: sessionData } = await this.simpleSupabase.getClient().auth.getSession();
      const userId = sessionData?.session?.user?.id;

      // Add a comment with the deletion reason before deleting
      await this.simpleSupabase.getClient()
        .from('ticket_comments')
        .insert({
          ticket_id: this.ticketToDelete.id,
          user_id: userId,
          comment: `🗑️ Solicitud de eliminación por cliente: ${this.deleteReasonText}`,
          is_internal: false
        });

      await this.ticketsService.deleteTicket(this.ticketToDelete.id);
      this.closeDeleteReasonModal();
      await this.loadTickets();
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error deleting ticket with reason:', error);
    } finally {
      this.loading = false;
    }
  }

  // Navigation
  viewTicketDetail(ticket: Ticket) {
    // Navigate to the new ticket detail route; ensure id exists
    if (!ticket?.id) {
      console.warn('viewTicketDetail: ticket without id');
      return;
    }
    // Optimistic UI: mark as opened in local list
    (ticket as any).is_opened = true;
    // Fire-and-forget persistence; detail page will also ensure marking
    try { this.ticketsService.markTicketOpened(ticket.id); } catch { }
    this.router.navigate(['ticket', ticket.id]);
  }

  // Utility methods
  getPriorityColor(priority: string): string {
    return this.ticketsService.getPriorityColor(priority);
  }

  getPriorityLabel(priority: string): string {
    const key = (priority || 'normal').toLowerCase();
    return this.ticketPriorityConfig[key]?.label || this.ticketPriorityConfig['normal'].label;
  }

  getPriorityClasses(priority: string): string {
    const key = (priority || 'normal').toLowerCase();
    return this.ticketPriorityConfig[key]?.classes || this.ticketPriorityConfig['normal'].classes;
  }

  getPriorityIcon(priority: string): string {
    const key = (priority || 'normal').toLowerCase();
    return this.ticketPriorityConfig[key]?.icon || this.ticketPriorityConfig['normal'].icon;
  }

  formatDate(dateString: string): string {
    return this.ticketsService.formatDate(dateString);
  }

  getStatusBadgeClass(stage: ConfigStage): string {
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

  // Device management methods
  async loadCustomerDevices() {
    if (!this.selectedCustomer) {
      this.customerDevices = [];
      this.filteredCustomerDevices = [];
      return;
    }

    try {
      // Determine authoritative company id from the selected customer (fallback to selectedCompanyId)
      const companyId = this.selectedCustomer?.company_id || this.selectedCompanyId;
      console.log('[Tickets] Loading customer devices. customer=', this.selectedCustomer?.id, 'companyId=', companyId);
      const allDevices = await this.devicesService.getDevices(companyId);
      console.log('[Tickets] Devices fetched for company:', companyId, 'count=', allDevices?.length || 0);

      // Filter to show ONLY devices belonging to the selected customer (client_id match)
      const clientId = this.selectedCustomer!.id;
      this.customerDevices = (allDevices || []).filter(device => device.client_id === clientId);

      this.filteredCustomerDevices = [...this.customerDevices];
    } catch (error) {
      console.error('[Tickets] Error loading customer devices:', error);
      this.customerDevices = [];
      this.filteredCustomerDevices = [];
    }
  }

  filterCustomerDevices() {
    if (!this.deviceSearchText.trim()) {
      this.filteredCustomerDevices = [...this.customerDevices];
      return;
    }

    const searchTerm = this.deviceSearchText.toLowerCase();
    this.filteredCustomerDevices = this.customerDevices.filter(device =>
      device.brand.toLowerCase().includes(searchTerm) ||
      device.model.toLowerCase().includes(searchTerm) ||
      (device.imei && device.imei.toLowerCase().includes(searchTerm)) ||
      (device.color && device.color.toLowerCase().includes(searchTerm))
    );
  }

  isDeviceSelected(deviceId: string): boolean {
    return this.selectedDevices.some(device => device.id === deviceId);
  }

  toggleDeviceSelection(device: Device) {
    const index = this.selectedDevices.findIndex(d => d.id === device.id);
    if (index >= 0) {
      this.selectedDevices.splice(index, 1);
    } else {
      this.selectedDevices.push(device);
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

  async createAndSelectDevice() {
    if (!this.deviceFormData.brand || !this.deviceFormData.model ||
      !this.deviceFormData.device_type || !this.deviceFormData.reported_issue ||
      !this.selectedCustomer) {
      return;
    }

    try {
      const deviceData = {
        ...this.deviceFormData,
        client_id: this.selectedCustomer.id,
        // Ensure the device is created under the customer's company (company authoritative)
        company_id: this.selectedCustomer?.company_id || this.selectedCompanyId,
        status: 'received',
        priority: 'normal',
        received_at: new Date().toISOString()
      };

      const newDevice = await this.devicesService.createDevice(deviceData as Omit<Device, 'id' | 'created_at' | 'updated_at'>);

      // Upload images if any
      if (this.selectedDeviceImages.length > 0) {
        for (const imageData of this.selectedDeviceImages) {
          try {
            await this.devicesService.uploadDeviceImage(
              newDevice.id,
              imageData.file,
              'arrival',
              'Estado del dispositivo al llegar',
              undefined, // No ticket link yet
              undefined, // No ticket ID yet (files will go to root/device folder, which is acceptable for unlinked devices)
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
      this.cancelCreateDevice();

    } catch (error) {
      console.error('Error creating device:', error);
    }
  }

  cancelCreateDevice() {
    this.showCreateDeviceForm = false;
    this.deviceFormData = {
      brand: '',
      model: '',
      device_type: '',
      reported_issue: '',
      imei: '',
      color: '',
      condition_on_arrival: ''
    };
    this.selectedDeviceImages = [];
  }

  // Customer management methods
  onCustomerSearchBlur() {
    // Delay hiding dropdown to allow click events to register
    setTimeout(() => {
      this.showCustomerDropdown = false;
    }, 200);
  }

  async createNewCustomer() {
    if (!this.customerSearchText.trim()) return;

    // Pre-fill the form with the searched text
    this.customerFormData.name = this.customerSearchText.trim();
    this.showCustomerForm = true;
    this.showCustomerDropdown = false;
  }

  openCustomerForm() {
    // Reset form data
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
    this.showCustomerDropdown = false;
  }

  async saveCustomer() {
    if (!this.customerFormData.name.trim()) {
      return;
    }

    try {
      // Persist client using service (RLS-aware)
      const { success, data, error } = await this.simpleSupabase.createClientFull({
        name: this.customerFormData.name.trim(),
        email: this.customerFormData.email?.trim() || undefined,
        phone: this.customerFormData.phone?.trim() || undefined,
        company_id: this.selectedCompanyId,
        address: this.customerFormData.address ? { raw: this.customerFormData.address, city: this.customerFormData.city, postal_code: this.customerFormData.postal_code } : undefined
      });

      if (!success || !data) {
        console.error('Error creando cliente:', error);
        alert('No se pudo crear el cliente.');
        return;
      }

      // Update in-memory lists and selection
      this.customers.push(data);
      this.selectCustomer(data);
      this.filteredCustomers = [...this.customers];
      this.closeCustomerForm();

    } catch (error) {
      console.error('Error creating customer:', error);
      alert('Error inesperado al crear el cliente');
    }
  }

  closeCustomerForm() {
    this.showCustomerForm = false;
    this.customerFormData = {
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      postal_code: '',
      notes: ''
    };
  }

  // Device image management methods
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
}
