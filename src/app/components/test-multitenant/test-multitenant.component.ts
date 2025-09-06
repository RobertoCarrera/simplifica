import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SimpleSupabaseService, SimpleClient, SimpleCompany, SimpleUser } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-test-multitenant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mt-4">
      <h2>🧪 Test Multi-Tenant System</h2>
      
      <!-- Estado de conexión -->
      <div class="alert" [ngClass]="connectionStatus === 'connected' ? 'alert-success' : 'alert-warning'">
        <strong>Conexión Supabase:</strong> {{connectionStatus}}
      </div>

      <!-- Selector de empresa -->
      <div class="mb-3">
        <label class="form-label">Empresa Activa:</label>
        <select class="form-select" [(ngModel)]="selectedCompany" (change)="switchCompany()">
          <option value="">Seleccionar empresa...</option>
          <option value="00000000-0000-4000-8000-000000000001">Empresa Demo 1</option>
          <option value="00000000-0000-4000-8000-000000000002">Empresa Demo 2</option>
        </select>
        <small class="text-muted">Empresa actual: {{currentCompany || 'Ninguna'}}</small>
      </div>

      <!-- Test de funciones -->
      <div class="row">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5>🔧 Test de Funciones</h5>
            </div>
            <div class="card-body">
              <button class="btn btn-primary me-2 mb-2" (click)="testConnection()">
                Test Conexión
              </button>
              <button class="btn btn-secondary me-2 mb-2" (click)="testCompanyContext()">
                Test Contexto
              </button>
              <button class="btn btn-info me-2 mb-2" (click)="testRawQuery()">
                Test Query Directa
              </button>
              <hr>
              <button class="btn btn-warning me-2 mb-2" (click)="migrateLegacyData()">
                🔄 Migrar Datos Legacy
              </button>
              <button class="btn btn-success me-2 mb-2" (click)="loadUsers()">
                👥 Cargar Usuarios
              </button>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5>📊 Resultados</h5>
            </div>
            <div class="card-body">
              <div *ngIf="loading" class="spinner-border" role="status">
                <span class="visually-hidden">Cargando...</span>
              </div>
              
              <div *ngIf="results.length > 0">
                <div *ngFor="let result of results" 
                     class="alert" 
                     [ngClass]="result.success ? 'alert-success' : 'alert-danger'">
                  <strong>{{result.test}}:</strong> {{result.message}}
                  <pre *ngIf="result.data" class="mt-2 mb-0">{{result.data | json}}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Información de Migración -->
      <div class="card mt-3">
        <div class="card-header">
          <h5>📊 Migración de Datos Legacy</h5>
        </div>
        <div class="card-body">
          <p><strong>Datos de tu tabla "USUARIOS" anterior:</strong></p>
          <div class="table-responsive">
            <table class="table table-sm table-bordered">
              <thead class="table-light">
                <tr>
                  <th>Nombre</th>
                  <th>Apellidos</th>
                  <th>Web</th>
                  <th>Facturas</th>
                  <th>Presupuestos</th>
                  <th>Servicios</th>
                  <th>Material</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Marina</td>
                  <td>Casado García</td>
                  <td>michinanny.es</td>
                  <td><span class="badge bg-secondary">❌</span></td>
                  <td><span class="badge bg-secondary">❌</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-secondary">❌</span></td>
                </tr>
                <tr>
                  <td>Eva</td>
                  <td>Marín</td>
                  <td>gaticidad.es</td>
                  <td><span class="badge bg-secondary">❌</span></td>
                  <td><span class="badge bg-secondary">❌</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-secondary">❌</span></td>
                </tr>
                <tr>
                  <td>Roberto</td>
                  <td>Hugo Carrera</td>
                  <td>anscarr.es</td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                </tr>
                <tr>
                  <td>Vanesa</td>
                  <td>Santa Maria Garibaldi</td>
                  <td>liberatuscreencias.com</td>
                  <td><span class="badge bg-secondary">❌</span></td>
                  <td><span class="badge bg-secondary">❌</span></td>
                  <td><span class="badge bg-secondary">❌</span></td>
                  <td><span class="badge bg-secondary">❌</span></td>
                </tr>
                <tr>
                  <td>Alberto</td>
                  <td>Dominguez</td>
                  <td>satpcgo.es</td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                  <td><span class="badge bg-success">✅</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="alert alert-info">
            <strong>💡 Estrategia de migración:</strong><br>
            • <strong>negocio_id → company_id:</strong> Cada negocio se convierte en una empresa independiente<br>
            • <strong>Usuarios → users table:</strong> Con permisos JSON para cada módulo<br>
            • <strong>Web → company.website:</strong> Información adicional de la empresa<br>
            • <strong>Módulos → permissions:</strong> Control granular de acceso a componentes
          </div>
        </div>
      </div>

      <!-- Usuarios Legacy -->
      <div class="card mt-3" *ngIf="users.length > 0">
        <div class="card-header">
          <h5>👥 Usuarios Migrados ({{users.length}})</h5>
        </div>
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Empresa</th>
                  <th>Web</th>
                  <th>Permisos</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let user of users">
                  <td><strong>{{user.name}}</strong></td>
                  <td>{{user.email}}</td>
                  <td>{{user.company_name}}</td>
                  <td>
                    <a [href]="user.company_website" target="_blank" 
                       class="text-decoration-none small" *ngIf="user.company_website">
                      {{user.company_website}}
                    </a>
                  </td>
                  <td>
                    <div class="d-flex gap-1">
                      <span class="badge bg-primary" *ngIf="user.permissions?.moduloFacturas">Facturas</span>
                      <span class="badge bg-info" *ngIf="user.permissions?.moduloPresupuestos">Presupuestos</span>
                      <span class="badge bg-success" *ngIf="user.permissions?.moduloServicios">Servicios</span>
                      <span class="badge bg-warning" *ngIf="user.permissions?.moduloMaterial">Material</span>
                      <span class="badge bg-secondary" *ngIf="!user.permissions?.moduloFacturas && !user.permissions?.moduloPresupuestos && !user.permissions?.moduloServicios && !user.permissions?.moduloMaterial">Sin permisos</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Log de actividad -->
      <div class="card mt-3">
        <div class="card-header">
          <h5>📝 Log de Actividad</h5>
          <button class="btn btn-sm btn-outline-secondary" (click)="clearLog()">Limpiar</button>
        </div>
        <div class="card-body">
          <div *ngFor="let log of logs" class="text-muted small">
            <span class="text-secondary">{{log.time}}</span> - {{log.message}}
          </div>
          <div *ngIf="logs.length === 0" class="text-muted">
            No hay actividad registrada
          </div>
        </div>
      </div>
    </div>
  `
})
export class TestMultitenantComponent implements OnInit {
  connectionStatus = 'checking...';
  selectedCompany = '';
  currentCompany = '';
  loading = false;
  results: any[] = [];
  logs: any[] = [];
  companies: SimpleCompany[] = [];
  clients: SimpleClient[] = [];
  users: SimpleUser[] = [];

  constructor(private supabase: SimpleSupabaseService) {}

  ngOnInit() {
    this.log('Componente inicializado');
    this.testConnection();
  }

  log(message: string) {
    this.logs.unshift({
      time: new Date().toLocaleTimeString(),
      message
    });
    console.log(`[MultiTenant Test] ${message}`);
  }

  clearLog() {
    this.logs = [];
  }

  async testConnection() {
    this.loading = true;
    this.log('Probando conexión a Supabase...');

    const result = await this.supabase.testConnection();
    
    this.connectionStatus = result.success ? 'connected' : 'error: ' + result.message;
    this.addResult('Conexión', result.success, result.message, result.data);
    this.log(result.success ? 'Conexión exitosa' : 'Error: ' + result.message);
    
    // Si la conexión es exitosa, cargar empresas
    if (result.success) {
      await this.loadCompanies();
    }

    this.loading = false;
  }

  async loadCompanies() {
    this.log('Cargando empresas...');
    
    const result = await this.supabase.getCompanies();
    
    if (result.success && result.data) {
      this.companies = result.data;
      this.log(`${result.data.length} empresas cargadas`);
    } else {
      this.log('Error cargando empresas: ' + (result.error || 'Unknown'));
    }
  }

  async switchCompany() {
    if (!this.selectedCompany) {
      this.currentCompany = '';
      return;
    }

    this.loading = true;
    this.log(`Cambiando a empresa: ${this.selectedCompany}`);

    const result = await this.supabase.setCurrentCompany(this.selectedCompany);
    
    if (result.success) {
      this.currentCompany = this.selectedCompany;
      this.addResult('Cambio Empresa', true, `Empresa cambiada a ${this.selectedCompany}`);
      this.log('Empresa cambiada correctamente');
      
      // Cargar clientes de la nueva empresa
      await this.loadClients();
    } else {
      this.addResult('Cambio Empresa', false, result.error || 'Error desconocido');
      this.log('Error cambiando empresa: ' + (result.error || 'Unknown'));
    }

    this.loading = false;
  }

  async loadClients() {
    this.log('Cargando clientes...');
    
    const result = await this.supabase.getClients();
    
    if (result.success && result.data) {
      this.clients = result.data;
      this.log(`${result.data.length} clientes cargados`);
      this.addResult('Clientes', true, `${result.data.length} clientes encontrados`, result.data);
    } else {
      this.log('Error cargando clientes: ' + (result.error || 'Unknown'));
      this.addResult('Clientes', false, result.error || 'Error desconocido');
    }
  }

  async testCompanyContext() {
    this.loading = true;
    this.log('Probando estadísticas...');

    const result = await this.supabase.getStats();
    
    if (result.success && result.data) {
      const stats = result.data;
      const message = `Total: ${stats.companies} empresas, ${stats.clients} clientes, ${stats.clientsInCurrentCompany} en empresa actual`;
      this.addResult('Estadísticas', true, message, stats);
      this.log(message);
    } else {
      this.addResult('Estadísticas', false, result.error || 'Error desconocido');
      this.log('Error obteniendo estadísticas: ' + (result.error || 'Unknown'));
    }

    this.loading = false;
  }

  async testRawQuery() {
    this.loading = true;
    this.log('Probando query directa a clientes...');

    const result = await this.supabase.rawQuery('clients', 5);
    
    if (result.success && result.data) {
      this.addResult('Query Directa', true, `${result.data.length} registros encontrados`, result.data);
      this.log(`Query exitosa: ${result.data.length} registros`);
    } else {
      this.addResult('Query Directa', false, result.error || 'Error desconocido');
      this.log('Error query directa: ' + (result.error || 'Unknown'));
    }

    this.loading = false;
  }

  async loadUsers(): Promise<void> {
    this.log('Cargando usuarios...');
    
    const result = await this.supabase.getUsers();
    
    if (result.success && result.data) {
      this.users = result.data;
      this.log(`${result.data.length} usuarios cargados`);
      this.addResult('Usuarios', true, `${result.data.length} usuarios encontrados`, result.data);
    } else {
      this.log('Error cargando usuarios: ' + (result.error || 'Unknown'));
      this.addResult('Usuarios', false, result.error || 'Error desconocido');
    }
  }

  async migrateLegacyData(): Promise<void> {
    this.loading = true;
    this.log('🔄 Ejecutando migración de datos legacy...');

    try {
      // Ejecutar la migración de datos directamente
      this.log('📊 Insertando datos de empresas y usuarios...');
      const result = await this.supabase.migrateLegacyUsers();
      
      if (result.success) {
        this.addResult('Migración Legacy', true, 'Datos de usuarios legacy migrados correctamente');
        this.log('✅ Migración completada exitosamente');
        this.log(`📊 Migrados: ${result.data?.companies || 0} empresas y ${result.data?.users || 0} usuarios`);
        
        // Recargar datos después de la migración
        await this.loadCompanies();
        await this.loadUsers();
      } else {
        this.addResult('Migración Legacy', false, result.error || 'Error desconocido');
        this.log('❌ Error en migración: ' + (result.error || 'Unknown'));
        
        // Si el error es por columnas faltantes, dar instrucciones
        if (result.error?.includes('column') || result.error?.includes('does not exist')) {
          this.log('💡 Tip: Es posible que falten columnas en la base de datos.');
          this.log('💡 Ejecuta el script 05-prepare-migration.sql primero en Supabase.');
        }
      }
    } catch (error: any) {
      this.addResult('Migración Legacy', false, error.message || 'Error desconocido');
      this.log('❌ Error en migración: ' + error.message);
    } finally {
      this.loading = false;
    }
  }  addResult(test: string, success: boolean, message: string, data?: any) {
    this.results.unshift({ test, success, message, data });
    // Mantener solo los últimos 10 resultados
    if (this.results.length > 10) {
      this.results = this.results.slice(0, 10);
    }
  }
}
