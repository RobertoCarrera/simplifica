import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface FeatureCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  route: string;
  status: 'completed' | 'in_progress' | 'planned';
  progress: number;
  features: string[];
  stats?: {
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'stable';
  }[];
}

@Component({
  selector: 'app-advanced-features-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <!-- Hero Section -->
      <div class="bg-white shadow-sm border-b border-gray-200">
        <div class="px-6 py-8">
          <div class="text-center">
            <h1 class="text-4xl font-bold text-gray-900 mb-4">
              ✨ <span class="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                FUNCIONALIDADES AVANZADAS Y UX
              </span> ✨
            </h1>
            <p class="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Sistema completo de funcionalidades avanzadas implementadas para Simplifica. 
              Cada funcionalidad está diseñada para mejorar la productividad y experiencia del usuario.
            </p>
            
            <!-- Progress Overview -->
            <div class="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white max-w-4xl mx-auto">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="text-center">
                  <div class="text-3xl font-bold">{{ completedFeatures().length }}</div>
                  <div class="text-green-100">Funcionalidades Completadas</div>
                </div>
                <div class="text-center">
                  <div class="text-3xl font-bold">{{ Math.round(overallProgress()) }}%</div>
                  <div class="text-green-100">Progreso Total</div>
                </div>
                <div class="text-center">
                  <div class="text-3xl font-bold">{{ totalFeatureCount() }}</div>
                  <div class="text-green-100">Total de Sub-funciones</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Features Grid -->
      <div class="px-6 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          @for (feature of features(); track feature.id) {
            <div 
              class="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100 overflow-hidden"
              [class.ring-2]="feature.status === 'completed'"
              [class.ring-green-400]="feature.status === 'completed'"
              [class.ring-opacity-50]="feature.status === 'completed'"
            >
              <!-- Header -->
              <div class="p-6 pb-4">
                <div class="flex items-start justify-between mb-4">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl {{ feature.color }} flex items-center justify-center text-2xl">
                      {{ feature.icon }}
                    </div>
                    <div>
                      <h3 class="text-lg font-bold text-gray-900">{{ feature.name }}</h3>
                      <p class="text-sm text-gray-600">{{ feature.description }}</p>
                    </div>
                  </div>
                  
                  <!-- Status Badge -->
                  @if (feature.status === 'completed') {
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <i class="bi bi-check-circle-fill mr-1"></i>
                      Completado
                    </span>
                  } @else if (feature.status === 'in_progress') {
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      <i class="bi bi-clock mr-1"></i>
                      En Progreso
                    </span>
                  } @else {
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      <i class="bi bi-hourglass mr-1"></i>
                      Planeado
                    </span>
                  }
                </div>

                <!-- Progress Bar -->
                <div class="mb-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-gray-700">Progreso</span>
                    <span class="text-sm font-bold text-gray-900">{{ feature.progress }}%</span>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      class="h-2.5 rounded-full transition-all duration-1000 ease-out"
                      [class]="feature.status === 'completed' ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-blue-500 to-purple-600'"
                      [style.width.%]="feature.progress"
                    ></div>
                  </div>
                </div>
              </div>

              <!-- Features List -->
              <div class="px-6 pb-4">
                <h4 class="text-sm font-semibold text-gray-900 mb-3">Características Implementadas:</h4>
                <div class="space-y-2">
                  @for (item of feature.features; track item) {
                    <div class="flex items-center gap-2 text-sm">
                      <i class="bi bi-check-circle-fill text-green-500 text-xs"></i>
                      <span class="text-gray-700">{{ item }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Stats (if available) -->
              @if (feature.stats && feature.stats.length > 0) {
                <div class="px-6 pb-4">
                  <h4 class="text-sm font-semibold text-gray-900 mb-3">Estadísticas:</h4>
                  <div class="grid grid-cols-2 gap-3">
                    @for (stat of feature.stats; track stat.label) {
                      <div class="text-center p-2 bg-gray-50 rounded-lg">
                        <div class="text-lg font-bold text-gray-900">{{ stat.value }}</div>
                        <div class="text-xs text-gray-600">{{ stat.label }}</div>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Action Button -->
              <div class="px-6 pb-6">
                <button
                  (click)="navigateToFeature(feature.route)"
                  [disabled]="feature.status === 'planned'"
                  class="w-full py-3 px-4 rounded-xl font-medium transition-all duration-200"
                  [class]="feature.status === 'completed' 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl' 
                    : feature.status === 'in_progress'
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'"
                >
                  @if (feature.status === 'planned') {
                    <i class="bi bi-lock mr-2"></i>
                    Próximamente
                  } @else {
                    <i class="bi bi-arrow-right-circle mr-2"></i>
                    Explorar Funcionalidad
                  }
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Summary Section -->
        <div class="mt-16 bg-white rounded-2xl shadow-lg p-8">
          <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">
            🎯 Resumen de Implementación
          </h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="text-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
              <div class="text-3xl font-bold text-blue-600 mb-2">📊</div>
              <div class="text-lg font-semibold text-gray-900">Analytics</div>
              <div class="text-sm text-gray-600">Dashboard completo con métricas visuales</div>
            </div>
            
            <div class="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
              <div class="text-3xl font-bold text-green-600 mb-2">🔍</div>
              <div class="text-lg font-semibold text-gray-900">Búsqueda</div>
              <div class="text-sm text-gray-600">Motor inteligente con Fuse.js</div>
            </div>
            
            <div class="text-center p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
              <div class="text-3xl font-bold text-purple-600 mb-2">🔔</div>
              <div class="text-lg font-semibold text-gray-900">Notificaciones</div>
              <div class="text-sm text-gray-600">Sistema avanzado en tiempo real</div>
            </div>
            
            <div class="text-center p-6 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
              <div class="text-3xl font-bold text-orange-600 mb-2">🤖</div>
              <div class="text-lg font-semibold text-gray-900">Workflows</div>
              <div class="text-sm text-gray-600">Constructor visual de automatizaciones</div>
            </div>
          </div>

          <div class="mt-8 text-center">
            <div class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full font-medium">
              <i class="bi bi-trophy"></i>
              ¡Todas las funcionalidades avanzadas implementadas exitosamente!
              <i class="bi bi-check-circle-fill"></i>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .feature-card {
      animation: fadeInUp 0.6s ease-out;
    }

    .feature-card:nth-child(1) { animation-delay: 0.1s; }
    .feature-card:nth-child(2) { animation-delay: 0.2s; }
    .feature-card:nth-child(3) { animation-delay: 0.3s; }
    .feature-card:nth-child(4) { animation-delay: 0.4s; }
    .feature-card:nth-child(5) { animation-delay: 0.5s; }
  `]
})
export class AdvancedFeaturesDashboardComponent implements OnInit {
  // Add Math reference for template
  Math = Math;

  // Features data
  private featuresData = signal<FeatureCard[]>([
    {
      id: 'analytics',
      name: 'Analíticas',
      description: 'Panel de control con métricas y visualizaciones de presupuestos',
      icon: '📊',
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      route: '/analytics',
      status: 'completed',
      progress: 100,
      features: [
        'Métricas de presupuestos mensuales',
        'Gráficos de evolución temporal',
        'IVA presupuestado y totales',
        'Borradores y conversión',
        'Dashboard responsive mobile-first'
      ],
      stats: [
        { label: 'Métricas', value: 4 },
        { label: 'Histórico', value: 6 }
      ]
    },
    {
      id: 'search',
      name: 'Advanced Search',
      description: 'Motor de búsqueda inteligente y filtros avanzados',
      icon: '🔍',
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      route: '/search',
      status: 'completed',
      progress: 100,
      features: [
        'Búsqueda fuzzy con Fuse.js',
        'Filtros dinámicos por múltiples criterios',
        'Búsqueda en tiempo real',
        'Historial de búsquedas',
        'Resultados paginados y ordenables'
      ],
      stats: [
        { label: 'Filtros', value: 8 },
        { label: 'Entidades', value: 4 }
      ]
    },
    {
      id: 'notifications',
      name: 'Sistema de Notificaciones',
      description: 'Notificaciones en tiempo real y centro de mensajes',
      icon: '🔔',
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      route: '/notifications',
      status: 'completed',
      progress: 100,
      features: [
        'Centro de notificaciones completo',
        'Sistema de templates y categorías',
        'Notificaciones de escritorio',
        'Bell component con badge en tiempo real',
        'Filtros avanzados y estadísticas'
      ],
      stats: [
        { label: 'Categorías', value: 5 },
        { label: 'Templates', value: 8 }
      ]
    },
    {
      id: 'workflows',
      name: 'Automatización de Workflows',
      description: 'Constructor visual de flujos de servicios automatizados',
      icon: '🤖',
      color: 'bg-gradient-to-br from-orange-500 to-orange-600',
      route: '/workflows',
      status: 'completed',
      progress: 100,
      features: [
        'Constructor visual drag & drop',
        'Nodos: Triggers, Condiciones, Acciones',
        'Motor de ejecución automático',
        'Plantillas predefinidas',
        'Canvas interactivo con zoom y grid'
      ],
      stats: [
        { label: 'Tipos de Nodos', value: 4 },
        { label: 'Plantillas', value: 2 }
      ]
    },
    {
      id: 'export-import',
      name: 'Export/Import & Drag & Drop',
      description: 'Sistema completo de intercambio de datos',
      icon: '📁',
      color: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      route: '/export-import',
      status: 'completed',
      progress: 100,
      features: [
        'Exportación a múltiples formatos',
        'Importación masiva con validación',
        'Drag & drop para archivos',
        'Plantillas de importación/exportación',
        'Procesamiento en background'
      ],
      stats: [
        { label: 'Formatos', value: 4 },
        { label: 'Plantillas', value: 6 }
      ]
    }
  ]);

  // Public signals
  readonly features = this.featuresData.asReadonly();

  // Computed values
  readonly completedFeatures = computed(() => 
    this.features().filter(f => f.status === 'completed')
  );

  readonly overallProgress = computed(() => {
    const features = this.features();
    const totalProgress = features.reduce((sum, f) => sum + f.progress, 0);
    return totalProgress / features.length;
  });

  readonly totalFeatureCount = computed(() => 
    this.features().reduce((sum, f) => sum + f.features.length, 0)
  );

  constructor(private router: Router) {}

  ngOnInit() {
    console.log('🎉 Advanced Features Dashboard inicializado');
    console.log('📊 Features completadas:', this.completedFeatures().length);
    console.log('⚡ Progreso total:', `${Math.round(this.overallProgress())}%`);
  }

  navigateToFeature(route: string) {
    this.router.navigate([route]);
  }
}
