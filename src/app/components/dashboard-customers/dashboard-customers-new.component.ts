import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimpleSupabaseService, SimpleClient } from '../../services/simple-supabase.service';
import { TenantService } from '../../services/tenant.service';

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
                  🏢 {{ client.company_id || 'Sin empresa' }}
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

  constructor(
    private supabase: SimpleSupabaseService,
    private tenantService: TenantService
  ) {}

  ngOnInit(): void {
    console.log('🔄 Dashboard customers iniciado');
    this.loadClients();
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
          company_id: client.companies?.name || 'Sin empresa'
        }));
      }
    } catch (err: any) {
      console.error('❌ Error general:', err);
      this.error = `Error: ${err.message}`;
    } finally {
      this.loading = false;
    }
  }
}
