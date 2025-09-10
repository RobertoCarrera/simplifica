import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { AnimationService } from '../../services/animation.service';
import { DataTableComponent } from '../data-table/data-table.component';
import { CalendarComponent } from '../calendar/calendar.component';
import { ToastService } from '../../services/toast.service';
import { 
  TableColumn, 
  TableAction 
} from '../data-table/data-table.interface';
import { 
  CalendarEvent, 
  CalendarEventClick, 
  CalendarDateClick 
} from '../calendar/calendar.interface';

@Component({
  selector: 'app-ultra-simple',
  standalone: true,
  imports: [CommonModule, DataTableComponent, CalendarComponent],
  animations: [
    AnimationService.fadeInUp,
    AnimationService.staggerList,
    AnimationService.cardHover
  ],
  template: `
    <div class="p-6" @fadeInUp>
      <!-- Header Section -->
      <div class="mb-6" @fadeInUp>
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              Clientes{{ tenantName ? ' de ' + tenantName : '' }}
            </h1>
            <p class="text-gray-600 dark:text-gray-300 mt-1">Gestión de clientes del sistema</p>
          </div>
          <div class="flex space-x-2">
            <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              {{ clients.length }} cliente{{ clients.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Tenant Filter -->
      <div class="mb-6 bg-white rounded-lg shadow-sm p-4">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Filtrar por empresa:</h3>
        <div class="flex flex-wrap gap-2">
          <a href="/clientes?tenant=satpcgo" 
             [class]="tenant === 'satpcgo' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'"
             class="px-4 py-2 rounded-lg transition-colors duration-200">
            🏢 SatPCGo
          </a>
          <a href="/clientes?tenant=michinanny" 
             [class]="tenant === 'michinanny' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'"
             class="px-4 py-2 rounded-lg transition-colors duration-200">
            🏢 Michinanny
          </a>
          <a href="/clientes" 
             [class]="!tenant ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
             class="px-4 py-2 rounded-lg transition-colors duration-200">
            📋 Todos
          </a>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span class="ml-3 text-gray-600">Cargando clientes...</span>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <span class="text-red-600 text-xl">❌</span>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Error al cargar clientes</h3>
            <p class="mt-1 text-sm text-red-700">{{ error }}</p>
          </div>
        </div>
      </div>

      <!-- Clients Grid -->
      <div *ngIf="!loading && !error" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div *ngFor="let client of clients" 
             class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ client.name }}</h3>
              <div class="space-y-1">
                <p *ngIf="client.email" class="text-sm text-gray-600 flex items-center">
                  <span class="mr-2">📧</span>
                  <a href="mailto:{{ client.email }}" class="text-blue-600 hover:text-blue-800">
                    {{ client.email }}
                  </a>
                </p>
                <p *ngIf="client.phone" class="text-sm text-gray-600 flex items-center">
                  <span class="mr-2">📞</span>
                  <a href="tel:{{ client.phone }}" class="text-blue-600 hover:text-blue-800">
                    {{ client.phone }}
                  </a>
                </p>
              </div>
            </div>
            <span class="text-xs text-gray-400">
              ID: {{ client.id.substring(0, 8) }}...
            </span>
          </div>
          
          <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">
                Cliente desde {{ formatDate(client.created_at) }}
              </span>
              <button class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                Ver tickets →
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="clients.length === 0" 
             class="col-span-full bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div class="text-gray-400 text-6xl mb-4">👥</div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No hay clientes</h3>
          <p class="text-gray-500">
            {{ tenantName ? 'No se encontraron clientes para ' + tenantName : 'No hay clientes registrados en el sistema' }}
          </p>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Acciones rápidas</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <a href="/tickets" 
             class="flex items-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors duration-200">
            <span class="text-2xl mr-3">🎫</span>
            <div>
              <p class="font-medium text-gray-900">Ver Tickets</p>
              <p class="text-sm text-gray-600">Gestionar solicitudes</p>
            </div>
          </a>
          
          <a href="/productos" 
             class="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors duration-200">
            <span class="text-2xl mr-3">📦</span>
            <div>
              <p class="font-medium text-gray-900">Productos</p>
              <p class="text-sm text-gray-600">Catálogo disponible</p>
            </div>
          </a>
          
          <a href="/servicios" 
             class="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors duration-200">
            <span class="text-2xl mr-3">🔧</span>
            <div>
              <p class="font-medium text-gray-900">Servicios</p>
              <p class="text-sm text-gray-600">Catálogo de servicios técnicos</p>
            </div>
          </a>
          
          <a href="/setup-db" 
             class="flex items-center p-4 bg-red-50 rounded-lg hover:bg-red-100 transition-colors duration-200">
            <span class="text-2xl mr-3">⚙️</span>
            <div>
              <p class="font-medium text-gray-900">Configuración</p>
              <p class="text-sm text-gray-600">Base de datos</p>
            </div>
          </a>
        </div>
      </div>

      <!-- 🎨 PREMIUM COMPONENTS SECTION -->
      <div class="mt-8 space-y-8" @fadeInUp>
        <!-- Data Table Premium -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-lg font-medium text-gray-900">📊 Tabla Avanzada de Clientes</h3>
              <p class="text-sm text-gray-600 mt-1">Tabla con ordenamiento, filtros y acciones</p>
            </div>
            <span class="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
              ✨ Premium UX
            </span>
          </div>
          
          <app-data-table
            [data]="clientTableData"
            [columns]="clientTableColumns"
            [actions]="clientTableActions"
            [title]="'Clientes ' + (tenantName || 'Todos')"
            [subtitle]="'Gestión avanzada de clientes con funcionalidades premium'"
            [searchable]="true"
            [sortable]="true"
            [paginated]="true"
            [pageSize]="5"
            (sortChange)="onTableSort($event)"
            (filterChange)="onTableFilter($event)"
            (pageChange)="onTablePage($event)">
          </app-data-table>
        </div>

        <!-- Calendar Premium -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-lg font-medium text-gray-900">📅 Calendario de Citas</h3>
              <p class="text-sm text-gray-600 mt-1">Gestión de citas y eventos con clientes</p>
            </div>
            <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
              ✨ Premium UX
            </span>
          </div>
          
          <app-calendar
            [events]="calendarEvents"
            [editable]="true"
            [selectable]="true"
            (eventClick)="onEventClick($event)"
            (dateClick)="onDateClick($event)"
            (addEvent)="onAddEvent()"
            (viewChange)="onViewChange($event)">
          </app-calendar>
        </div>
      </div>
    </div>
  `
})
export class UltraSimpleComponent implements OnInit {
  loading = false;
  error: string | null = null;
  clients: any[] = [];
  tenant: string | null = null;
  tenantName: string | null = null;
  
