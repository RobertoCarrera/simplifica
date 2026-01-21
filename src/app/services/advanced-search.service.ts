import { Injectable, signal, computed } from '@angular/core';
import { debounceTime, distinctUntilChanged, BehaviorSubject, Observable } from 'rxjs';
import Fuse from 'fuse.js';
import { 
  SearchFilter, 
  SearchConfig, 
  SearchResult, 
  SearchableItem, 
  SavedSearch, 
  SearchSuggestion,
  SearchHistory,
  AdvancedSearchOptions
} from '../models/search.interface';

@Injectable({
  providedIn: 'root'
})
export class AdvancedSearchService {
  // Estado de búsqueda con signals
  private searchQuery = signal<string>('');
  private activeFilters = signal<SearchFilter[]>([]);
  private searchResults = signal<SearchResult[]>([]);
  private isSearching = signal<boolean>(false);
  private searchHistory = signal<SearchHistory[]>([]);
  private savedSearches = signal<SavedSearch[]>([]);
  private suggestions = signal<SearchSuggestion[]>([]);

  // Configuración por defecto
  private defaultConfig: SearchConfig = {
    placeholder: 'Buscar en todos los contenidos...',
    threshold: 0.3,
    keys: ['title', 'description', 'tags', 'category'],
    includeScore: true,
    shouldSort: true,
    minMatchCharLength: 2
  };

  private options: AdvancedSearchOptions = {
    enableFuzzySearch: true,
    enableAutoComplete: true,
    enableSearchHistory: true,
    enableSavedSearches: true,
    maxHistoryItems: 50,
    debounceTime: 300,
    highlightMatches: true
  };

  // Datos de ejemplo para demostración
  private mockData: SearchableItem[] = [
    {
      id: '1',
      title: 'Reparación laptop Dell Inspiron',
      description: 'Laptop con pantalla rota y teclado defectuoso',
      category: 'tickets',
      tags: ['laptop', 'dell', 'pantalla', 'teclado', 'reparación'],
      date: new Date('2025-09-01'),
      status: 'pending',
      priority: 'high',
      metadata: { cliente: 'TechCorp', costo: 450 }
    },
    {
      id: '2',
      title: 'Mantenimiento servidor HP ProLiant',
      description: 'Mantenimiento preventivo de servidor de base de datos',
      category: 'tickets',
      tags: ['servidor', 'hp', 'mantenimiento', 'base-datos'],
      date: new Date('2025-09-02'),
      status: 'in-progress',
      priority: 'medium',
      metadata: { cliente: 'DataSoft', costo: 800 }
    },
    {
      id: '3',
      title: 'Cliente: TechCorp Solutions',
      description: 'Empresa de tecnología especializada en software empresarial',
      category: 'customers',
      tags: ['empresa', 'tecnología', 'software', 'b2b'],
      date: new Date('2025-08-15'),
      status: 'active',
      metadata: { contacto: 'Juan Pérez', telefono: '+34 123 456 789' }
    },
    {
      id: '4',
      title: 'Producto: Memoria RAM DDR4 16GB',
      description: 'Memoria RAM de alta velocidad para equipos gaming y profesionales',
      category: 'products',
      tags: ['memoria', 'ram', 'ddr4', '16gb', 'gaming', 'profesional'],
      date: new Date('2025-08-20'),
      status: 'available',
      metadata: { precio: 89.99, stock: 25 }
    },
    {
      id: '5',
      title: 'Instalación sistema Windows 11',
      description: 'Formateo completo e instalación de Windows 11 Pro',
      category: 'services',
      tags: ['windows', 'instalación', 'formateo', 'sistema-operativo'],
      date: new Date('2025-09-03'),
      status: 'completed',
      priority: 'low',
      metadata: { duracion: '2 horas', costo: 75 }
    },
    {
      id: '6',
      title: 'Cliente: InnovaTech Labs',
      description: 'Laboratorio de innovación tecnológica y desarrollo I+D',
      category: 'customers',
      tags: ['laboratorio', 'innovación', 'desarrollo', 'investigación'],
      date: new Date('2025-08-28'),
      status: 'active',
      metadata: { contacto: 'María García', email: 'maria@innovatech.com' }
    }
  ];

  private fuse: Fuse<SearchableItem>;
  private searchSubject = new BehaviorSubject<string>('');

  constructor() {
    // Inicializar Fuse.js
    this.fuse = new Fuse(this.mockData, this.defaultConfig);
    
    // Configurar búsqueda en tiempo real con debounce
    this.searchSubject.pipe(
      debounceTime(this.options.debounceTime),
      distinctUntilChanged()
    ).subscribe(query => {
      this.performSearch(query);
    });

    // Cargar datos iniciales
    this.loadInitialData();
  }

