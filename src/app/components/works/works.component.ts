import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-works',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <!-- Header Section -->
      <div class="mb-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Catálogo de Servicios</h1>
            <p class="text-gray-600 mt-1">Trabajos y servicios técnicos disponibles</p>
          </div>
          <div class="flex space-x-2">
            <span class="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
              {{ works.length }} servicio{{ works.length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="mb-6 bg-white rounded-lg shadow-sm p-4">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Navegación:</h3>
        <div class="flex flex-wrap gap-2">
          <a href="/clientes" 
             class="px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors duration-200">
            ← Clientes
          </a>
          <a href="/tickets" 
             class="px-4 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg transition-colors duration-200">
            🎫 Tickets
          </a>
          <a href="/productos" 
             class="px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg transition-colors duration-200">
            📦 Productos
          </a>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        <span class="ml-3 text-gray-600">Cargando servicios...</span>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <span class="text-red-600 text-xl">❌</span>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Error al cargar servicios</h3>
            <p class="mt-1 text-sm text-red-700">{{ error }}</p>
          </div>
        </div>
      </div>

      <!-- Services Grid -->
      <div *ngIf="!loading && !error" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div *ngFor="let work of works" 
             class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
          
          <!-- Service Header -->
          <div class="mb-4">
            <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ work.name }}</h3>
            <div class="flex items-center justify-between">
              <span class="text-2xl font-bold text-purple-600">
                {{ formatCurrency(work.base_price) }}
              </span>
              <span class="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                {{ work.estimated_hours || 0 }}h
              </span>
            </div>
          </div>

          <!-- Service Details -->
          <div class="space-y-3 mb-4">
            <div class="flex items-center justify-between">
              <span class="text-gray-500 text-sm">Tiempo estimado:</span>
              <span class="text-gray-900 font-medium">{{ work.estimated_hours || 0 }} horas</span>
            </div>
            
            <div class="flex items-center justify-between">
              <span class="text-gray-500 text-sm">Precio por hora:</span>
              <span class="text-gray-900 font-medium">{{ formatCurrency(calculateHourlyRate(work.base_price, work.estimated_hours)) }}</span>
            </div>
          </div>

          <!-- Description -->
          <div *ngIf="work.description" class="mb-4 p-3 bg-gray-50 rounded-md">
            <p class="text-sm text-gray-600">{{ work.description }}</p>
          </div>

          <!-- Actions -->
          <div class="flex space-x-2">
            <button class="flex-1 bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 transition-colors duration-200">
              Añadir al ticket
            </button>
            <button class="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200">
              ✏️
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="works.length === 0" 
             class="col-span-full bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div class="text-gray-400 text-6xl mb-4">🔧</div>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No hay servicios</h3>
          <p class="text-gray-500">No hay servicios registrados en el catálogo</p>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Resumen de servicios</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">{{ works.length }}</div>
            <div class="text-sm text-gray-600">Total servicios</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600">{{ getAveragePrice() }}</div>
            <div class="text-sm text-gray-600">Precio promedio</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ getAverageHours() }}h</div>
            <div class="text-sm text-gray-600">Tiempo promedio</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-orange-600">{{ works.length }}</div>
            <div class="text-sm text-gray-600">Servicios activos</div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class WorksComponent implements OnInit {
  loading = false;
  error: string | null = null;
  works: any[] = [];
  
  private supabase = inject(SimpleSupabaseService);

  ngOnInit() {
    console.log('🔧 Works Component iniciado');
    this.loadWorks();
  }

  async loadWorks() {
    console.log('🔧 Cargando trabajos...');
    this.loading = true;
    this.error = null;
    
    try {
      const { data: works, error } = await this.supabase.getClient()
        .from('works')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      
      if (error) throw new Error('Error trabajos: ' + error.message);
      
      this.works = works || [];
      console.log('✅ Trabajos cargados:', this.works.length);
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error:', error);
    } finally {
      this.loading = false;
    }
  }

  formatCurrency(amount?: number): string {
    if (!amount) return '0 €';
    return `${amount.toFixed(2)} €`;
  }

  calculateHourlyRate(basePrice?: number, hours?: number): number {
    if (!basePrice || !hours || hours === 0) return 0;
    return basePrice / hours;
  }

  getAveragePrice(): string {
    if (this.works.length === 0) return '0 €';
    const average = this.works.reduce((sum, work) => sum + (work.base_price || 0), 0) / this.works.length;
    return this.formatCurrency(average);
  }

  getAverageHours(): number {
    if (this.works.length === 0) return 0;
    const average = this.works.reduce((sum, work) => sum + (work.estimated_hours || 0), 0) / this.works.length;
    return Math.round(average * 10) / 10; // Round to 1 decimal place
  }
}
