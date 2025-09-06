import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-ultra-simple',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <!-- Header Section -->
      <div class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">
              Clientes{{ tenantName ? ' de ' + tenantName : '' }}
            </h1>
            <p class="text-gray-600 mt-1">Gestión de clientes del sistema</p>
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
          <a href="/tickets?tenant={{ tenant || '' }}" 
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
          
          <a href="/trabajos" 
             class="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors duration-200">
            <span class="text-2xl mr-3">🔧</span>
            <div>
              <p class="font-medium text-gray-900">Servicios</p>
              <p class="text-sm text-gray-600">Trabajos disponibles</p>
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
    </div>
  `
})
export class UltraSimpleComponent implements OnInit {
  loading = false;
  error: string | null = null;
  clients: any[] = [];
  tenant: string | null = null;
  tenantName: string | null = null;
  
  private route = inject(ActivatedRoute);
  private supabase = inject(SimpleSupabaseService);

  ngOnInit() {
    console.log('🚀 Componente iniciado');
    
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
        
        // Buscar clientes
        const { data: clients, error: clientsError } = await this.supabase.getClient()
          .from('clients')
          .select('*')
          .eq('company_id', companies[0].id)
          .is('deleted_at', null);
        
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
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error:', error);
    } finally {
      this.loading = false;
    }
  }
}
