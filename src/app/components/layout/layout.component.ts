import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen bg-gray-100">
      <!-- Sidebar -->
      <div class="w-64 bg-orange-500 shadow-lg">
        <div class="p-6">
          <h1 class="text-white text-2xl font-bold mb-8">Simplifica CRM</h1>
          
          <!-- Navigation Menu -->
          <nav class="space-y-2">
            <a routerLink="/clientes" 
               routerLinkActive="bg-orange-600 border-r-4 border-white"
               class="flex items-center px-4 py-3 text-white hover:bg-orange-600 rounded-l-lg transition-colors duration-200">
               <span class="mr-3">👥</span>
               <span>Clientes</span>
            </a>
            
            <a routerLink="/tickets" 
               routerLinkActive="bg-orange-600 border-r-4 border-white"
               class="flex items-center px-4 py-3 text-white hover:bg-orange-600 rounded-l-lg transition-colors duration-200">
               <span class="mr-3">🎫</span>
               <span>Tickets</span>
            </a>
            
            <a routerLink="/productos" 
               routerLinkActive="bg-orange-600 border-r-4 border-white"
               class="flex items-center px-4 py-3 text-white hover:bg-orange-600 rounded-l-lg transition-colors duration-200">
               <span class="mr-3">📦</span>
               <span>Productos</span>
            </a>
            
            <a routerLink="/trabajos" 
               routerLinkActive="bg-orange-600 border-r-4 border-white"
               class="flex items-center px-4 py-3 text-white hover:bg-orange-600 rounded-l-lg transition-colors duration-200">
               <span class="mr-3">🔧</span>
               <span>Trabajos</span>
            </a>
            
            <!-- Divider -->
            <div class="border-t border-orange-400 my-4"></div>
            
            <!-- Tenant Selection -->
            <div class="px-4 py-2">
              <p class="text-orange-200 text-sm font-medium mb-2">Empresa:</p>
              <div class="space-y-1">
                <a href="/clientes?tenant=satpcgo" 
                   class="block px-3 py-2 text-sm text-white hover:bg-orange-600 rounded">
                   🏢 SatPCGo
                </a>
                <a href="/clientes?tenant=michinanny" 
                   class="block px-3 py-2 text-sm text-white hover:bg-orange-600 rounded">
                   🏢 Michinanny
                </a>
              </div>
            </div>
          </nav>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Top Bar -->
        <header class="bg-white shadow-sm border-b border-gray-200">
          <div class="px-6 py-4">
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-800">{{ getPageTitle() }}</h2>
              <div class="flex items-center space-x-4">
                <span class="text-sm text-gray-600">{{ getCurrentDate() }}</span>
                <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <span class="text-sm font-medium text-gray-600">👤</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <!-- Main Content Area -->
        <main class="flex-1 overflow-auto bg-gray-50">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})
export class LayoutComponent {
  getPageTitle(): string {
    const path = window.location.pathname;
    const titles: {[key: string]: string} = {
      '/clientes': 'Gestión de Clientes',
      '/tickets': 'Tickets de Soporte',
      '/productos': 'Catálogo de Productos',
      '/trabajos': 'Servicios y Trabajos',
      '/setup-db': 'Configuración de Base de Datos'
    };
    
    for (const route in titles) {
      if (path.startsWith(route)) {
        return titles[route];
      }
    }
    
    if (path.includes('/ticket/')) {
      return 'Detalle de Ticket';
    }
    
    return 'CRM Simplifica';
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
