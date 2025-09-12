import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimpleSupabaseService, SimpleClient } from '../../services/simple-supabase.service';
import { TenantService } from '../../services/tenant.service';
import { Customer } from '../../models/customer';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { LoadingComponent } from '../loading/loading.component';
import { SmoothTransitionDirective } from '../../directives/smooth-transition.directive';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-dashboard-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dashboard-container">
      <div class="header">
        <h1>👥 Clientes</h1>
        @if (currentTenant) {
          <div class="tenant-info">
            <span class="badge">🏢 {{ currentTenant.name }}</span>
          </div>
        }
      </div>

      @if (loading) {
        <div class="loading">
          ⏳ Cargando clientes...
        </div>
      }

      @if (error) {
        <div class="error">
          ❌ {{ error }}
          <button (click)="loadClients()" class="retry-btn">🔄 Reintentar</button>
        </div>
      }

      @if (!loading && !error) {
        <div class="clients-grid">
          @if (clients.length === 0) {
            <div class="no-clients">
              📭 No hay clientes en esta empresa aún.
              <button (click)="loadClients()" class="refresh-btn">🔄 Actualizar</button>
            </div>
          } @else {
            <div class="clients-count">
              📊 Total: {{ clients.length }} clientes
            </div>
            
            @for (client of clients; track client.id) {
              <div class="client-card">
                <div class="client-name">👤 {{ client.name }}</div>
                @if (client.email) {
                  <div class="client-email">📧 {{ client.email }}</div>
                }
                @if (client.phone) {
                  <div class="client-phone">📞 {{ client.phone }}</div>
                }
                <div class="client-meta">
                  🏢 {{ client.company_name || 'Sin empresa' }}
                </div>
              </div>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .tenant-info .badge {
      background: #e3f2fd;
      color: #1976d2;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
    }

    .loading, .error, .no-clients {
      text-align: center;
      padding: 40px;
      border: 2px dashed #ddd;
      border-radius: 8px;
      margin: 20px 0;
    }

    .error {
      border-color: #f5c6cb;
      background: #f8d7da;
      color: #721c24;
    }

    .retry-btn, .refresh-btn {
      margin-left: 10px;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: #007bff;
      color: white;
    }

    .clients-count {
      margin-bottom: 20px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 4px;
      font-weight: 500;
    }

    .clients-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }

    .client-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-left: 4px solid #007bff;
    }

    .client-name {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
    }

    .client-email, .client-phone, .client-meta {
      font-size: 14px;
      color: #666;
      margin-bottom: 4px;
    }

    .client-meta {
      font-style: italic;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #eee;
    }
  `]
})
export class DashboardCustomersComponent implements OnInit {
  clients: SimpleClient[] = [];
  loading = false;
  error: string | null = null;
  currentTenant: any = null;

  // Properties used by legacy/multi-tenant methods
  searchCustomer: string = '';
  customers: Customer[] = [];
  selectedCustomer: Customer | null = null;
  modalCustomer = false;
  customerInEdition: Customer | null = null;
  isModalVisible = false;
  changeEditionCustomer = false;
  isShrink = false;

  constructor(
    private supabase: SimpleSupabaseService,
    private tenantService: TenantService
  ) {}

  ngOnInit(): void {
    console.log('🔄 Dashboard customers iniciado');
    
    // Obtener tenant actual (observable)
    this.tenantService.tenant$.subscribe(tenant => {
      console.log('🏢 Tenant actual:', tenant);
      this.currentTenant = tenant;
      this.loadClients();
      // also load multi-tenant data helper
      this.loadMultiTenantData();
    });
  }

  async loadClients() {
    this.loading = true;
    this.error = null;
    
    try {
      console.log('📋 Cargando clientes...');
      
      const { data: clients, error } = await this.supabase.getClient()
        .from('clients')
        .select(`
          id,
          name,
          email,
          phone,
          metadata,
          companies:company_id (name)
        `)
        .order('name');

      if (error) {
        console.error('❌ Error cargando clientes:', error);
        this.error = `Error: ${error.message}`;
      } else {
        console.log('✅ Clientes cargados:', clients);
        this.clients = (clients || []).map((client: any) => ({
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          company_name: client.companies?.name || 'Sin empresa'
        }));
      }
    } catch (err: any) {
      console.error('❌ Error general:', err);
      this.error = `Error: ${err.message}`;
    } finally {
      this.loading = false;
    }
  }
  
  // === NUEVOS MÉTODOS MULTI-TENANT ===

  async loadMultiTenantData(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const result = await this.supabase.getClients();
      
      if (result.success && result.data) {
        this.clients = result.data;
        console.log('Clientes cargados:', this.clients);
      } else {
        this.error = 'Error cargando clientes: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error cargando clientes: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  async createNewClient(): Promise<void> {
    const clientName = prompt('Nombre del cliente:');
    const clientEmail = prompt('Email del cliente (opcional):');
    
    if (!clientName) return;

    this.loading = true;
    try {
      const result = await this.supabase.createClient(clientName, clientEmail || undefined);
      
      if (result.success && result.data) {
        this.clients.push(result.data);
        console.log('Cliente creado:', result.data);
      } else {
        this.error = 'Error creando cliente: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error creando cliente: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  async deleteClient(clientId: string): Promise<void> {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) return;

    this.loading = true;
    try {
      const result = await this.supabase.deleteClient(clientId);
      
      if (result.success) {
        this.clients = this.clients.filter(c => c.id !== clientId);
        console.log('Cliente eliminado');
      } else {
        this.error = 'Error eliminando cliente: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error eliminando cliente: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  async searchClients(): Promise<void> {
    if (!this.searchCustomer.trim()) {
      this.loadMultiTenantData();
      return;
    }

    this.loading = true;
    try {
      const result = await this.supabase.searchClients(this.searchCustomer);
      
      if (result.success && result.data) {
        this.clients = result.data;
      } else {
        this.error = 'Error buscando clientes: ' + (result.error || 'Unknown');
      }
    } catch (error: any) {
      this.error = 'Error buscando clientes: ' + error.message;
    } finally {
      this.loading = false;
    }
  }

  // === MÉTODOS DE UTILIDAD ===

  getClientsWithEmail(): number {
    return this.clients.filter(c => c.email && c.email.trim()).length;
  }

  getClientsWithPhone(): number {
    return this.clients.filter(c => c.phone && c.phone.trim()).length;
  }

  // === MÉTODOS LEGACY SIMPLIFICADOS ===

  filterCustomers(): Customer[] {
    return this.customers.filter(c => 
      (c.name || '').toLowerCase().includes(this.searchCustomer.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(this.searchCustomer.toLowerCase())
    );
  }

  openCustomerModal(customer: Customer): void {
    this.selectedCustomer = customer;
    this.modalCustomer = true;
  }

  closeCustomerModal(): void {
    this.modalCustomer = false;
    this.selectedCustomer = null;
  }

  selectCustomer(customer: Customer): void {
    this.selectedCustomer = customer;
    this.modalCustomer = true;
  }

  closeModal(): void {
    this.modalCustomer = false;
    this.selectedCustomer = null;
  }

  openModal(customer?: Customer): void {
    this.customerInEdition = customer || null;
    this.isModalVisible = true;
  }

  closeModalCustomer(): void {
    this.isModalVisible = false;
    this.customerInEdition = null;
    this.changeEditionCustomer = false;
  }

  onCustomerCreated(customer: Customer): void {
    console.log('Cliente legacy creado:', customer);
  }

  onCustomerUpdated(customer: Customer): void {
    console.log('Cliente legacy actualizado:', customer);
  }

  editCustomer(customer: Customer): void {
    console.log('Editando cliente legacy:', customer);
  }

  deleteLegacyCustomer(customerId: number): void {
    console.log('Eliminando cliente legacy:', customerId);
  }

  searchCustomers(): void {
    console.log('Buscando clientes legacy:', this.searchCustomer);
  }

  onResize(): void {
    this.isShrink = window.innerWidth < 768;
  }
}
