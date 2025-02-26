import { Component, AfterViewInit, Renderer2, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarService } from '../../services/sidebar.service';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements AfterViewInit {
  isShrink = false;
  element = 1;
  private tooltips: any[] = [];

  constructor(
    private sidebarService: SidebarService,
    private renderer: Renderer2,
    @Inject(PLATFORM_ID) private platformId: Object) {}

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