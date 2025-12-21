import { Component, Input, Output, EventEmitter, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableColumn, TableAction, SortEvent, FilterEvent, PaginationEvent } from './data-table.interface';
import { AnimationService } from '../../../services/animation.service';

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  animations: [AnimationService.fadeInUp, AnimationService.staggerList],
  template: `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden" @fadeInUp>
      <!-- Header with search and actions -->
      <div class="p-6 border-b border-gray-200 dark:border-gray-700">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="flex-1">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ title }}</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ subtitle }}</p>
          </div>
          
          <!-- Search -->
          <div class="flex-shrink-0 w-full sm:w-80">
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
              <input
                type="text"
                [(ngModel)]="searchTerm"
                (input)="onSearch()"
                placeholder="Buscar..."
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
            </div>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <!-- Headers -->
          <thead class="bg-gray-50 dark:bg-gray-900">
            <tr @staggerList>
              @for (column of columns; track column.key) {
                <th 
                  scope="col"
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  [style.width]="column.width"
                  (click)="onSort(column.key)">
                  <div class="flex items-center space-x-1">
                    <span>{{ column.label }}</span>
                    @if (column.sortable !== false) {
                      <div class="flex flex-col">
                        <svg 
                          class="w-3 h-3 transition-colors" 
                          [class.text-indigo-600]="currentSort().column === column.key && currentSort().direction === 'asc'"
                          [class.text-gray-400]="currentSort().column !== column.key || currentSort().direction !== 'asc'"
                          fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/>
                        </svg>
                        <svg 
                          class="w-3 h-3 -mt-1 transition-colors" 
                          [class.text-indigo-600]="currentSort().column === column.key && currentSort().direction === 'desc'"
                          [class.text-gray-400]="currentSort().column !== column.key || currentSort().direction !== 'desc'"
                          fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
                        </svg>
                      </div>
                    }
                  </div>
                </th>
              }
              @if (actions && actions.length > 0) {
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              }
            </tr>
          </thead>

          <!-- Body -->
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            @if (loading()) {
              <tr>
                <td [attr.colspan]="columns.length + (actions && actions.length ? 1 : 0)" class="px-6 py-12 text-center">
                  <div class="flex flex-col items-center space-y-3">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">Cargando datos...</span>
                  </div>
                </td>
              </tr>
            } @else if (paginatedData().length === 0) {
              <tr>
                <td [attr.colspan]="columns.length + (actions && actions.length ? 1 : 0)" class="px-6 py-12 text-center">
                  <div class="flex flex-col items-center space-y-3">
                    <svg class="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <span class="text-sm text-gray-500 dark:text-gray-400">No se encontraron datos</span>
                  </div>
                </td>
              </tr>
            } @else {
              @for (row of paginatedData(); track getRowId(row, $index)) {
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  @for (column of columns; track column.key) {
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      @switch (column.type) {
                        @case ('status') {
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                [ngClass]="getStatusClasses(getCellValue(row, column.key))">
                            {{ formatCellValue(row, column) }}
                          </span>
                        }
                        @case ('currency') {
                          <span class="text-gray-900 dark:text-white font-medium">
                            {{ formatCellValue(row, column) }}
                          </span>
                        }
                        @case ('date') {
                          <span class="text-gray-500 dark:text-gray-400">
                            {{ formatCellValue(row, column) }}
                          </span>
                        }
                        @default {
                          <span class="text-gray-900 dark:text-white">
                            {{ formatCellValue(row, column) }}
                          </span>
                        }
                      }
                    </td>
                  }
                  @if (actions && actions.length > 0) {
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div class="flex items-center justify-end space-x-2">
                        @for (action of getVisibleActions(row); track action.label) {
                          <button
                            (click)="action.onClick(row)"
                            class="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
                            [ngClass]="getActionClasses(action.color || 'primary')">
                            @if (action.icon) {
                              <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <!-- Icons will be dynamic based on action.icon -->
                              </svg>
                            }
                            {{ action.label }}
                          </button>
                        }
                      </div>
                    </td>
                  }
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      @if (totalPages() > 1) {
        <div class="bg-white dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-gray-700 sm:px-6">
          <div class="flex items-center justify-between">
            <div class="flex-1 flex justify-between sm:hidden">
              <button
                (click)="previousPage()"
                [disabled]="currentPage() === 1"
                class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                Anterior
              </button>
              <button
                (click)="nextPage()"
                [disabled]="currentPage() === totalPages()"
                class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                Siguiente
              </button>
            </div>
            <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  Mostrando
                  <span class="font-medium">{{ startRecord() }}</span>
                  a
                  <span class="font-medium">{{ endRecord() }}</span>
                  de
                  <span class="font-medium">{{ filteredData().length }}</span>
                  resultados
                </p>
              </div>
              <div>
                <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    (click)="previousPage()"
                    [disabled]="currentPage() === 1"
                    class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                  </button>
                  
                  @for (page of visiblePages(); track page) {
                    <button
                      (click)="goToPage(page)"
                      class="relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-colors"
                      [ngClass]="page === currentPage() 
                        ? 'z-10 bg-indigo-50 dark:bg-indigo-900 border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'">
                      {{ page }}
                    </button>
                  }

                  <button
                    (click)="nextPage()"
                    [disabled]="currentPage() === totalPages()"
                    class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class DataTableComponent<T = any> implements OnInit {
  @Input() title = 'Tabla de Datos';
  @Input() subtitle = '';
  @Input() columns: TableColumn<T>[] = [];
  @Input() data: T[] = [];
  @Input() actions: TableAction<T>[] = [];
  @Input() pageSize = 10;
  @Input() loading = signal(false);
  @Input() searchable = true;
  @Input() sortable = true;
  @Input() paginated = true;
  @Input() virtualScroll = false;
  @Input() trackBy: (index: number, item: T) => any = (index: number) => index;

  @Output() sortChange = new EventEmitter<SortEvent>();
  @Output() filterChange = new EventEmitter<FilterEvent>();
  @Output() pageChange = new EventEmitter<PaginationEvent>();

  // Internal state
  searchTerm = '';
  currentPage = signal(1);
  currentSort = signal<{ column: string; direction: 'asc' | 'desc' | null }>({
    column: '',
    direction: null
  });

  // Computed values
  filteredData = computed(() => {
    if (!this.searchTerm.trim()) {
      return this.data;
    }

    const term = this.searchTerm.toLowerCase();
    return this.data.filter(row =>
      this.columns.some(column => {
        const value = this.getCellValue(row, column.key);
        return String(value).toLowerCase().includes(term);
      })
    );
  });

  sortedData = computed(() => {
    const sort = this.currentSort();
    if (!sort.column || !sort.direction) {
      return this.filteredData();
    }

    return [...this.filteredData()].sort((a, b) => {
      const aValue = this.getCellValue(a, sort.column);
      const bValue = this.getCellValue(b, sort.column);

      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  });

  totalPages = computed(() =>
    Math.ceil(this.sortedData().length / this.pageSize)
  );

  paginatedData = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.sortedData().slice(start, end);
  });

  startRecord = computed(() =>
    this.sortedData().length === 0 ? 0 : (this.currentPage() - 1) * this.pageSize + 1
  );

  endRecord = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.sortedData().length)
  );

  visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];

    // Always show first page
    pages.push(1);

    // Show pages around current
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }

    // Always show last page if there are multiple pages
    if (total > 1) {
      pages.push(total);
    }

    // Remove duplicates and sort
    return [...new Set(pages)].sort((a, b) => a - b);
  });

  ngOnInit() {
    // Reset to first page when data changes
    this.currentPage.set(1);
  }

  onSearch() {
    this.currentPage.set(1);
  }

  onSort(column: string) {
    const sort = this.currentSort();
    let direction: 'asc' | 'desc' | null = 'asc';

    if (sort.column === column) {
      direction = sort.direction === 'asc' ? 'desc' : sort.direction === 'desc' ? null : 'asc';
    }

    this.currentSort.set({ column, direction });
    this.sortChange.emit({ column, direction });
  }

  previousPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(page => page - 1);
      this.emitPageChange();
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(page => page + 1);
      this.emitPageChange();
    }
  }

  goToPage(page: number) {
    this.currentPage.set(page);
    this.emitPageChange();
  }

  private emitPageChange() {
    this.pageChange.emit({
      page: this.currentPage(),
      pageSize: this.pageSize,
      total: this.sortedData().length
    });
  }

  getCellValue(row: T, key: string): any {
    return key.split('.').reduce((obj, prop) => obj?.[prop], row as any);
  }

  formatCellValue(row: T, column: TableColumn<T>): string {
    const value = this.getCellValue(row, column.key);

    if (column.format) {
      return column.format(value);
    }

    if (column.render) {
      return column.render(value, row);
    }

    switch (column.type) {
      case 'currency':
        return new Intl.NumberFormat('es-CL', {
          style: 'currency',
          currency: 'CLP'
        }).format(value || 0);
      case 'date':
        return value ? new Date(value).toLocaleDateString('es-CL') : '';
      case 'number':
        return new Intl.NumberFormat('es-CL').format(value || 0);
      default:
        return String(value || '');
    }
  }

  getStatusClasses(status: string): string {
    const classes = {
      'active': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'inactive': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'completed': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    };
    return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }

  getActionClasses(color: string): string {
    const classes = {
      'primary': 'text-indigo-600 bg-indigo-100 hover:bg-indigo-200 focus:ring-indigo-500 dark:text-indigo-400 dark:bg-indigo-900 dark:hover:bg-indigo-800',
      'secondary': 'text-gray-600 bg-gray-100 hover:bg-gray-200 focus:ring-gray-500 dark:text-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600',
      'success': 'text-green-600 bg-green-100 hover:bg-green-200 focus:ring-green-500 dark:text-green-400 dark:bg-green-900 dark:hover:bg-green-800',
      'warning': 'text-yellow-600 bg-yellow-100 hover:bg-yellow-200 focus:ring-yellow-500 dark:text-yellow-400 dark:bg-yellow-900 dark:hover:bg-yellow-800',
      'danger': 'text-red-600 bg-red-100 hover:bg-red-200 focus:ring-red-500 dark:text-red-400 dark:bg-red-900 dark:hover:bg-red-800'
    };
    return classes[color as keyof typeof classes] || classes.primary;
  }

  getVisibleActions(row: T): TableAction<T>[] {
    return this.actions.filter(action =>
      !action.visible || action.visible(row)
    );
  }

  getRowId(row: T, index: number): any {
    return this.trackBy(index, row);
  }
}