  // Premium components data
  clientTableData: any[] = [];
  clientTableColumns: TableColumn[] = [];
  clientTableActions: TableAction[] = [];
  calendarEvents: CalendarEvent[] = [];
  
  private route = inject(ActivatedRoute);
  private supabase = inject(SimpleSupabaseService);
  private toastService = inject(ToastService);

  ngOnInit() {
    console.log('🚀 Componente iniciado');
    
    this.initializePremiumComponents();
    
    this.route.queryParams.subscribe(params => {
      this.tenant = params['tenant'] || null;
      this.setTenantName();
      console.log('🔍 Tenant:', this.tenant);
      this.loadClients();
    });
  }

  private setTenantName() {
    const tenantMap: { [key: string]: string } = {
      'satpcgo': 'SatPCGo',
      'michinanny': 'Michinanny'
    };
    this.tenantName = this.tenant ? tenantMap[this.tenant.toLowerCase()] : null;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES');
  }

  async loadClients() {
    console.log('📋 Cargando clientes...');
    this.loading = true;
    this.error = null;
    
    try {
      if (this.tenant) {
        // Cargar por tenant
        const tenantMap: any = {
          'satpcgo': 'SatPCGo',
          'michinanny': 'Michinanny'
        };
        
        const companyName = tenantMap[this.tenant.toLowerCase()];
        if (!companyName) {
          throw new Error(`Tenant "${this.tenant}" no válido`);
        }
        
        // Buscar empresa
        const { data: companies, error: companyError } = await this.supabase.getClient()
          .from('companies')
          .select('id, name')
          .eq('name', companyName)
          .is('deleted_at', null);
        
        if (companyError) throw new Error('Error empresa: ' + companyError.message);
        if (!companies || companies.length === 0) throw new Error(`Empresa "${companyName}" no encontrada`);
        
        console.log('🏢 Empresa:', companies[0]);
        
        // Buscar clientes (aplicar filtro solo si company id es UUID)
        const companyId = companies[0].id;
        let clientsQuery: any = this.supabase.getClient().from('clients').select('*').is('deleted_at', null);
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
          clientsQuery = clientsQuery.eq('company_id', companyId);
        } else {
          console.warn('ultra-simple: skipping non-UUID company_id filter for tenant company:', companyId);
        }
        const { data: clients, error: clientsError } = await clientsQuery;
        
        if (clientsError) throw new Error('Error clientes: ' + clientsError.message);
        
        this.clients = clients || [];
        console.log('✅ Clientes:', this.clients.length);
        
      } else {
        // Cargar todos
        const { data: clients, error } = await this.supabase.getClient()
          .from('clients')
          .select('*')
          .is('deleted_at', null);
        
        if (error) throw new Error('Error todos: ' + error.message);
        
        this.clients = clients || [];
        console.log('✅ Todos los clientes:', this.clients.length);
      }
      
      // Update premium components data
      this.updateTableData();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error:', error);
    } finally {
      this.loading = false;
    }
  }

  // 🎨 Premium Components Methods
  private initializePremiumComponents() {
    this.setupTableColumns();
    this.setupTableActions();
    this.generateCalendarEvents();
  }

  private setupTableColumns() {
    this.clientTableColumns = [
      {
        key: 'name',
        label: 'Nombre',
        sortable: true,
        type: 'text'
      },
      {
        key: 'email',
        label: 'Email',
        sortable: true,
        type: 'text'
      },
      {
        key: 'phone',
        label: 'Teléfono',
        sortable: true,
        type: 'text'
      },
      {
        key: 'created_at',
        label: 'Cliente desde',
        sortable: true,
        type: 'date',
        format: (value: string) => this.formatDate(value)
      }
    ];
  }

  private setupTableActions() {
    this.clientTableActions = [
      {
        label: 'Ver detalles',
        icon: 'view',
        color: 'primary',
        onClick: (client: any) => this.viewClient(client)
      },
      {
        label: 'Editar',
        icon: 'edit',
        color: 'secondary',
        onClick: (client: any) => this.editClient(client)
      },
      {
        label: 'Ver tickets',
        icon: 'ticket',
        color: 'success',
        onClick: (client: any) => this.viewClientTickets(client)
      }
    ];
  }

  private generateCalendarEvents() {
    // Generar eventos de ejemplo basados en clientes
    this.calendarEvents = [
      {
        id: '1',
        title: 'Reunión con cliente',
        description: 'Revisión de requerimientos',
        start: new Date(2025, 8, 8, 10, 0), // 8 Sept 2025, 10:00
        end: new Date(2025, 8, 8, 11, 0),
        allDay: false,
        color: '#6366f1',
        attendees: ['Cliente', 'Asesor técnico'],
        location: 'Oficina principal'
      },
      {
        id: '2',
        title: 'Seguimiento técnico',
        description: 'Revisión del estado del equipo',
        start: new Date(2025, 8, 10, 14, 0), // 10 Sept 2025, 14:00
        end: new Date(2025, 8, 10, 15, 30),
        allDay: false,
        color: '#10b981',
        attendees: ['Técnico', 'Cliente'],
        location: 'Taller'
      },
      {
        id: '3',
        title: 'Presentación de propuesta',
        description: 'Presentación de solución técnica',
        start: new Date(2025, 8, 12, 16, 0), // 12 Sept 2025, 16:00
        end: new Date(2025, 8, 12, 17, 0),
        allDay: false,
        color: '#f59e0b',
        attendees: ['Gerente', 'Cliente', 'Técnico'],
        location: 'Sala de reuniones'
      }
    ];
  }

  // Table event handlers
  onTableSort(event: any) {
    console.log('Table sort:', event);
    this.toastService.info('Ordenamiento', `Ordenando por ${event.column}`);
  }

  onTableFilter(event: any) {
    console.log('Table filter:', event);
    this.toastService.info('Filtro', `Filtrando: ${event.value}`);
  }

  onTablePage(event: any) {
    console.log('Table page:', event);
    this.toastService.info('Paginación', `Página ${event.page}`);
  }

  // Table actions
  viewClient(client: any) {
    this.toastService.info('Cliente', `Viendo detalles de ${client.name}`);
  }

  editClient(client: any) {
    this.toastService.info('Cliente', `Editando ${client.name}`);
  }

  viewClientTickets(client: any) {
    this.toastService.info('Tickets', `Tickets de ${client.name}`);
  }

  // Calendar event handlers
  onEventClick(event: CalendarEventClick) {
    console.log('Calendar event click:', event);
    this.toastService.info('Evento', `Evento: ${event.event.title}`);
  }

  onDateClick(event: CalendarDateClick) {
    console.log('Calendar date click:', event);
    this.toastService.info('Fecha', `Fecha: ${event.date.toLocaleDateString('es-CL')}`);
  }

  onAddEvent() {
    this.toastService.success('Calendario', 'Agregar nuevo evento - Funcionalidad en desarrollo');
  }

  onViewChange(view: any) {
    console.log('Calendar view change:', view);
    this.toastService.info('Vista', `Vista cambiada a: ${view.type}`);
  }

  // Update table data when clients change
  private updateTableData() {
    this.clientTableData = this.clients.map(client => ({
      ...client,
      id: client.id?.substring(0, 8) + '...' || 'N/A'
    }));
  }
}
