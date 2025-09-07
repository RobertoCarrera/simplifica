import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { LoadingComponent } from '../loading/loading.component';
import { SmoothTransitionDirective } from '../../directives/smooth-transition.directive';
import { AnimationService } from '../../services/animation.service';

interface Customer {
  id: number;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  lastActivity: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-enhanced-customers',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    SkeletonComponent, 
    LoadingComponent, 
    SmoothTransitionDirective
  ],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      
      <!-- Header con animación -->
      <div 
        appSmoothTransition="fadeIn" 
        [transitionDelay]="100"
        class="mb-8"
      >
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          👥 Gestión de Clientes
        </h1>
        <p class="text-gray-600 dark:text-gray-300">
          Administra y visualiza la información de tus clientes
        </p>
      </div>

      <!-- Stats Cards con stagger animation -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        @for (stat of stats(); track stat.label) {
          <div 
            appSmoothTransition="zoomIn"
            [transitionDelay]="$index * 150 + 200"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {{ stat.label }}
                </p>
                <p class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ stat.value }}
                </p>
              </div>
              <div class="text-3xl">{{ stat.icon }}</div>
            </div>
            <div class="mt-2 flex items-center text-sm">
              <span [class]="stat.change > 0 ? 'text-green-500' : 'text-red-500'">
                {{ stat.change > 0 ? '↗️' : '↘️' }} {{ Math.abs(stat.change) }}%
              </span>
              <span class="text-gray-500 dark:text-gray-400 ml-2">vs mes anterior</span>
            </div>
          </div>
        }
      </div>

      <!-- Search & Filters -->
      <div 
        appSmoothTransition="slideIn"
        [transitionDelay]="800"
        class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <input
              type="text"
              [(ngModel)]="searchTerm"
              placeholder="🔍 Buscar clientes..."
              class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
          </div>
          <div class="flex gap-2">
            <select 
              [(ngModel)]="statusFilter"
              class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
            <button
              (click)="refreshData()"
              [disabled]="isLoading()"
              appSmoothTransition="pulse"
              [clickEffect]="true"
              class="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="space-y-6">
          <!-- Skeleton Cards -->
          @for (item of [1,2,3,4,5,6]; track item) {
            <app-skeleton 
              type="card" 
              width="100%" 
              height="200px"
            ></app-skeleton>
          }
        </div>
      }

      <!-- Error State -->
      @if (error()) {
        <div 
          appSmoothTransition="shake"
          class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center"
        >
          <div class="text-red-500 text-6xl mb-4">😔</div>
          <h3 class="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
            Error al cargar clientes
          </h3>
          <p class="text-red-600 dark:text-red-300 mb-4">{{ error() }}</p>
          <button
            (click)="refreshData()"
            appSmoothTransition="bounce"
            [clickEffect]="true"
            class="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            🔄 Reintentar
          </button>
        </div>
      }

      <!-- Customers List -->
      @if (!isLoading() && !error() && filteredCustomers().length > 0) {
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          @for (customer of filteredCustomers(); track customer.id) {
            <div 
              appSmoothTransition="fadeIn"
              [transitionDelay]="$index * 100 + 1000"
              [hoverEffect]="true"
              [clickEffect]="true"
              class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-xl transition-shadow"
              (click)="selectCustomer(customer)"
            >
              <!-- Customer Header -->
              <div class="flex items-center mb-4">
                <div class="relative">
                  <img 
                    [src]="customer.avatar || 'https://ui-avatars.com/api/?name=' + customer.name + '&background=random'"
                    [alt]="customer.name"
                    class="w-12 h-12 rounded-full object-cover"
                  >
                  <div 
                    class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800"
                    [class]="customer.status === 'active' ? 'bg-green-500' : 'bg-gray-400'"
                  ></div>
                </div>
                <div class="ml-4 flex-1">
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    {{ customer.name }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ customer.email }}
                  </p>
                </div>
              </div>

              <!-- Customer Info -->
              <div class="space-y-2">
                @if (customer.phone) {
                  <div class="flex items-center text-sm text-gray-600 dark:text-gray-300">
                    <span class="mr-2">📞</span>
                    {{ customer.phone }}
                  </div>
                }
                <div class="flex items-center text-sm text-gray-600 dark:text-gray-300">
                  <span class="mr-2">🕒</span>
                  Última actividad: {{ customer.lastActivity }}
                </div>
                <div class="flex items-center justify-between pt-2">
                  <span 
                    class="px-2 py-1 rounded-full text-xs font-medium"
                    [class]="customer.status === 'active' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'"
                  >
                    {{ customer.status === 'active' ? '✅ Activo' : '⏸️ Inactivo' }}
                  </span>
                  <button
                    (click)="editCustomer(customer); $event.stopPropagation()"
                    appSmoothTransition="pulse"
                    [clickEffect]="true"
                    class="text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    ✏️
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @if (!isLoading() && !error() && filteredCustomers().length === 0) {
        <div 
          appSmoothTransition="bounce"
          [transitionDelay]="1000"
          class="text-center py-16"
        >
          <div class="text-8xl mb-4">🔍</div>
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No se encontraron clientes
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            {{ searchTerm() ? 'Intenta ajustar los filtros de búsqueda' : 'Comienza agregando tu primer cliente' }}
          </p>
          <button
            appSmoothTransition="zoomIn"
            [clickEffect]="true"
            class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
          >
            ➕ Agregar Cliente
          </button>
        </div>
      }

      <!-- Floating Action Button -->
      <button
        appSmoothTransition="bounce"
        [transitionDelay]="2000"
        [hoverEffect]="true"
        [clickEffect]="true"
        class="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center text-xl z-50"
        (click)="addNewCustomer()"
      >
        ➕
      </button>

      <!-- Loading Overlay -->
      @if (processingAction()) {
        <app-loading
          type="spinner"
          size="lg"
          text="Procesando..."
          [overlay]="true"
        ></app-loading>
      }
    </div>
  `,
  styles: [`
    /* Estilos adicionales para mejorar las animaciones */
    .hover-lift:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }

    /* Mejoras para dark mode */
    @media (prefers-color-scheme: dark) {
      .hover-lift:hover {
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
      }
    }
  `]
})
export class EnhancedCustomersComponent implements OnInit {
  private animationService = inject(AnimationService);

  // Signals para estado reactivo
  private _customers = signal<Customer[]>([]);
  private _isLoading = signal(false);
  private _error = signal<string | null>(null);
  private _processingAction = signal(false);
  
  // Filtros
  searchTerm = signal('');
  statusFilter = signal<'active' | 'inactive' | ''>('');

  // Computed values
  customers = this._customers.asReadonly();
  isLoading = this._isLoading.asReadonly();
  error = this._error.asReadonly();
  processingAction = this._processingAction.asReadonly();

  // Math para el template
  Math = Math;

  // Clientes filtrados
  filteredCustomers = computed(() => {
    let filtered = this.customers();
    
    // Filtrar por término de búsqueda
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(customer => 
        customer.name.toLowerCase().includes(search) ||
        customer.email.toLowerCase().includes(search)
      );
    }
    
    // Filtrar por estado
    const status = this.statusFilter();
    if (status) {
      filtered = filtered.filter(customer => customer.status === status);
    }
    
    return filtered;
  });

  // Stats computadas
  stats = computed(() => [
    {
      label: 'Total Clientes',
      value: this.customers().length,
      icon: '👥',
      change: 12
    },
    {
      label: 'Activos',
      value: this.customers().filter(c => c.status === 'active').length,
      icon: '✅',
      change: 8
    },
    {
      label: 'Nuevos este mes',
      value: 23,
      icon: '🆕',
      change: 15
    },
    {
      label: 'Satisfacción',
      value: '98%',
      icon: '😊',
      change: 3
    }
  ]);

  ngOnInit() {
    this.loadCustomers();
  }

  async loadCustomers() {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Simular carga de datos
      await this.delay(2000);
      
      // Datos de ejemplo
      const mockCustomers: Customer[] = [
        {
          id: 1,
          name: 'Ana García',
          email: 'ana@email.com',
          phone: '+34 600 123 456',
          lastActivity: '2 horas',
          status: 'active'
        },
        {
          id: 2,
          name: 'Carlos López',
          email: 'carlos@email.com',
          phone: '+34 600 654 321',
          lastActivity: '1 día',
          status: 'active'
        },
        {
          id: 3,
          name: 'María Rodríguez',
          email: 'maria@email.com',
          lastActivity: '3 días',
          status: 'inactive'
        }
      ];

      this._customers.set(mockCustomers);
    } catch (error) {
      this._error.set('Error al cargar los clientes. Inténtalo de nuevo.');
    } finally {
      this._isLoading.set(false);
    }
  }

  async refreshData() {
    await this.loadCustomers();
  }

  selectCustomer(customer: Customer) {
    console.log('Cliente seleccionado:', customer);
  }

  editCustomer(customer: Customer) {
    console.log('Editar cliente:', customer);
  }

  addNewCustomer() {
    console.log('Agregar nuevo cliente');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
