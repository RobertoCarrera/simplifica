import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SimpleSupabaseService, SimpleClient, SimpleCompany } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-dashboard-customers-debug-new',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6 max-w-6xl mx-auto">
      <h1 class="text-3xl font-bold mb-6">🔍 Debug - Clientes</h1>
      
      <!-- DEBUG ESTADO INTERNO -->
      <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <h2 class="text-lg font-semibold mb-3">� Estado Interno:</h2>
        <div class="text-sm">
          <p><strong>loading:</strong> {{ loading }}</p>
          <p><strong>error:</strong> {{ error }}</p>
          <p><strong>clients (length):</strong> {{ clients?.length || 'null' }}</p>
          <p><strong>availableCompanies (length):</strong> {{ availableCompanies.length || 0 }}</p>
          <p><strong>tenantParam:</strong> {{ tenantParam }}</p>
          <p><strong>currentCompanyName:</strong> {{ currentCompanyName }}</p>
        </div>
      </div>
      
      <!-- LOADING -->
      <div *ngIf="loading">
        <h2>⏳ LOADING...</h2>
      </div>
      
      <!-- ERROR -->
      <div *ngIf="!loading && error">
        <h2>❌ ERROR:</h2>
        <p>{{ error }}</p>
      </div>
      
      <!-- SUCCESS -->
      <div *ngIf="!loading && !error && clients">
        <h2>✅ SUCCESS - {{ clients.length }} clientes:</h2>
        <div *ngFor="let client of clients">
          • {{ client.name }} ({{ client.id }})
        </div>
      </div>
      
      <!-- EMPTY -->
      <div *ngIf="!loading && !error && clients && clients.length === 0">
        <h2>� NO HAY CLIENTES</h2>
      </div>
      
      <!-- Enlaces -->
      <div class="mt-6">
        <a href="/clientes?tenant=satpcgo" class="mr-2 bg-blue-100 px-2 py-1 rounded">SatPCGo</a>
        <a href="/clientes?tenant=michinanny" class="mr-2 bg-green-100 px-2 py-1 rounded">Michinanny</a>
        <a href="/clientes?tenant=anscarr" class="mr-2 bg-purple-100 px-2 py-1 rounded">Libera</a>
      </div>
    </div>
  `
})
export class DashboardCustomersDebugNewComponent implements OnInit {
  currentUrl = '';
  tenantParam: string | null = null;
  loading = true;
  error: string | null = null;
  clients: SimpleClient[] | null = null;
  isBrowser = false;
  currentCompanyId: string | null = null;
  currentCompanyName: string | null = null;
  availableCompanies: SimpleCompany[] = [];

  private route = inject(ActivatedRoute);
  private supabaseService = inject(SimpleSupabaseService);
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    console.log('🚀 Iniciando DashboardCustomersDebugNewComponent');
    
    this.isBrowser = isPlatformBrowser(this.platformId);
    
    // Solo obtener la URL en el browser
    if (this.isBrowser) {
      this.currentUrl = window.location.href;
    } else {
      this.currentUrl = 'N/A (SSR)';
    }
    
    // Suscribirse a los parámetros de query
    this.route.queryParams.subscribe(params => {
      this.tenantParam = params['tenant'] || null;
      console.log('🔍 Tenant detectado desde URL:', this.tenantParam);
      this.loadClients();
    });
  }

  async loadClients() {
    console.log('📋 Cargando clientes...');
    console.log('🔄 Estableciendo loading = true');
    this.loading = true;
    this.error = null;

    try {
      // Primero, vamos a ver qué empresas existen SIN FILTROS RLS
      console.log('🔍 Obteniendo TODAS las empresas (sin RLS)...');
      const { data: allCompaniesData, error: allCompaniesError } = await this.supabaseService.getClient()
        .from('companies')
        .select('id, name, website, legacy_negocio_id, created_at')
        .is('deleted_at', null);
      
      if (allCompaniesError) {
        console.error('❌ Error obteniendo todas las empresas:', allCompaniesError);
      } else {
        console.log('📋 TODAS las empresas (sin RLS):', allCompaniesData);
        this.availableCompanies = allCompaniesData || [];
      }
      
      // También probamos el método del servicio para comparar
      const companiesResult = await this.supabaseService.getCompanies();
      console.log('🏢 Empresas via servicio (con posible RLS):', companiesResult);

      // Si tenemos un tenant específico, necesitamos filtrar por company
      if (this.tenantParam) {
        const companyResult = await this.getCompanyFromTenant(this.tenantParam);
        if (companyResult) {
          this.currentCompanyId = companyResult.id;
          this.currentCompanyName = companyResult.name;
          
          console.log(`🏢 Company encontrada para ${this.tenantParam}:`, companyResult);
          
          // NUEVO: Cargar clientes directamente por company_id sin RLS
          console.log('📋 Cargando clientes directamente por company_id...');
          const { data: clientsData, error: clientsError } = await this.supabaseService.getClient()
            .from('clients')
            .select('*')
            .eq('company_id', companyResult.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
          
          if (clientsError) {
            this.error = 'Error directo de Supabase: ' + clientsError.message;
            console.error('❌ Error carga directa de clientes:', clientsError);
            this.clients = []; // Asegurar array vacío
          } else {
            this.clients = clientsData || [];
            this.error = null; // Limpiar error anterior
            console.log(`✅ Clientes cargados DIRECTAMENTE para ${this.tenantParam} (${companyResult.name}):`, this.clients.length);
          }
        } else {
          // En lugar de mostrar error, mostrar mensaje más claro
          this.currentCompanyId = null;
          this.currentCompanyName = null;
          this.clients = []; // Array vacío en lugar de null
          this.error = `❌ La empresa para el tenant "${this.tenantParam}" no existe en la base de datos. Necesitas ejecutar la migración completa.`;
          console.error('❌ Tenant no encontrado:', this.tenantParam);
        }
      } else {
        // Sin tenant específico, cargar todos los clientes
        this.currentCompanyId = null;
        this.currentCompanyName = null;
        
        const { data, error } = await this.supabaseService.getClient()
          .from('clients')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) {
          this.error = 'Error de Supabase: ' + error.message;
          console.error('❌ Error de Supabase:', error);
          this.clients = [];
        } else {
          this.clients = data || [];
          this.error = null;
          console.log('✅ Todos los clientes cargados:', this.clients.length);
        }
      }
    } catch (error: any) {
      this.error = 'Error de conexión: ' + (error.message || error);
      this.clients = [];
      console.error('❌ Error de conexión:', error);
    } finally {
      // CRÍTICO: SIEMPRE establecer loading = false
      this.loading = false;
      console.log('🏁 Loading establecido en false');
    }
  }

  private async getCompanyFromTenant(tenant: string): Promise<{id: string, name: string} | null> {
    // Mapeo de tenant a nombre de empresa
    const tenantToCompanyName: { [key: string]: string } = {
      'satpcgo': 'SatPCGo',
      'michinanny': 'Michinanny', 
      'anscarr': 'Libera Tus Creencias'
    };

    const companyName = tenantToCompanyName[tenant.toLowerCase()];
    if (!companyName) {
      console.log('❌ Tenant no reconocido:', tenant);
      return null;
    }

    try {
      // SOLUCIÓN: Obtener TODAS las empresas sin filtro .single()
      console.log('🔍 Buscando todas las empresas sin filtros RLS...');
      
      const { data: allCompanies, error: allError } = await this.supabaseService.getClient()
        .from('companies')
        .select('id, name, website, legacy_negocio_id, created_at')
        .is('deleted_at', null);
      
      if (allError) {
        console.error('❌ Error obteniendo todas las empresas:', allError);
        return null;
      }
      
      console.log('� TODAS las empresas sin filtro:', allCompanies);
      
      // Buscar por nombre en el array completo
      const company = allCompanies?.find(c => c.name === companyName);
      if (company) {
        console.log(`🎯 Empresa encontrada en lista completa: ${companyName} →`, company);
        return { id: company.id, name: company.name };
      }
      
      console.log('❌ No se encontró la empresa:', companyName);
      console.log('📋 Empresas disponibles:', allCompanies?.map(c => c.name));
      return null;
    } catch (error) {
      console.error('❌ Error buscando empresa:', error);
      return null;
    }
  }

  trackByClientId(index: number, client: SimpleClient): string {
    return client.id;
  }
}