  // Getters para acceder a los signals
  getSearchQuery = computed(() => this.searchQuery());
  getActiveFilters = computed(() => this.activeFilters());
  getSearchResults = computed(() => this.searchResults());
  getIsSearching = computed(() => this.isSearching());
  getSearchHistory = computed(() => this.searchHistory());
  getSavedSearches = computed(() => this.savedSearches());
  getSuggestions = computed(() => this.suggestions());

  // Método principal de búsqueda
  search(query: string): void {
    this.searchQuery.set(query);
    this.searchSubject.next(query);
  }

  // Búsqueda inmediata (sin debounce)
  searchImmediate(query: string): void {
    this.searchQuery.set(query);
    this.performSearch(query);
  }

  private performSearch(query: string): void {
    const startTime = performance.now();
    this.isSearching.set(true);

    try {
      let results: SearchResult[] = [];

      if (query.length >= this.defaultConfig.minMatchCharLength) {
        // Realizar búsqueda fuzzy
        const fuseResults = this.fuse.search(query);
        results = fuseResults.map(result => ({
          item: result.item,
          score: result.score,
          matches: result.matches as any, // Casting temporal para compatibilidad
          refIndex: result.refIndex
        }));

        // Aplicar filtros activos
        results = this.applyFilters(results);
      } else if (query.length === 0) {
        // Si no hay query, mostrar todos los elementos
        results = this.mockData.map((item, index) => ({
          item,
          refIndex: index
        }));
      }

      this.searchResults.set(results);

      // Registrar en historial si la búsqueda no está vacía
      if (query.trim().length > 0) {
        this.addToHistory(query, results.length, performance.now() - startTime);
      }

      // Generar sugerencias
      this.generateSuggestions(query);

    } catch (error) {
      console.error('Error en búsqueda:', error);
      this.searchResults.set([]);
    } finally {
      this.isSearching.set(false);
    }
  }

  // Aplicar filtros activos a los resultados
  private applyFilters(results: SearchResult[]): SearchResult[] {
    const filters = this.activeFilters();
    
    return results.filter(result => {
      return filters.every(filter => {
        switch (filter.type) {
          case 'select':
            return !filter.value || result.item.category === filter.value;
          case 'date':
            // Implementar filtro de fecha
            return true;
          case 'boolean':
            return !filter.value || result.item.status === 'active';
          default:
            return true;
        }
      });
    });
  }

  // Gestión de filtros
  addFilter(filter: SearchFilter): void {
    const current = this.activeFilters();
    const existing = current.findIndex(f => f.id === filter.id);
    
    if (existing >= 0) {
      current[existing] = filter;
      this.activeFilters.set([...current]);
    } else {
      this.activeFilters.set([...current, filter]);
    }
    
    // Re-ejecutar búsqueda con nuevos filtros
    this.performSearch(this.searchQuery());
  }

  removeFilter(filterId: string): void {
    const current = this.activeFilters();
    this.activeFilters.set(current.filter(f => f.id !== filterId));
    this.performSearch(this.searchQuery());
  }

  clearFilters(): void {
    this.activeFilters.set([]);
    this.performSearch(this.searchQuery());
  }

  // Filtros disponibles
  getAvailableFilters(): SearchFilter[] {
    return [
      {
        id: 'category',
        label: 'Categoría',
        type: 'select',
        placeholder: 'Seleccionar categoría',
        icon: '📁',
        options: [
          { value: 'tickets', label: 'Tickets', count: 3 },
          { value: 'customers', label: 'Clientes', count: 2 },
          { value: 'products', label: 'Productos', count: 1 },
          { value: 'services', label: 'Servicios', count: 1 }
        ]
      },
      {
        id: 'status',
        label: 'Estado',
        type: 'select',
        placeholder: 'Seleccionar estado',
        icon: '🔄',
        options: [
          { value: 'pending', label: 'Pendiente', count: 1, color: '#f59e0b' },
          { value: 'in-progress', label: 'En Progreso', count: 1, color: '#3b82f6' },
          { value: 'completed', label: 'Completado', count: 1, color: '#10b981' },
          { value: 'active', label: 'Activo', count: 2, color: '#06b6d4' }
        ]
      },
      {
        id: 'priority',
        label: 'Prioridad',
        type: 'select',
        placeholder: 'Seleccionar prioridad',
        icon: '⚡',
        options: [
          { value: 'high', label: 'Alta', count: 1, color: '#ef4444' },
          { value: 'medium', label: 'Media', count: 1, color: '#f59e0b' },
          { value: 'low', label: 'Baja', count: 1, color: '#10b981' }
        ]
      },
      {
        id: 'dateRange',
        label: 'Fecha',
        type: 'date',
        placeholder: 'Seleccionar rango de fechas',
        icon: '📅'
      }
    ];
  }

  // Gestión de historial
  private addToHistory(query: string, resultCount: number, executionTime: number): void {
    if (!this.options.enableSearchHistory) return;

    const historyItem: SearchHistory = {
      id: Date.now().toString(),
      query,
      filters: [...this.activeFilters()],
      resultCount,
      timestamp: new Date(),
      executionTime: Math.round(executionTime)
    };

    const current = this.searchHistory();
    const updated = [historyItem, ...current.slice(0, this.options.maxHistoryItems - 1)];
    this.searchHistory.set(updated);
  }

