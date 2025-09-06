import { Component, AfterViewInit, Renderer2, Inject, PLATFORM_ID, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarService } from '../../services/sidebar.service';
import { TenantService, TenantConfig } from '../../services/tenant.service';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements AfterViewInit, OnInit {
  isShrink = false;
  element = 1;
  private tooltips: any[] = [];
  currentTenant: TenantConfig | null = null;
  isSuperAdmin: boolean = false;

  constructor(
    private sidebarService: SidebarService,
    private tenantService: TenantService,
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    // Suscribirse a cambios de tenant
    this.tenantService.tenant$.subscribe(tenant => {
      this.currentTenant = tenant;
      console.log('🏢 Sidebar loaded for tenant:', tenant?.name);
    });

    this.isSuperAdmin = this.tenantService.isSuperAdmin();
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.updateTooltips();
    }
  }

  toggleMenu(): void {
    this.isShrink = !this.isShrink;
    this.sidebarService.toggleSidebar(this.isShrink);
    if (isPlatformBrowser(this.platformId)) {
      this.updateTooltips();
    }
  }

  activeElement(el: number): void {
    this.element = el;
  }

  // Verificar si un módulo está permitido para el tenant actual
  isModuleAllowed(module: keyof TenantConfig['allowedModules']): boolean {
    if (this.isSuperAdmin) return true;
    return this.currentTenant?.allowedModules[module] || false;
  }

  private async updateTooltips(): Promise<void> {
    // Destruir tooltips existentes
    this.tooltips.forEach(tooltip => tooltip.dispose());
    this.tooltips = [];

    // Importar dinámicamente Bootstrap solo en el navegador
    if (isPlatformBrowser(this.platformId)) {
      const { Tooltip } = await import('bootstrap');

      // Seleccionar todos los elementos con el atributo 'data-bs-toggle'
      const tooltipElements = document.querySelectorAll('[data-bs-toggle="tooltip"]');

      tooltipElements.forEach(el => {
        if (this.isShrink) {
          // Si isShrink es true, inicializar el tooltip
          const tooltip = new Tooltip(el);
          this.tooltips.push(tooltip);
        } else {
          // Si isShrink es false, eliminar los atributos relacionados con el tooltip
          this.renderer.removeAttribute(el, 'data-bs-original-title');
          this.renderer.removeAttribute(el, 'title');
        }
      });
    }
  }
}