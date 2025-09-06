import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TenantService, TenantConfig } from '../../services/tenant.service';

@Component({
  selector: 'app-dashboard-home',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard-home.component.html',
  styleUrl: './dashboard-home.component.scss'
})
export class DashboardHomeComponent implements OnInit {
  loading = false;
  connectionStatus = 'Verificando...';
  companies: any[] = [];
  users: any[] = [];
  currentTenant: TenantConfig | null = null;
  isSuperAdmin: boolean = false;

  constructor(private tenantService: TenantService) {}

  ngOnInit() {
    console.log('Dashboard Home - Componente inicializado');
    
    // Suscribirse a cambios de tenant
    this.tenantService.tenant$.subscribe(tenant => {
      this.currentTenant = tenant;
      this.connectionStatus = tenant ? `Conectado como: ${tenant.name} ✅` : 'Sin tenant detectado ❌';
      console.log('🏢 Dashboard cargado para tenant:', tenant?.name);
    });

    this.isSuperAdmin = this.tenantService.isSuperAdmin();
    this.loading = false;
  }

  loadData() {
    console.log('Dashboard Home - Cargando datos...');
    // Datos de ejemplo para verificar que funciona
    this.companies = [
      { id: '1', name: 'Empresa Demo', created_at: new Date().toISOString() }
    ];
    this.users = [
      { id: '1', name: 'Usuario Demo' }
    ];
  }
}