  clearHistory(): void {
    this.searchHistory.set([]);
  }

  // Gestión de búsquedas guardadas
  saveSearch(name: string): void {
    if (!this.options.enableSavedSearches) return;

    const savedSearch: SavedSearch = {
      id: Date.now().toString(),
      name,
      query: this.searchQuery(),
      filters: [...this.activeFilters()],
      userId: 'current-user', // En una app real vendría del auth
      isPublic: false,
      createdAt: new Date(),
      lastUsed: new Date(),
      useCount: 1
    };

    const current = this.savedSearches();
    this.savedSearches.set([...current, savedSearch]);
  }

  loadSavedSearch(searchId: string): void {
    const saved = this.savedSearches().find(s => s.id === searchId);
    if (saved) {
      this.searchQuery.set(saved.query);
      this.activeFilters.set([...saved.filters]);
      this.performSearch(saved.query);
      
      // Actualizar estadísticas de uso
      saved.lastUsed = new Date();
      saved.useCount++;
    }
  }

  deleteSavedSearch(searchId: string): void {
    const current = this.savedSearches();
    this.savedSearches.set(current.filter(s => s.id !== searchId));
  }

  // Generar sugerencias
  private generateSuggestions(query: string): void {
    if (!this.options.enableAutoComplete || query.length < 2) {
      this.suggestions.set([]);
      return;
    }

    const suggestions: SearchSuggestion[] = [];

    // Sugerencias basadas en tags populares
    const popularTags = ['laptop', 'servidor', 'windows', 'reparación', 'mantenimiento'];
    popularTags
      .filter(tag => tag.toLowerCase().includes(query.toLowerCase()))
      .forEach(tag => {
        suggestions.push({
          text: tag,
          type: 'query',
          icon: '🏷️',
          count: Math.floor(Math.random() * 10) + 1
        });
      });

    // Sugerencias de historial reciente
    this.searchHistory()
      .filter(h => h.query.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3)
      .forEach(history => {
        suggestions.push({
          text: history.query,
          type: 'recent',
          icon: '🕒',
          count: history.resultCount
        });
      });

    this.suggestions.set(suggestions.slice(0, 8));
  }

  // Resaltar coincidencias en el texto
  highlightMatches(text: string, query: string): string {
    if (!this.options.highlightMatches || !query.trim()) {
      // Escape HTML even if not highlighting to ensure consistency and safety
      // when the output is bound to [innerHTML]
      return this.escapeHtml(text);
    }

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

    // Split text by query (capturing the separator due to parentheses in regex)
    // "Text Match Text".split(/(Match)/) -> ["Text ", "Match", " Text"]
    const parts = text.split(regex);

    return parts.map((part, index) => {
      // Odd indices are the captured matches from the regex
      if (index % 2 === 1) {
        return `<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">${this.escapeHtml(part)}</mark>`;
      }
      return this.escapeHtml(part);
    }).join('');
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Estadísticas de búsqueda
  getSearchStats() {
    const history = this.searchHistory();
    const avgExecutionTime = history.length > 0 
      ? history.reduce((sum, h) => sum + h.executionTime, 0) / history.length 
      : 0;

    return {
      totalSearches: history.length,
      avgExecutionTime: Math.round(avgExecutionTime),
      avgResultsPerSearch: history.length > 0
        ? Math.round(history.reduce((sum, h) => sum + h.resultCount, 0) / history.length)
        : 0,
      mostPopularQueries: this.getMostPopularQueries()
    };
  }

  private getMostPopularQueries(): { query: string; count: number }[] {
    const queryCount = new Map<string, number>();
    
    this.searchHistory().forEach(h => {
      const current = queryCount.get(h.query) || 0;
      queryCount.set(h.query, current + 1);
    });

    return Array.from(queryCount.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private loadInitialData(): void {
    // Simular datos guardados del localStorage
    const savedHistory = localStorage.getItem('simplifica_search_history');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        this.searchHistory.set(history);
      } catch (error) {
        console.warn('Error cargando historial de búsqueda:', error);
      }
    }

    const savedSearches = localStorage.getItem('simplifica_saved_searches');
    if (savedSearches) {
      try {
        const searches = JSON.parse(savedSearches);
        this.savedSearches.set(searches);
      } catch (error) {
        console.warn('Error cargando búsquedas guardadas:', error);
      }
    }
  }

  // Persistir datos en localStorage
  persistData(): void {
    try {
      localStorage.setItem('simplifica_search_history', JSON.stringify(this.searchHistory()));
      localStorage.setItem('simplifica_saved_searches', JSON.stringify(this.savedSearches()));
    } catch (error) {
      console.warn('Error guardando datos de búsqueda:', error);
    }
  }
}
