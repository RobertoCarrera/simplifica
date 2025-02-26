import { CommonModule } from '@angular/common';
import { Component, AfterViewInit, Renderer2 } from '@angular/core';
import { Tooltip } from 'bootstrap';

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements AfterViewInit {
  isShrink = false;
  element = 1;
  private tooltips: Tooltip[] = [];

  constructor(private renderer: Renderer2) {}

  ngAfterViewInit(): void {
    this.updateTooltips();
  }

  toggleMenu(): void {
    this.isShrink = !this.isShrink;
    this.updateTooltips();
  }

  activeElement(el: number): void {
    this.element = el;
  }

  private updateTooltips(): void {
    // Destruir tooltips existentes
    this.tooltips.forEach(tooltip => tooltip.dispose());
    this.tooltips = [];

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
