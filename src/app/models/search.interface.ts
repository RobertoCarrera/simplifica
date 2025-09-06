// Interfaces para el sistema de búsqueda avanzada
export interface SearchFilter {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number' | 'boolean' | 'range';
  options?: SearchFilterOption[];
  value?: any;
  placeholder?: string;
  icon?: string;
}

export interface SearchFilterOption {
  value: any;
  label: string;
  count?: number;
  color?: string;
}

export interface SearchConfig {
  placeholder: string;
  threshold: number; // Sensibilidad de búsqueda fuzzy (0.0 = exacto, 1.0 = cualquier cosa)
  keys: string[]; // Campos a buscar
  includeScore: boolean;
  shouldSort: boolean;
  minMatchCharLength: number;
}

export interface SearchResult<T = any> {
  item: T;
  score?: number;
  matches?: SearchMatch[];
  refIndex: number;
}

export interface SearchMatch {
  indices: number[][];
  value: string;
  key: string;
}

export interface SearchableItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  date: Date;
  status: string;
  priority?: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilter[];
  userId: string;
  isPublic: boolean;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
}

export interface SearchSuggestion {
  text: string;
  type: 'query' | 'filter' | 'recent' | 'popular';
  count?: number;
  icon?: string;
}

export interface SearchHistory {
  id: string;
  query: string;
  filters: SearchFilter[];
  resultCount: number;
  timestamp: Date;
  executionTime: number; // en millisegundos
}

export interface AdvancedSearchOptions {
  enableFuzzySearch: boolean;
  enableAutoComplete: boolean;
  enableSearchHistory: boolean;
  enableSavedSearches: boolean;
  maxHistoryItems: number;
  debounceTime: number; // tiempo de espera para búsqueda en tiempo real
  highlightMatches: boolean;
}
