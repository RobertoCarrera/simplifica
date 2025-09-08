import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <!-- Header Section -->
      <div class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">
              Tickets{{ tenantName ? ' de ' + tenantName : '' }}
            </h1>
            <p class="text-gray-600 mt-1">Sistema de gestión de tickets y reparaciones</p>
          </div>
          <div class="flex space-x-2">
            <span class="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm">
              {{ tickets.length }} ticket{{ tickets.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Tenant Filter -->
      <div class="mb-6 bg-white rounded-lg shadow-sm p-4">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Filtrar por empresa:</h3>
        <div class="flex flex-col sm:flex-row flex-wrap gap-2">
          <a href="/tickets?tenant=satpcgo" 
             [class]="tenant === 'satpcgo' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'"
             class="px-4 py-2 rounded-lg transition-colors duration-200 text-center sm:text-left">
            🏢 SatPCGo
          </a>
          <a href="/tickets?tenant=michinanny" 
             [class]="tenant === 'michinanny' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'"
             class="px-4 py-2 rounded-lg transition-colors duration-200 text-center sm:text-left">
            🏢 Michinanny
          </a>
          <a href="/tickets" 
             [class]="!tenant ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
             class="px-4 py-2 rounded-lg transition-colors duration-200">
            📋 Todos
          </a>
          <a href="/clientes" 
             class="px-4 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg transition-colors duration-200">
            ← Clientes
          </a>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        <span class="ml-3 text-gray-600">Cargando tickets...</span>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <span class="text-red-600 text-xl">❌</span>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Error al cargar tickets</h3>
            <p class="mt-1 text-sm text-red-700">{{ error }}</p>
          </div>
        </div>
      </div>

      <!-- Tickets List -->
      <div *ngIf="!loading && !error" class="space-y-4">
        <div *ngFor="let ticket of tickets" 
             (click)="viewTicketDetail(ticket.id)"
             class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-orange-300 transition-all duration-200 cursor-pointer">
          
          <!-- Ticket Header -->
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 space-y-2 sm:space-y-0">
            <div class="flex-1">
              <div class="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                <h3 class="text-lg font-semibold text-gray-900">
                  🎫 #{{ ticket.ticket_number || ticket.id.substring(0, 8) }}
                </h3>
                <span [style.background-color]="getStageColor(ticket.stage?.color)"
                      class="px-2 py-1 text-white rounded-full text-xs font-medium self-start">
                  {{ ticket.stage?.name || 'Sin estado' }}
                </span>
              </div>
              <h4 class="text-gray-900 font-medium mt-2">{{ ticket.title || 'Sin título' }}</h4>
              <p class="text-gray-600 mt-1 text-sm sm:text-base">{{ ticket.description || 'Sin descripción' }}</p>
            </div>
            <div class="text-left sm:text-right flex-shrink-0">
              <p class="text-sm text-gray-500">{{ formatDate(ticket.created_at) }}</p>
              <p *ngIf="ticket.total_amount" class="text-lg font-bold text-orange-600 mt-1">
                {{ ticket.total_amount }} €
              </p>
            </div>
          </div>

          <!-- Client and Priority Info -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div>
              <h4 class="text-sm font-medium text-gray-700 mb-2">Cliente</h4>
              <div class="bg-gray-50 rounded-md p-3">
                <p class="font-medium text-gray-900 text-sm">{{ ticket.client?.name || 'No asignado' }}</p>
                <p *ngIf="ticket.client?.email" class="text-xs text-gray-600 truncate">{{ ticket.client.email }}</p>
              </div>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-700 mb-2">Prioridad</h4>
              <div class="bg-gray-50 rounded-md p-3">
                <span [style.color]="getPriorityColor(ticket.priority)" 
                      class="font-medium text-sm">
                  {{ ticket.priority || 'normal' }}
                </span>
              </div>
            </div>

            <div>
              <h4 class="text-sm font-medium text-gray-700 mb-2">Fecha límite</h4>
              <div class="bg-gray-50 rounded-md p-3">
                <p class="text-gray-900">{{ ticket.due_date || 'Sin fecha límite' }}</p>
              </div>
            </div>
          </div>

          <!-- Comments -->
          <div *ngIf="ticket.comments && ticket.comments.length > 0" class="mb-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Comentarios</h4>
            <div class="bg-blue-50 rounded-md p-3">
              <ul class="space-y-1">
                <li *ngFor="let comment of ticket.comments" class="text-sm text-gray-700">
                  • {{ comment }}
                </li>
              </ul>
            </div>
          </div>

          <!-- Action Button -->
          <div class="flex justify-end">
            <button class="text-orange-600 hover:text-orange-800 font-medium text-sm">
              Ver detalles →
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="tickets.length === 0" 
             class="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div class="text-gray-400 text-6xl mb-4">🎫</div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No hay tickets</h3>
          <p class="text-gray-500">
            {{ tenantName ? 'No se encontraron tickets para ' + tenantName : 'No hay tickets registrados en el sistema' }}
          </p>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Acciones rápidas</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <a href="/clientes?tenant={{ tenant || '' }}" 
             class="flex items-center p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors duration-200">
            <span class="text-2xl mr-3">👥</span>
            <div>
              <p class="font-medium text-gray-900 text-sm sm:text-base">Ver Clientes</p>
              <p class="text-xs sm:text-sm text-gray-600">Gestionar clientes</p>
            </div>
          </a>
          
          <a href="/productos" 
             class="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors duration-200">
            <span class="text-2xl mr-3">📦</span>
            <div>
              <p class="font-medium text-gray-900 text-sm sm:text-base">Productos</p>
              <p class="text-xs sm:text-sm text-gray-600">Catálogo disponible</p>
            </div>
          </a>
          
          <a href="/servicios" 
             class="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors duration-200">
            <span class="text-2xl mr-3">🔧</span>
            <div>
              <p class="font-medium text-gray-900">Servicios</p>
              <p class="text-sm text-gray-600">Servicios disponibles</p>
            </div>
          </a>
          
          <button class="flex items-center p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors duration-200 text-left">
            <span class="text-2xl mr-3">➕</span>
            <div>
              <p class="font-medium text-gray-900">Nuevo Ticket</p>
              <p class="text-sm text-gray-600">Crear solicitud</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  `
})
export class TicketsComponent implements OnInit {
  loading = false;
  error: string | null = null;
  tickets: any[] = [];
  tenant: string | null = null;
  tenantName: string | null = null;
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SimpleSupabaseService);

  ngOnInit() {
    console.log('🎫 Tickets Component iniciado');
    
    this.route.queryParams.subscribe(params => {
      this.tenant = params['tenant'] || null;
      this.setTenantName();
      console.log('🔍 Tenant:', this.tenant);
      this.loadTickets();
    });
  }

  private setTenantName() {
    const tenantMap: { [key: string]: string } = {
      'satpcgo': 'SatPCGo',
      'michinanny': 'Michinanny'
    };
    this.tenantName = this.tenant ? tenantMap[this.tenant.toLowerCase()] : null;
  }

  async loadTickets() {
    console.log('🎫 Cargando tickets...');
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
        
        // Buscar tickets con relaciones
        const { data: tickets, error: ticketsError } = await this.supabase.getClient()
          .from('tickets')
          .select(`
            *,
            client:clients(id, name, email),
            stage:ticket_stages(id, name, position, color),
            company:companies(id, name)
          `)
          .eq('company_id', companies[0].id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        
        if (ticketsError) throw new Error('Error tickets: ' + ticketsError.message);
        
        this.tickets = tickets || [];
        console.log('✅ Tickets:', this.tickets.length);
        
      } else {
        // Cargar todos
        const { data: tickets, error } = await this.supabase.getClient()
          .from('tickets')
          .select(`
            *,
            client:clients(id, name, email),
            stage:ticket_stages(id, name, position, color),
            company:companies(id, name)
          `)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        
        if (error) throw new Error('Error todos: ' + error.message);
        
        this.tickets = tickets || [];
        console.log('✅ Todos los tickets:', this.tickets.length);
      }
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error:', error);
    } finally {
      this.loading = false;
    }
  }

  getStageColor(color?: string): string {
    return color || '#6b7280';
  }

  getPriorityColor(priority?: string): string {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES');
  }

  viewTicketDetail(ticketId: string) {
    this.router.navigate(['/ticket', ticketId]);
  }
}
