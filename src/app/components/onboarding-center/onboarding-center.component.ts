import { Component, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OnboardingService } from '../../services/onboarding.service';
import { 
  Tour, 
  HelpArticle, 
  VideoTutorial, 
  SearchResult,
  OnboardingStats 
} from '../../interfaces/onboarding.interface';

@Component({
  selector: 'app-onboarding-center',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <!-- Header con búsqueda -->
      <div class="bg-white shadow-sm border-b border-gray-200">
        <div class="max-w-7xl mx-auto px-6 py-8">
          <div class="text-center mb-8">
            <h1 class="text-4xl font-bold text-gray-900 mb-4">
              🎓 <span class="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Centro de Ayuda y Onboarding
              </span>
            </h1>
            <p class="text-xl text-gray-600 max-w-3xl mx-auto">
              Todo lo que necesitas para dominar Simplifica. Tours guiados, documentación, videos y ayuda contextual.
            </p>
          </div>

          <!-- Barra de búsqueda -->
          <div class="max-w-2xl mx-auto mb-8">
            <div class="relative">
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="performSearch()"
                placeholder="¿Qué necesitas aprender hoy? Busca tours, artículos, videos..."
                class="w-full px-6 py-4 text-lg border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent pl-14"
              >
              <i class="bi bi-search absolute left-5 top-5 text-gray-400 text-xl"></i>
              @if (isSearching()) {
                <div class="absolute right-4 top-4">
                  <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              }
            </div>

            <!-- Resultados de búsqueda -->
            @if (searchResults().length > 0) {
              <div class="bg-white rounded-xl shadow-lg mt-4 border border-gray-200 max-h-96 overflow-y-auto">
                @for (result of searchResults(); track result.id) {
                  <div 
                    class="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors duration-200"
                    (click)="selectSearchResult(result)"
                  >
                    <div class="flex items-start gap-3">
                      <div class="flex-shrink-0 mt-1">
                        @switch (result.type) {
                          @case ('article') {
                            <i class="bi bi-file-text text-blue-500 text-lg"></i>
                          }
                          @case ('video') {
                            <i class="bi bi-play-circle text-red-500 text-lg"></i>
                          }
                          @case ('tour') {
                            <i class="bi bi-map text-green-500 text-lg"></i>
                          }
                        }
                      </div>
                      <div class="flex-1">
                        <h4 class="font-semibold text-gray-900">{{ result.title }}</h4>
                        <p class="text-sm text-gray-600 mt-1">{{ result.excerpt }}</p>
                        <div class="flex items-center gap-2 mt-2">
                          <span class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">{{ result.category }}</span>
                          <span class="text-xs text-gray-500">{{ getTypeLabel(result.type) }}</span>
                        </div>
                      </div>
                      <div class="text-right">
                        <div class="text-sm font-medium text-blue-600">{{ Math.round(result.relevanceScore * 100) }}% match</div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Contenido principal -->
      <div class="max-w-7xl mx-auto px-6 py-12">
        <!-- Navegación por pestañas -->
        <div class="bg-white rounded-2xl shadow-lg mb-8">
          <div class="border-b border-gray-200">
            <nav class="flex space-x-8 px-6">
              @for (tab of tabs; track tab.id) {
                <button
                  (click)="activeTab.set(tab.id)"
                  class="py-4 px-2 border-b-2 font-medium text-sm transition-colors duration-200"
                  [class]="activeTab() === tab.id 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
                >
                  <i class="{{tab.icon}} mr-2"></i>
                  {{ tab.label }}
                </button>
              }
            </nav>
          </div>

          <div class="p-6">
            <!-- Tour Guiados -->
            @if (activeTab() === 'tours') {
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                @for (tour of availableTours(); track tour.id) {
                  <div class="bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-300">
                    <div class="flex items-start justify-between mb-4">
                      <div class="text-3xl">{{ tour.icon }}</div>
                      <span class="text-xs px-2 py-1 rounded-full"
                            [class]="getDifficultyClass(tour.difficulty)">
                        {{ getDifficultyLabel(tour.difficulty) }}
                      </span>
                    </div>
                    
                    <h3 class="text-lg font-bold text-gray-900 mb-2">{{ tour.name }}</h3>
                    <p class="text-gray-600 text-sm mb-4">{{ tour.description }}</p>
                    
                    <div class="flex items-center gap-4 text-xs text-gray-500 mb-4">
                      <span><i class="bi bi-clock mr-1"></i>{{ tour.estimatedTime }} min</span>
                      <span><i class="bi bi-list-ol mr-1"></i>{{ tour.steps.length }} pasos</span>
                    </div>

                    <div class="flex flex-wrap gap-1 mb-4">
                      @for (tag of tour.tags.slice(0, 3); track tag) {
                        <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">{{ tag }}</span>
                      }
                    </div>

                    @if (isToturCompleted(tour.id)) {
                      <button class="w-full py-2 px-4 bg-green-100 text-green-700 rounded-lg font-medium">
                        <i class="bi bi-check-circle mr-2"></i>
                        Completado
                      </button>
                    } @else {
                      <button
                        (click)="startTour(tour.id)"
                        class="w-full py-2 px-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200"
                      >
                        <i class="bi bi-play-circle mr-2"></i>
                        Iniciar Tour
                      </button>
                    }
                  </div>
                }
              </div>
            }

            <!-- Artículos de Ayuda -->
            @if (activeTab() === 'articles') {
              <div class="space-y-6">
                @for (article of helpArticles(); track article.id) {
                  <div class="bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-300">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="flex items-center gap-3 mb-3">
                          <h3 class="text-xl font-bold text-gray-900">{{ article.title }}</h3>
                          <span class="text-xs px-2 py-1 rounded-full"
                                [class]="getDifficultyClass(article.difficulty)">
                            {{ getDifficultyLabel(article.difficulty) }}
                          </span>
                        </div>
                        
                        <p class="text-gray-600 mb-4">{{ article.excerpt }}</p>
                        
                        <div class="flex items-center gap-4 text-sm text-gray-500 mb-4">
                          <span><i class="bi bi-clock mr-1"></i>{{ article.estimatedReadTime }} min lectura</span>
                          <span><i class="bi bi-eye mr-1"></i>{{ article.viewCount }} visualizaciones</span>
                          <span><i class="bi bi-star-fill mr-1 text-yellow-400"></i>{{ article.rating }}/5</span>
                        </div>

                        <div class="flex flex-wrap gap-2 mb-4">
                          <span class="text-xs px-3 py-1 bg-purple-100 text-purple-700 rounded-full">{{ article.category }}</span>
                          @for (tag of article.tags.slice(0, 4); track tag) {
                            <span class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">{{ tag }}</span>
                          }
                        </div>
                      </div>
                      
                      <div class="ml-4">
                        <button
                          (click)="readArticle(article.id)"
                          class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors duration-200"
                        >
                          <i class="bi bi-book mr-2"></i>
                          Leer
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Videos Tutoriales -->
            @if (activeTab() === 'videos') {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                @for (video of videoTutorials(); track video.id) {
                  <div class="bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
                    <div class="aspect-video bg-gray-200 relative">
                      <img 
                        [src]="video.thumbnailUrl" 
                        [alt]="video.title"
                        class="w-full h-full object-cover"
                        (error)="onImageError($event)"
                      >
                      <div class="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                        <button
                          (click)="watchVideo(video.id)"
                          class="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors duration-200"
                        >
                          <i class="bi bi-play-fill text-3xl text-blue-600 ml-1"></i>
                        </button>
                      </div>
                      <div class="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                        {{ formatDuration(video.duration) }}
                      </div>
                    </div>
                    
                    <div class="p-4">
                      <div class="flex items-start justify-between mb-3">
                        <h3 class="text-lg font-bold text-gray-900 flex-1">{{ video.title }}</h3>
                        <span class="text-xs px-2 py-1 rounded-full ml-2"
                              [class]="getDifficultyClass(video.difficulty)">
                          {{ getDifficultyLabel(video.difficulty) }}
                        </span>
                      </div>
                      
                      <p class="text-gray-600 text-sm mb-3">{{ video.description }}</p>
                      
                      <div class="flex items-center gap-3 text-xs text-gray-500 mb-3">
                        <span><i class="bi bi-eye mr-1"></i>{{ video.viewCount }}</span>
                        <span><i class="bi bi-star-fill mr-1 text-yellow-400"></i>{{ video.rating }}/5</span>
                      </div>

                      <div class="flex flex-wrap gap-1">
                        @for (tag of video.tags.slice(0, 3); track tag) {
                          <span class="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">{{ tag }}</span>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Estadísticas -->
            @if (activeTab() === 'stats') {
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 text-center">
                  <div class="text-3xl font-bold text-blue-600 mb-2">{{ stats().totalUsers }}</div>
                  <div class="text-sm text-blue-800">Usuarios Totales</div>
                </div>
                
                <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 text-center">
                  <div class="text-3xl font-bold text-green-600 mb-2">{{ stats().completionRate }}%</div>
                  <div class="text-sm text-green-800">Tasa Completación</div>
                </div>
                
                <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 text-center">
                  <div class="text-3xl font-bold text-purple-600 mb-2">{{ stats().averageCompletionTime }}</div>
                  <div class="text-sm text-purple-800">Tiempo Promedio (min)</div>
                </div>
                
                <div class="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 text-center">
                  <div class="text-3xl font-bold text-orange-600 mb-2">{{ stats().completedOnboarding }}</div>
                  <div class="text-sm text-orange-800">Onboarding Completo</div>
                </div>
              </div>

              <div class="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Pasos más saltados -->
                <div class="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 class="text-lg font-bold text-gray-900 mb-4">
                    <i class="bi bi-skip-end text-orange-500 mr-2"></i>
                    Pasos Más Saltados
                  </h3>
                  <div class="space-y-3">
                    @for (step of stats().mostSkippedSteps; track step) {
                      <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">{{ step }}</span>
                        <span class="text-sm text-gray-500">Saltado frecuentemente</span>
                      </div>
                    }
                  </div>
                </div>

                <!-- Artículos más útiles -->
                <div class="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 class="text-lg font-bold text-gray-900 mb-4">
                    <i class="bi bi-heart-fill text-red-500 mr-2"></i>
                    Artículos Más Útiles
                  </h3>
                  <div class="space-y-3">
                    @for (article of stats().mostHelpfulArticles; track article) {
                      <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span class="text-gray-700">{{ article }}</span>
                        <span class="text-sm text-green-600">★ Muy útil</span>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Acciones rápidas -->
        <div class="bg-white rounded-2xl shadow-lg p-8">
          <h2 class="text-2xl font-bold text-gray-900 mb-6 text-center">
            🚀 Acciones Rápidas
          </h2>
          
          <!-- Debug button -->
          <div class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 class="font-semibold text-yellow-800 mb-2">🔧 Debug - Testing</h3>
            <button
              (click)="debugStartTour()"
              class="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium mr-2"
            >
              Debug: Iniciar Tour
            </button>
            <span class="text-sm text-yellow-700">
              Tour actual: {{ onboardingService.currentTourData()?.name || 'Ninguno' }}
            </span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              (click)="startFirstTimeUserTour()"
              class="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl hover:from-blue-100 hover:to-blue-200 transition-all duration-300 text-center"
            >
              <div class="text-3xl mb-3">🎉</div>
              <div class="font-semibold text-gray-900 mb-2">Tour de Bienvenida</div>
              <div class="text-sm text-gray-600">Perfecto para nuevos usuarios</div>
            </button>
            
            <button
              (click)="openHelpSearch()"
              class="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl hover:from-green-100 hover:to-green-200 transition-all duration-300 text-center"
            >
              <div class="text-3xl mb-3">🔍</div>
              <div class="font-semibold text-gray-900 mb-2">Buscar Ayuda</div>
              <div class="text-sm text-gray-600">Encuentra respuestas rápidas</div>
            </button>
            
            <button
              (click)="contactSupport()"
              class="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl hover:from-purple-100 hover:to-purple-200 transition-all duration-300 text-center"
            >
              <div class="text-3xl mb-3">💬</div>
              <div class="font-semibold text-gray-900 mb-2">Contactar Soporte</div>
              <div class="text-sm text-gray-600">Habla con nuestro equipo</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .card-animate {
      animation: fadeInUp 0.6s ease-out;
    }

    .card-animate:nth-child(1) { animation-delay: 0.1s; }
    .card-animate:nth-child(2) { animation-delay: 0.2s; }
    .card-animate:nth-child(3) { animation-delay: 0.3s; }
  `]
})
export class OnboardingCenterComponent implements OnInit, OnDestroy {
  // Referencia a Math para el template
  Math = Math;

  // Estado local
  readonly activeTab = signal<string>('tours');
  readonly searchQuery = signal<string>('');
  readonly isSearching = signal<boolean>(false);
  readonly searchResults = signal<SearchResult[]>([]);

  // Configuración de pestañas
  readonly tabs = [
    { id: 'tours', label: 'Tours Guiados', icon: 'bi bi-map' },
    { id: 'articles', label: 'Artículos', icon: 'bi bi-file-text' },
    { id: 'videos', label: 'Videos', icon: 'bi bi-play-circle' },
    { id: 'stats', label: 'Estadísticas', icon: 'bi bi-graph-up' }
  ];

  // Computed values
  readonly availableTours = computed(() => 
    this.onboardingService.tours().filter(tour => tour.isActive)
  );

  readonly helpArticles = computed(() => 
    this.onboardingService.helpArticles().filter(article => article.isPublished)
  );

  readonly videoTutorials = computed(() => 
    this.onboardingService.videoTutorials().filter(video => video.isPublished)
  );

  readonly stats = computed(() => this.onboardingService.getOnboardingStats());

  constructor(
    public onboardingService: OnboardingService,
    private router: Router
  ) {}

  ngOnInit() {
    console.log('🎓 Onboarding Center inicializado');
    
    // Auto-iniciar tour si es usuario nuevo (comentado para testing)
    /*
    if (this.onboardingService.shouldShowAutoTour()) {
      setTimeout(() => {
        this.startFirstTimeUserTour();
      }, 2000);
    }
    */
  }

  ngOnDestroy() {
    // Cleanup si necesario
  }

  // ===== BÚSQUEDA =====
  performSearch(): void {
    const query = this.searchQuery().trim();
    if (query.length < 2) {
      this.searchResults.set([]);
      return;
    }

    this.isSearching.set(true);
    
    // Simular delay de búsqueda
    setTimeout(() => {
      const results = this.onboardingService.searchHelp(query);
      this.searchResults.set(results);
      this.isSearching.set(false);
    }, 300);
  }

  selectSearchResult(result: SearchResult): void {
    switch (result.type) {
      case 'article':
        this.readArticle(result.id);
        break;
      case 'video':
        this.watchVideo(result.id);
        break;
      case 'tour':
        this.startTour(result.id);
        break;
    }
    this.searchResults.set([]);
    this.searchQuery.set('');
  }

  // ===== TOURS =====
  startTour(tourId: string): void {
    if (this.onboardingService.startTour(tourId)) {
      console.log('✅ Tour iniciado:', tourId);
    } else {
      console.warn('❌ No se pudo iniciar el tour:', tourId);
    }
  }

  startFirstTimeUserTour(): void {
    this.startTour('first-time-user');
  }

  isToturCompleted(tourId: string): boolean {
    return this.onboardingService.progress().completedTours.includes(tourId);
  }

  // ===== ARTÍCULOS =====
  readArticle(articleId: string): void {
    this.onboardingService.markArticleAsRead(articleId);
    // Aquí podrías navegar a una vista detallada del artículo
    console.log('📖 Leyendo artículo:', articleId);
  }

  // ===== VIDEOS =====
  watchVideo(videoId: string): void {
    this.onboardingService.markVideoAsWatched(videoId);
    // Aquí podrías abrir un modal con el video o navegar a una vista del video
    console.log('🎥 Reproduciendo video:', videoId);
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  onImageError(event: any): void {
    // Imagen de placeholder si falla la carga
    event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlbiBubyBkaXNwb25pYmxlPC90ZXh0Pjwvc3ZnPg==';
  }

  // ===== UTILIDADES =====
  getDifficultyClass(difficulty: string): string {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-100 text-green-700';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-700';
      case 'advanced':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  getDifficultyLabel(difficulty: string): string {
    switch (difficulty) {
      case 'beginner':
        return 'Principiante';
      case 'intermediate':
        return 'Intermedio';
      case 'advanced':
        return 'Avanzado';
      default:
        return 'Desconocido';
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'article':
        return 'Artículo';
      case 'video':
        return 'Video';
      case 'tour':
        return 'Tour';
      default:
        return 'Desconocido';
    }
  }

  // ===== ACCIONES RÁPIDAS =====
  debugStartTour(): void {
    console.log('🔧 Debug: Iniciando tour de bienvenida...');
    this.startTour('first-time-user');
  }

  openHelpSearch(): void {
    // Enfocar en el campo de búsqueda
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  }

  contactSupport(): void {
    // Aquí podrías abrir un modal de contacto o navegar a una página de soporte
    console.log('💬 Contactando soporte...');
    alert('¡Pronto tendrás un sistema de chat en vivo! 💬');
  }

  // Getters para el template
  get activeTabValue() { return this.activeTab(); }
  get searchQueryValue() { return this.searchQuery(); }
  get isSearchingValue() { return this.isSearching(); }
  get searchResultsValue() { return this.searchResults(); }
}
