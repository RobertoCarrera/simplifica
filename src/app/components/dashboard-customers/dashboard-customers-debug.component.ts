import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

interface ClientData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  metadata?: any;
}

@Component({
  selector: 'app-dashboard-customers',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <div class="header">
        <h1>👥 Clientes</h1>
        @if (tenantParam) {
          <span class="tenant-badge">🏢 Tenant: {{ tenantParam }}</span>
        }
      </div>

      <div class="debug-section">
        <h3>🔍 Información de depuración:</h3>
        <p><strong>URL actual:</strong> {{ currentUrl }}</p>
        <p><strong>Parámetro tenant:</strong> {{ tenantParam || 'No detectado' }}</p>
        <p><strong>Estado de carga:</strong> {{ loading ? 'Cargando...' : 'Completo' }}</p>
        <p><strong>Total clientes:</strong> {{ clients.length }}</p>
      </div>

      @if (loading) {
        <div class="loading">⏳ Cargando datos...</div>
      }

      @if (error) {
        <div class="error">
          ❌ Error: {{ error }}
          <button (click)="reload()">🔄 Reintentar</button>
        </div>
      }

      @if (!loading && clients.length === 0) {
        <div class="no-data">
          📭 No se encontraron clientes
          <button (click)="reload()">🔄 Recargar</button>
        </div>
      }

      @if (clients.length > 0) {
        <div class="clients-list">
          <h3>📋 Lista de clientes ({{ clients.length }}):</h3>
          @for (client of clients; track client.id) {
            <div class="client-item">
              <div class="client-name">👤 <strong>{{ client.name }}</strong></div>
              @if (client.email) {
                <div class="client-detail">📧 {{ client.email }}</div>
              }
              @if (client.phone) {
                <div class="client-detail">📞 {{ client.phone }}</div>
              }
              <div class="client-company">🏢 {{ client.company_name }}</div>
              @if (client.metadata?.tipo_cliente) {
                <div class="client-type">🏷️ {{ client.metadata.tipo_cliente }}</div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .container {
      padding: 20px;
      max-width: 1000px;
      margin: 0 auto;
      font-family: Arial, sans-serif;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 20px;
    }

    .tenant-badge {
      background: #e3f2fd;
      color: #1976d2;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
    }

    .debug-section {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 4px solid #2196f3;
    }

    .debug-section h3 {
      margin-top: 0;
      color: #333;
    }

    .loading, .error, .no-data {
      text-align: center;
      padding: 40px;
      border: 2px dashed #ccc;
      border-radius: 8px;
      margin: 20px 0;
    }

    .error {
      border-color: #f44336;
      background: #ffebee;
      color: #c62828;
    }

    .clients-list {
      margin-top: 20px;
    }

    .client-item {
      background: white;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-left: 4px solid #4caf50;
    }

    .client-name {
      font-size: 16px;
      margin-bottom: 5px;
    }

    .client-detail, .client-company, .client-type {
      font-size: 14px;
      color: #666;
      margin-bottom: 3px;
    }

    button {
      background: #2196f3;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      margin-left: 10px;
    }

    button:hover {
      background: #1976d2;
    }
  `]
})
export class DashboardCustomersComponent implements OnInit {
  clients: ClientData[] = [];
  loading = false;
  error: string | null = null;
  tenantParam: string | null = null;
  currentUrl = '';

  constructor(
    private route: ActivatedRoute,
    private supabase: SimpleSupabaseService
  ) {}

  ngOnInit(): void {
    // Obtener la URL actual
    this.currentUrl = window.location.href;
    
    // Obtener parámetro tenant de la URL
    this.route.queryParams.subscribe(params => {
      this.tenantParam = params['tenant'] || null;
      console.log('🔍 Parámetro tenant detectado:', this.tenantParam);
      this.loadClients();
    });
  }

  async loadClients() {
    console.log('📋 Iniciando carga de clientes...');
    this.loading = true;
    this.error = null;

    try {
      const { data, error } = await this.supabase.getClient()
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
        console.error('❌ Error en consulta:', error);
        this.error = error.message;
        return;
      }

      console.log('✅ Datos recibidos:', data);

      this.clients = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        company_name: item.companies?.name || 'Sin empresa',
        metadata: item.metadata
      }));

      console.log(`📊 ${this.clients.length} clientes procesados`);

    } catch (err: any) {
      console.error('❌ Error general:', err);
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  reload() {
    this.loadClients();
  }
}
