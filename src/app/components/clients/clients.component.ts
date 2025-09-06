import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SimpleSupabaseService, SimpleClient } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mx-auto p-6">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-800">Clientes</h1>
        <p class="text-gray-600 mt-2">Gestión de clientes {{ tenantName ? 'de ' + tenantName : '' }}</p>
      </div>

      <!-- Enlaces de navegación -->
      <div class="mb-6 space-x-2">
        <a href="/clientes?tenant=satpcgo" 
           class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
          SatPCGo
        </a>
        <a href="/clientes?tenant=michinanny" 
           class="inline-block px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
          Michinanny
        </a>
        <a href="/clientes" 
           class="inline-block px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">
          Todos
        </a>
      </div>

      <!-- Estado de carga -->
      <div *ngIf="loading" class="text-center py-8">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p class="mt-2 text-gray-600">Cargando clientes...</p>
      </div>

      <!-- Error -->
      <div *ngIf="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <h3 class="text-red-800 font-semibold">Error</h3>
        <p class="text-red-700">{{ error }}</p>
      </div>

      <!-- Lista de clientes -->
      <div *ngIf="!loading && !error" class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b">
          <h2 class="text-xl font-semibold">
            {{ clients.length }} cliente{{ clients.length !== 1 ? 's' : '' }} encontrado{{ clients.length !== 1 ? 's' : '' }}
          </h2>
        </div>
        
        <div *ngIf="clients.length === 0" class="p-6 text-center text-gray-500">
          No hay clientes registrados{{ tenantName ? ' para ' + tenantName : '' }}.
        </div>
        
        <div *ngIf="clients.length > 0" class="divide-y">
          <div *ngFor="let client of clients" class="p-6 hover:bg-gray-50 transition-colors">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">{{ client.name }}</h3>
                <p class="text-gray-600">{{ client.email }}</p>
                <p *ngIf="client.phone" class="text-gray-600">{{ client.phone }}</p>
              </div>
              <div class="text-sm text-gray-500">
                ID: {{ client.id }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .container {
      max-width: 1200px;
    }
  `]
})
export class ClientsComponent implements OnInit {
  loading = true;
  error: string | null = null;
  clients: SimpleClient[] = [];
  tenantParam: string | null = null;
  tenantName: string | null = null;

  private route = inject(ActivatedRoute);
  private supabase = inject(SimpleSupabaseService);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.tenantParam = params['tenant'] || null;
      this.setTenantName();
      this.loadClients();
    });
  }

  private setTenantName() {
    const tenantNames: { [key: string]: string } = {
      'satpcgo': 'SatPCGo',
      'michinanny': 'Michinanny'
    };
    this.tenantName = this.tenantParam ? tenantNames[this.tenantParam.toLowerCase()] : null;
  }

  private async loadClients() {
    this.loading = true;
    this.error = null;

    try {
      if (this.tenantParam && this.tenantName) {
        // Cargar clientes para un tenant específico
        await this.loadClientsByTenant();
      } else {
        // Cargar todos los clientes
        await this.loadAllClients();
      }
    } catch (error: any) {
      this.error = 'Error al cargar los clientes: ' + (error.message || error);
      console.error('Error loading clients:', error);
    } finally {
      this.loading = false;
    }
  }

  private async loadClientsByTenant() {
    // Buscar la empresa por nombre
    const { data: companies, error: companyError } = await this.supabase.getClient()
      .from('companies')
      .select('id, name')
      .eq('name', this.tenantName)
      .is('deleted_at', null);

    if (companyError) {
      throw new Error('Error buscando empresa: ' + companyError.message);
    }

    if (!companies || companies.length === 0) {
      throw new Error(`No se encontró la empresa "${this.tenantName}"`);
    }

    const company = companies[0];

    // Cargar clientes de la empresa
    const { data: clients, error: clientsError } = await this.supabase.getClient()
      .from('clients')
      .select('*')
      .eq('company_id', company.id)
      .is('deleted_at', null)
      .order('name');

    if (clientsError) {
      throw new Error('Error cargando clientes: ' + clientsError.message);
    }

    this.clients = clients || [];
  }

  private async loadAllClients() {
    const { data: clients, error } = await this.supabase.getClient()
      .from('clients')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (error) {
      throw new Error('Error cargando todos los clientes: ' + error.message);
    }

    this.clients = clients || [];
  }
}
