import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdvancedSearchService } from '../../../services/advanced-search.service';

@Component({
  selector: 'app-quick-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative">
      <!-- Barra de búsqueda rápida -->
      <div class="relative">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        
        <input
          type="text"
          [(ngModel)]="quickQuery"
          (input)="onQuickSearch()"
          (focus)="showQuickResults = true"
          (blur)="hideQuickResults()"
          (keydown.enter)="goToAdvancedSearch()"
          placeholder="Búsqueda rápida..."
          class="w-64 pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
        
        <!-- Icono de carga -->
        <div *ngIf="searchService.getIsSearching()" 
             class="absolute inset-y-0 right-0 pr-3 flex items-center">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
      </div>

      <!-- Resultados rápidos -->
      <div *ngIf="showQuickResults && (quickResults().length > 0 || quickQuery.length > 0)" 
           class="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-80 overflow-y-auto">
        
        <!-- Resultados -->
        <div *ngIf="quickResults().length > 0">
          <div class="px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b">
            Resultados rápidos ({{ quickResults().length }})
          </div>
          
          <div *ngFor="let result of quickResults().slice(0, 5); trackBy: trackResult" 
               (mousedown)="selectQuickResult(result.item)"
               class="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
            
            <div class="flex items-center space-x-3">
              <div class="flex-shrink-0">
                <span class="text-lg">{{ getCategoryIcon(result.item.category) }}</span>
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center space-x-2">
                  <span class="text-sm font-medium text-gray-900 truncate">
                    {{ result.item.title }}
                  </span>
                  <span class="px-2 py-1 text-xs rounded-full"
                        [ngClass]="getCategoryClass(result.item.category)">
                    {{ getCategoryLabel(result.item.category) }}
                  </span>
                </div>
                
                <p *ngIf="result.item.description" 
                   class="text-xs text-gray-500 truncate mt-1">
                  {{ result.item.description }}
                </p>
                
                <div class="flex items-center space-x-2 mt-1">
                  <span class="text-xs text-gray-400">{{ result.item.status }}</span>
                  <span *ngIf="result.score" class="text-xs text-blue-600">
                    {{ (1 - result.score) * 100 | number:'1.0-0' }}% match
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Ver todos los resultados -->
          <div class="px-4 py-3 border-t bg-gray-50">
            <button (click)="goToAdvancedSearch()" 
                    class="w-full text-sm text-blue-600 hover:text-blue-800 font-medium">
              Ver todos los resultados en búsqueda avanzada →
            </button>
          </div>
        </div>

        <!-- Sin resultados -->
        <div *ngIf="quickResults().length === 0 && quickQuery.length > 0 && !searchService.getIsSearching()" 
             class="px-4 py-6 text-center">
          <div class="text-gray-400 mb-2">🔍</div>
          <p class="text-sm text-gray-500 mb-3">No se encontraron resultados</p>
          <button (click)="goToAdvancedSearch()" 
                  class="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Probar en búsqueda avanzada
          </button>
        </div>

        <!-- Estado inicial -->
        <div *ngIf="quickQuery.length === 0" 
             class="px-4 py-6 text-center">
          <div class="text-gray-400 mb-2">⚡</div>
          <p class="text-sm text-gray-500 mb-3">Búsqueda rápida</p>
          <p class="text-xs text-gray-400">
            Escribe para buscar tickets, clientes, productos...
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      position: relative;
      z-index: 100;
    }
  `]
})
export class QuickSearchComponent implements OnInit {
  public searchService = inject(AdvancedSearchService);
  private router = inject(Router);

  quickQuery = signal<string>('');
  showQuickResults = false;

  // Computed para resultados rápidos
  quickResults = this.searchService.getSearchResults;

  ngOnInit() {
    // Sincronizar con el servicio
    this.searchService.search('');
  }

  onQuickSearch() {
    const query = this.quickQuery();
    if (query.length >= 2) {
      this.searchService.search(query);
    } else {
      this.searchService.search('');
    }
  }

  selectQuickResult(item: any) {
    this.hideQuickResults();
    this.quickQuery.set('');

    // Navegar al detalle
    switch (item.category) {
      case 'tickets':
        this.router.navigate(['/ticket', item.id]);
        break;
      case 'customers':
        this.router.navigate(['/clientes']);
        break;
      case 'products':
        this.router.navigate(['/productos']);
        break;
      default:
        this.router.navigate(['/search'], {
          queryParams: { q: item.title }
        });
    }
  }

  goToAdvancedSearch() {
    this.hideQuickResults();
    this.router.navigate(['/search'], {
      queryParams: { q: this.quickQuery() }
    });
    this.quickQuery.set('');
  }

  hideQuickResults() {
    setTimeout(() => {
      this.showQuickResults = false;
    }, 200);
  }

  getCategoryIcon(category: string): string {
    const icons = {
      'tickets': '🎫',
      'customers': '👤',
      'products': '📦',
      'services': '🔧'
    };
    return icons[category as keyof typeof icons] || '📄';
  }

  getCategoryClass(category: string): string {
    const classes = {
      'tickets': 'bg-blue-100 text-blue-800',
      'customers': 'bg-green-100 text-green-800',
      'products': 'bg-purple-100 text-purple-800',
      'services': 'bg-orange-100 text-orange-800'
    };
    return classes[category as keyof typeof classes] || 'bg-gray-100 text-gray-800';
  }

  getCategoryLabel(category: string): string {
    const labels = {
      'tickets': 'Ticket',
      'customers': 'Cliente',
      'products': 'Producto',
      'services': 'Servicio'
    };
    return labels[category as keyof typeof labels] || category;
  }

  trackResult(index: number, result: any): any {
    return result.item.id;
  }
}
