import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-simple-clients',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; font-family: Arial;">
      <h1>🚀 Clientes - Paso a Paso</h1>
      
      <div style="background: #f0f0f0; padding: 15px; margin: 10px 0;">
        <h3>📊 Estado:</h3>
        <p><strong>Tenant:</strong> {{ tenant || 'ninguno' }}</p>
        <p><strong>Loading:</strong> {{ loading }}</p>
        <p><strong>Error:</strong> {{ error || 'ninguno' }}</p>
        <p><strong>Clientes:</strong> {{ clientCount }}</p>
      </div>

      <div *ngIf="loading" style="background: yellow; padding: 10px;">
        ⏳ Cargando...
      </div>

      <div *ngIf="error" style="background: red; color: white; padding: 10px;">
        ❌ {{ error }}
      </div>

      <div *ngIf="!loading && !error">
        <h3>✅ Clientes ({{ clientCount }}):</h3>
        <div *ngFor="let client of clients" style="border: 1px solid #ccc; margin: 5px; padding: 10px;">
          <strong>{{ client.name }}</strong>
          <br>{{ client.email }}
          <br><small>ID: {{ client.id }}</small>
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <a href="/clientes?tenant=satpcgo" style="background: blue; color: white; padding: 10px; margin: 5px; text-decoration: none;">SatPCGo</a>
        <a href="/clientes?tenant=michinanny" style="background: green; color: white; padding: 10px; margin: 5px; text-decoration: none;">Michinanny</a>
        <a href="/clientes" style="background: gray; color: white; padding: 10px; margin: 5px; text-decoration: none;">Todos</a>
      </div>
    </div>
  `
})
export class SimpleClientsComponent implements OnInit {
  loading = true;
  error: string | null = null;
  clients: any[] = [];
  tenant: string | null = null;
  
  private route = inject(ActivatedRoute);
  private supabase = inject(SimpleSupabaseService);

  get clientCount(): number {
    return this.clients?.length || 0;
  }

  ngOnInit() {
    console.log('🚀 SimpleClientsComponent iniciado');
    
    this.route.queryParams.subscribe(params => {
      this.tenant = params['tenant'] || null;
      console.log('🔍 Tenant detectado:', this.tenant);
      this.loadData();
    });
  }

  async loadData() {
    console.log('📋 Iniciando carga de datos...');
    this.loading = true;
    this.error = null;

    try {
      // Paso 1: Verificar conexión
      console.log('🔌 Verificando conexión a Supabase...');
      const { data: testData, error: testError } = await this.supabase.getClient()
        .from('companies')
        .select('count')
        .limit(1);
      
      if (testError) {
        throw new Error('Conexión fallida: ' + testError.message);
      }
      
      console.log('✅ Conexión a Supabase OK');

      // Paso 2: Cargar datos según tenant
      if (this.tenant) {
        await this.loadByTenant();
      } else {
        await this.loadAll();
      }

    } catch (error: any) {
      this.error = error.message || 'Error desconocido';
      console.error('❌ Error:', error);
    } finally {
      this.loading = false;
      console.log('🏁 Carga terminada');
    }
  }

  async loadByTenant() {
    console.log('🏢 Cargando por tenant:', this.tenant);
    
    // Mapeo simple
    const tenantMap: any = {
      'satpcgo': 'SatPCGo',
      'michinanny': 'Michinanny'
    };
    
    const companyName = tenantMap[this.tenant!.toLowerCase()];
    if (!companyName) {
      throw new Error(`Tenant "${this.tenant}" no reconocido`);
    }

    // Buscar empresa
    const { data: companies, error: companyError } = await this.supabase.getClient()
      .from('companies')
      .select('id, name')
      .eq('name', companyName);
    
    if (companyError) {
      throw new Error('Error buscando empresa: ' + companyError.message);
    }

    if (!companies || companies.length === 0) {
      throw new Error(`Empresa "${companyName}" no encontrada`);
    }

    console.log('🎯 Empresa encontrada:', companies[0]);

    // Buscar clientes
    const { data: clients, error: clientsError } = await this.supabase.getClient()
      .from('clients')
      .select('*')
      .eq('company_id', companies[0].id);
    
    if (clientsError) {
      throw new Error('Error cargando clientes: ' + clientsError.message);
    }

    this.clients = clients || [];
    console.log('✅ Clientes cargados:', this.clients.length);
  }

  async loadAll() {
    console.log('📋 Cargando todos los clientes...');
    
    const { data: clients, error } = await this.supabase.getClient()
      .from('clients')
      .select('*');
    
    if (error) {
      throw new Error('Error cargando todos los clientes: ' + error.message);
    }

    this.clients = clients || [];
    console.log('✅ Todos los clientes cargados:', this.clients.length);
  }
}
