// src/app/services/tenant.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

export interface TenantConfig {
  id: string;
  name: string;
  subdomain: string;
  domain: string;
  theme?: string;
  logo?: string;
  allowedModules: {
    facturas: boolean;
    presupuestos: boolean;
    servicios: boolean;
    material: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class TenantService {
  private tenantSubject = new BehaviorSubject<TenantConfig | null>(null);
  public tenant$ = this.tenantSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    // Solo detectar tenant en el navegador, no en SSR
    if (isPlatformBrowser(this.platformId)) {
      this.detectTenant();
    } else {
      // En SSR, usar configuración por defecto
      this.setDefaultTenant();
    }
  }

  private setDefaultTenant(): void {
    // Configuración por defecto para SSR
    const defaultTenant: TenantConfig = {
      id: 'dev-mode',
      name: 'Desarrollo',
      subdomain: 'dev',
      domain: 'localhost',
      theme: 'default',
      allowedModules: {
        facturas: true,
        presupuestos: true,
        servicios: true,
        material: true
      }
    };
    this.tenantSubject.next(defaultTenant);
  }

  private detectTenant(): void {
    const hostname = window.location.hostname;
    console.log('🏢 Detecting tenant from hostname:', hostname);
    
    // Para testing: detectar por parámetro URL también
    const urlParams = new URLSearchParams(window.location.search);
    const testTenant = urlParams.get('tenant');
    
    if (testTenant) {
      console.log('🧪 Using test tenant from URL param:', testTenant);
      const tenant = this.getTenantByName(testTenant);
      if (tenant) {
        this.tenantSubject.next(tenant);
        this.setSupabaseSession(tenant.id);
        return;
      }
    }
    
    // Mapeo de subdominios a tenants
    const tenantMappings: Record<string, TenantConfig> = {
      'crm.michinanny.es': {
        id: '671ec9f84ecc7019c9ea3bd2',
        name: 'Michinanny',
        subdomain: 'crm',
        domain: 'michinanny.es',
        theme: 'purple',
        allowedModules: {
          facturas: false,
          presupuestos: false, 
          servicios: true,
          material: false
        }
      },
      'admin.anscarr.es': {
        id: '67f38eaeb414535e7d278c71',
        name: 'Anscarr', 
        subdomain: 'admin',
        domain: 'anscarr.es',
        theme: 'blue',
        allowedModules: {
          facturas: true,
          presupuestos: true,
          servicios: true, 
          material: true
        }
      },
      'panel.liberatuscreencias.com': {
        id: '67227971cb317c137fb1dd20',
        name: 'Libera Tus Creencias',
        subdomain: 'panel', 
        domain: 'liberatuscreencias.com',
        theme: 'green',
        allowedModules: {
          facturas: false,
          presupuestos: false,
          servicios: false,
          material: false
        }
      },
      'crm.satpcgo.es': {
        id: '6717b325cb317c137fb1dcd5',
        name: 'SatPCGo',
        subdomain: 'crm',
        domain: 'satpcgo.es', 
        theme: 'orange',
        allowedModules: {
          facturas: false,
          presupuestos: false,
          servicios: false,
          material: false
        }
      },
      // Para desarrollo local
      'localhost': {
        id: 'dev-mode',
        name: 'Desarrollo',
        subdomain: 'dev',
        domain: 'localhost',
        theme: 'default',
        allowedModules: {
          facturas: true,
          presupuestos: true,
          servicios: true,
          material: true
        }
      },
      // Simulación local de tenants
      'crm.michinanny.local': {
        id: '671ec9f84ecc7019c9ea3bd2',
        name: 'Michinanny',
        subdomain: 'crm',
        domain: 'michinanny.local',
        theme: 'purple',
        allowedModules: {
          facturas: false,
          presupuestos: false,
          servicios: true,
          material: false
        }
      },
      'admin.anscarr.local': {
        id: '67f38eaeb414535e7d278c71',
        name: 'Anscarr',
        subdomain: 'admin', 
        domain: 'anscarr.local',
        theme: 'blue',
        allowedModules: {
          facturas: true,
          presupuestos: true,
          servicios: true,
          material: true
        }
      },
      'admin.tudominio.local': {
        id: 'super-admin',
        name: 'Super Administrador',
        subdomain: 'admin',
        domain: 'tudominio.local',
        theme: 'admin',
        allowedModules: {
          facturas: true,
          presupuestos: true,
          servicios: true,
          material: true
        }
      }
    };

    const tenant = tenantMappings[hostname] || tenantMappings['localhost'];
    this.tenantSubject.next(tenant);
    
    // Configurar sesión de Supabase para este tenant
    if (tenant) {
      this.setSupabaseSession(tenant.id);
    }
  }

  private getTenantByName(name: string): TenantConfig | null {
    const tenantMap: Record<string, TenantConfig> = {
      'michinanny': {
        id: '671ec9f84ecc7019c9ea3bd2',
        name: 'Michinanny',
        subdomain: 'crm',
        domain: 'michinanny.local',
        theme: 'purple',
        allowedModules: {
          facturas: false,
          presupuestos: false,
          servicios: true,
          material: false
        }
      },
      'anscarr': {
        id: '67f38eaeb414535e7d278c71',
        name: 'Anscarr',
        subdomain: 'admin',
        domain: 'anscarr.local',
        theme: 'blue',
        allowedModules: {
          facturas: true,
          presupuestos: true,
          servicios: true,
          material: true
        }
      },
      'admin': {
        id: 'super-admin',
        name: 'Super Administrador',
        subdomain: 'admin',
        domain: 'tudominio.local',
        theme: 'admin',
        allowedModules: {
          facturas: true,
          presupuestos: true,
          servicios: true,
          material: true
        }
      }
    };
    
    return tenantMap[name] || null;
  }

  private setSupabaseSession(companyId: string): void {
    // Configurar variable de sesión para RLS solo en el navegador
    if (isPlatformBrowser(this.platformId)) {
      console.log('🔒 Setting tenant context for RLS:', companyId);
      localStorage.setItem('current_company_id', companyId);
    }
  }

  getCurrentTenant(): TenantConfig | null {
    return this.tenantSubject.value;
  }

  isSuperAdmin(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false; // En SSR, no es super admin
    }
    
    const hostname = window.location.hostname;
    return hostname.includes('admin.tudominio') || 
           hostname === 'localhost' || 
           hostname === 'admin.tudominio.local';
  }

  isClientPortal(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false; // En SSR, no es portal de cliente
    }
    
    const hostname = window.location.hostname;
    return hostname.includes('clientes.') || hostname.includes('portal.');
  }
}
