import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AdvancedSearchService } from '../../services/advanced-search.service';
import { ToastService } from '../../services/toast.service';
import { SearchFilter, SearchableItem, SearchSuggestion } from '../../models/search.interface';

@Component({
  selector: 'app-advanced-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div>
        
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-bold text-gray-900 mb-2">🔍 Búsqueda Avanzada</h1>
          <p class="text-gray-600">Motor de búsqueda inteligente con filtros y sugerencias</p>
        </div>

        <!-- Barra de búsqueda principal -->
        <div class="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (input)="onSearchInput($event)"
              (focus)="showSuggestions = true"
              (blur)="hideSuggestions()"
              placeholder="Buscar tickets, clientes, productos, servicios..."
              class="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            
            <!-- Indicador de carga -->
            <div *ngIf="searchService.getIsSearching()" 
                 class="absolute inset-y-0 right-0 pr-4 flex items-center">
              <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            </div>
          </div>

          <!-- Sugerencias -->
          <div *ngIf="showSuggestions && suggestions().length > 0" 
               class="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 max-h-64 overflow-y-auto">
            <div *ngFor="let suggestion of suggestions(); trackBy: trackSuggestion" 
                 (mousedown)="selectSuggestion(suggestion)"
                 class="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center border-b border-gray-100 last:border-b-0">
              <span class="text-lg mr-3">{{ suggestion.icon }}</span>
              <div class="flex-1">
                <div class="text-sm font-medium text-gray-900">{{ suggestion.text }}</div>
                <div class="text-xs text-gray-500">
                  {{ suggestion.type === 'recent' ? 'Búsqueda reciente' : 'Sugerencia' }}
                  <span *ngIf="suggestion.count" class="ml-1">({{ suggestion.count }} resultados)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Filtros activos y disponibles -->
        <div class="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">🔧 Filtros</h3>
          
          <!-- Filtros activos -->
          <div *ngIf="activeFilters().length > 0" class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700">Filtros activos:</span>
              <button (click)="clearAllFilters()" 
                      class="text-xs text-red-600 hover:text-red-800 hover:underline">
                Limpiar todos
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <div *ngFor="let filter of activeFilters()" 
                   class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                <span class="mr-1">{{ filter.icon }}</span>
                {{ filter.label }}: {{ getFilterDisplayValue(filter) }}
                <button (click)="removeFilter(filter.id)" 
                        class="ml-2 text-blue-600 hover:text-blue-800">×</button>
              </div>
            </div>
          </div>

          <!-- Filtros disponibles -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div *ngFor="let filter of availableFilters" class="space-y-2">
              <label class="text-sm font-medium text-gray-700 flex items-center">
                <span class="mr-2">{{ filter.icon }}</span>
                {{ filter.label }}
              </label>
              
              <!-- Filtro de selección -->
              <select *ngIf="filter.type === 'select'" 
                      [value]="getFilterValue(filter.id)"
                      (change)="updateFilter(filter, $event)"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="">{{ filter.placeholder }}</option>
                <option *ngFor="let option of filter.options" [value]="option.value">
                  {{ option.label }}
                  <span *ngIf="option.count">({{ option.count }})</span>
                </option>
              </select>

              <!-- Filtro de texto -->
              <input *ngIf="filter.type === 'text'" 
                     type="text"
                     [value]="getFilterValue(filter.id)"
                     (input)="updateFilter(filter, $event)"
                     [placeholder]="filter.placeholder"
                     class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">

              <!-- Filtro de fecha -->
              <input *ngIf="filter.type === 'date'" 
                     type="date"
                     [value]="getFilterValue(filter.id)"
                     (change)="updateFilter(filter, $event)"
                     class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            </div>
          </div>
        </div>

        <!-- Resultados de búsqueda -->
        <div class="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">
              📊 Resultados de búsqueda
              <span class="text-sm font-normal text-gray-500 ml-2">
                ({{ searchResults().length }} elementos encontrados)
              </span>
            </h3>
            
            <!-- Opciones de guardar búsqueda -->
            <div *ngIf="searchQuery().length > 0" class="flex items-center space-x-2">
              <button (click)="showSaveDialog = true" 
                      class="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors">
                💾 Guardar búsqueda
              </button>
            </div>
          </div>

          <!-- Lista de resultados -->
          <div *ngIf="searchResults().length > 0" class="space-y-4">
            <div *ngFor="let result of searchResults(); trackBy: trackResult" 
                 class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                 (click)="openResult(result.item)">
              
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center space-x-2 mb-2">
                    <span class="px-2 py-1 text-xs font-medium rounded-full"
                          [ngClass]="getCategoryClass(result.item.category)">
                      {{ getCategoryLabel(result.item.category) }}
                    </span>
                    <span *ngIf="result.item.priority" 
                          class="px-2 py-1 text-xs font-medium rounded-full"
                          [ngClass]="getPriorityClass(result.item.priority)">
                      {{ result.item.priority }}
                    </span>
                  </div>
                  
                  <h4 class="text-lg font-medium text-gray-900 mb-1" 
                      [innerHTML]="highlightText(result.item.title)">
                  </h4>
                  
                  <p class="text-gray-600 mb-2" 
                     [innerHTML]="highlightText(result.item.description || '')">
                  </p>
                  
                  <div class="flex items-center space-x-4 text-sm text-gray-500">
                    <span>📅 {{ formatDate(result.item.date) }}</span>
                    <span>🔄 {{ result.item.status }}</span>
                    <span *ngIf="result.score" class="text-blue-600">
                      🎯 {{ (1 - result.score) * 100 | number:'1.0-0' }}% coincidencia
                    </span>
                  </div>
                </div>
                
                <div class="text-right">
                  <div *ngIf="result.item.metadata?.costo" class="text-lg font-semibold text-green-600">
                    €{{ result.item.metadata.costo }}
                  </div>
                  <div *ngIf="result.item.metadata?.cliente" class="text-sm text-gray-500">
                    👤 {{ result.item.metadata.cliente }}
                  </div>
                </div>
              </div>

              <!-- Tags -->
              <div class="mt-3 flex flex-wrap gap-1">
                <span *ngFor="let tag of result.item.tags" 
                      class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-md"
                      [innerHTML]="highlightText(tag)">
                </span>
              </div>
            </div>
          </div>

          <!-- Estado vacío -->
          <div *ngIf="searchResults().length === 0 && searchQuery().length > 0" 
               class="text-center py-12">
            <div class="text-6xl mb-4">🔍</div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">No se encontraron resultados</h3>
            <p class="text-gray-500 mb-4">
              Intenta con otros términos de búsqueda o ajusta los filtros
            </p>
            <button (click)="clearSearch()" 
                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              Limpiar búsqueda
            </button>
          </div>

          <!-- Estado inicial -->
          <div *ngIf="searchResults().length === 0 && searchQuery().length === 0" 
               class="text-center py-12">
            <div class="text-6xl mb-4">🚀</div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">Comienza a buscar</h3>
            <p class="text-gray-500">
              Usa la barra de búsqueda para encontrar tickets, clientes, productos y servicios
            </p>
          </div>
        </div>

        <!-- Panel lateral: Historial y búsquedas guardadas -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <!-- Historial de búsquedas -->
          <div class="bg-white rounded-xl shadow-lg p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-900">🕒 Historial</h3>
              <button *ngIf="searchHistory().length > 0" 
                      (click)="clearHistory()" 
                      class="text-sm text-red-600 hover:text-red-800 hover:underline">
                Limpiar
              </button>
            </div>
            
            <div *ngIf="searchHistory().length > 0" class="space-y-2 max-h-64 overflow-y-auto">
              <div *ngFor="let history of searchHistory().slice(0, 10)" 
                   (click)="loadHistorySearch(history)"
                   class="p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-900">{{ history.query }}</span>
                  <span class="text-xs text-gray-500">{{ history.resultCount }} resultados</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ formatDate(history.timestamp) }} • {{ history.executionTime }}ms
                </div>
              </div>
            </div>
            
            <div *ngIf="searchHistory().length === 0" class="text-center py-6 text-gray-500">
              No hay búsquedas recientes
            </div>
          </div>

          <!-- Búsquedas guardadas -->
          <div class="bg-white rounded-xl shadow-lg p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">💾 Búsquedas Guardadas</h3>
            
            <div *ngIf="savedSearches().length > 0" class="space-y-2 max-h-64 overflow-y-auto">
              <div *ngFor="let saved of savedSearches()" 
                   class="p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-medium text-gray-900">{{ saved.name }}</span>
                      <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {{ saved.useCount }} usos
                      </span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">{{ saved.query }}</div>
                  </div>
                  <div class="flex items-center space-x-1">
                    <button (click)="loadSavedSearch(saved.id)" 
                            class="p-1 text-blue-600 hover:text-blue-800">
                      📂
                    </button>
                    <button (click)="deleteSavedSearch(saved.id)" 
                            class="p-1 text-red-600 hover:text-red-800">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div *ngIf="savedSearches().length === 0" class="text-center py-6 text-gray-500">
              No hay búsquedas guardadas
            </div>
          </div>
        </div>

        <!-- Modal para guardar búsqueda -->
        <div *ngIf="showSaveDialog" 
             class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">💾 Guardar Búsqueda</h3>
            <input type="text" 
                   [(ngModel)]="saveSearchName"
                   placeholder="Nombre de la búsqueda..."
                   class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4">
            <div class="flex justify-end space-x-2">
              <button (click)="showSaveDialog = false" 
                      class="px-4 py-2 text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button (click)="saveCurrentSearch()" 
                      [disabled]="!saveSearchName.trim()"
                      class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrl: './advanced-search.component.scss'
})
export class AdvancedSearchComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  public searchService = inject(AdvancedSearchService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  // Estados del componente
  searchQuery = signal<string>('');
  showSuggestions = false;
  showSaveDialog = false;
  saveSearchName = '';

  // Computed properties del servicio
  searchResults = this.searchService.getSearchResults;
  activeFilters = this.searchService.getActiveFilters;
  searchHistory = this.searchService.getSearchHistory;
  savedSearches = this.searchService.getSavedSearches;
  suggestions = this.searchService.getSuggestions;

  // Filtros disponibles
  availableFilters = this.searchService.getAvailableFilters();

  ngOnInit() {
    this.toastService.success(
      'Búsqueda Avanzada',
      'Motor de búsqueda inteligente activado'
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.searchService.persistData();
  }

  onSearchInput(event: any) {
    const query = event.target.value;
    this.searchQuery.set(query);
    this.searchService.search(query);
  }

  selectSuggestion(suggestion: SearchSuggestion) {
    this.searchQuery.set(suggestion.text);
    this.searchService.searchImmediate(suggestion.text);
    this.showSuggestions = false;
  }

  hideSuggestions() {
    // Pequeño delay para permitir clicks en sugerencias
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  updateFilter(filter: SearchFilter, event: any) {
    const value = event.target ? event.target.value : event;
    if (value) {
      const updatedFilter = { ...filter, value };
      this.searchService.addFilter(updatedFilter);
    } else {
      this.searchService.removeFilter(filter.id);
    }
  }

  removeFilter(filterId: string) {
    this.searchService.removeFilter(filterId);
  }

  clearAllFilters() {
    this.searchService.clearFilters();
  }

  getFilterValue(filterId: string): any {
    const filter = this.activeFilters().find(f => f.id === filterId);
    return filter ? filter.value : '';
  }

  getFilterDisplayValue(filter: SearchFilter): string {
    if (filter.type === 'select' && filter.options) {
      const option = filter.options.find(opt => opt.value === filter.value);
      return option ? option.label : filter.value;
    }
    return filter.value;
  }

  openResult(item: SearchableItem) {
    // Navegar al detalle según el tipo
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
        console.log('Abrir:', item);
    }
  }

  clearSearch() {
    this.searchQuery.set('');
    this.searchService.search('');
    this.searchService.clearFilters();
  }

  clearHistory() {
    this.searchService.clearHistory();
    this.toastService.success('Historial', 'Historial de búsquedas limpiado');
  }

  loadHistorySearch(history: any) {
    this.searchQuery.set(history.query);
    this.searchService.searchImmediate(history.query);
  }

  saveCurrentSearch() {
    if (this.saveSearchName.trim()) {
      this.searchService.saveSearch(this.saveSearchName.trim());
      this.toastService.success('Búsqueda Guardada', `"${this.saveSearchName}" guardada exitosamente`);
      this.showSaveDialog = false;
      this.saveSearchName = '';
    }
  }

  loadSavedSearch(searchId: string) {
    this.searchService.loadSavedSearch(searchId);
    const saved = this.savedSearches().find(s => s.id === searchId);
    if (saved) {
      this.searchQuery.set(saved.query);
    }
  }

  deleteSavedSearch(searchId: string) {
    this.searchService.deleteSavedSearch(searchId);
    this.toastService.success('Búsqueda Eliminada', 'Búsqueda guardada eliminada');
  }

  highlightText(text: string): string {
    return this.searchService.highlightMatches(text, this.searchQuery());
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
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
      'tickets': '🎫 Ticket',
      'customers': '👤 Cliente',
      'products': '📦 Producto',
      'services': '🔧 Servicio'
    };
    return labels[category as keyof typeof labels] || category;
  }

  getPriorityClass(priority: string): string {
    const classes = {
      'high': 'bg-red-100 text-red-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'low': 'bg-green-100 text-green-800'
    };
    return classes[priority as keyof typeof classes] || 'bg-gray-100 text-gray-800';
  }

  trackResult(index: number, result: any): any {
    return result.item.id;
  }

  trackSuggestion(index: number, suggestion: SearchSuggestion): any {
    return suggestion.text;
  }
}
