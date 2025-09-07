import { Injectable, signal, computed, ElementRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { 
  Tour, 
  TourStep, 
  TooltipConfig, 
  HelpArticle, 
  VideoTutorial, 
  UserProgress, 
  SearchResult, 
  HelpContext,
  OnboardingStats 
} from '../interfaces/onboarding.interface';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class OnboardingService {
  // Signals para estado reactivo
  private currentTour = signal<Tour | null>(null);
  private currentStepIndex = signal<number>(0);
  private isTooltipVisible = signal<boolean>(false);
  private activeTooltip = signal<TooltipConfig | null>(null);
  private userProgress = signal<UserProgress>({
    userId: 'current-user',
    completedTours: [],
    skippedTours: [],
    viewedArticles: [],
    watchedVideos: [],
    tooltipsShown: [],
    lastActivity: new Date(),
    preferences: {
      showTooltips: true,
      autoStartTours: true,
      preferredDifficulty: 'beginner'
    }
  });

  private helpContext = signal<HelpContext>({
    currentPage: '/',
    userRole: 'user',
    userLevel: 'beginner'
  });

  // Datos mock para tours
  private mockTours = signal<Tour[]>([
    {
      id: 'first-time-user',
      name: 'Bienvenido a Simplifica',
      description: 'Tu primera experiencia con la plataforma',
      category: 'first_time',
      targetAudience: ['new_user'],
      estimatedTime: 5,
      icon: '🎉',
      difficulty: 'beginner',
      tags: ['introducción', 'básico', 'navegación'],
      isActive: true,
      steps: [
        {
          id: 'welcome',
          title: '¡Bienvenido!',
          content: 'Te damos la bienvenida a Simplifica. Vamos a hacer un tour rápido para conocer las funcionalidades principales.',
          targetElement: 'body',
          position: 'center',
          showNext: true,
          showPrev: false,
          showSkip: true
        },
        {
          id: 'sidebar',
          title: 'Menú de Navegación',
          content: 'Este es tu menú principal. Desde aquí puedes acceder a todas las secciones: clientes, tickets, analytics y más.',
          targetElement: '#menu-principal',
          position: 'right',
          showNext: true,
          showPrev: true,
          showSkip: true
        },
        {
          id: 'clients',
          title: 'Gestión de Clientes',
          content: 'Aquí puedes ver, crear y gestionar todos tus clientes. Es el corazón de tu negocio.',
          targetElement: 'a[routerLink="clientes"]',
          position: 'right',
          showNext: true,
          showPrev: true,
          showSkip: true,
          action: { type: 'click', element: 'a[routerLink="clientes"]' }
        },
        {
          id: 'advanced-features',
          title: 'Funcionalidades Avanzadas',
          content: '¡Descubre nuestras funcionalidades premium! Analytics, búsqueda avanzada, workflows y mucho más.',
          targetElement: 'a[routerLink="advanced-features"]',
          position: 'right',
          showNext: true,
          showPrev: true,
          showSkip: true
        }
      ]
    },
    {
      id: 'analytics-tour',
      name: 'Descubre Analytics',
      description: 'Aprende a usar el dashboard de análisis',
      category: 'feature',
      targetAudience: ['user', 'admin'],
      estimatedTime: 3,
      icon: '📊',
      difficulty: 'intermediate',
      tags: ['analytics', 'métricas', 'dashboard'],
      isActive: true,
      steps: [
        {
          id: 'analytics-intro',
          title: 'Dashboard de Analytics',
          content: 'Este es tu centro de control. Aquí puedes ver todas las métricas importantes de tu negocio.',
          targetElement: '.analytics-container',
          position: 'top',
          showNext: true,
          showPrev: false,
          showSkip: true
        },
        {
          id: 'metrics-cards',
          title: 'Tarjetas de Métricas',
          content: 'Estas tarjetas muestran los KPIs más importantes: clientes, tickets, ingresos y más.',
          targetElement: '.metrics-grid',
          position: 'bottom',
          showNext: true,
          showPrev: true,
          showSkip: true
        }
      ]
    }
  ]);

  // Datos mock para tooltips
  private mockTooltips = signal<TooltipConfig[]>([
    {
      id: 'sidebar-toggle',
      selector: '.toggle',
      title: 'Contraer Menú',
      content: 'Haz clic aquí para contraer o expandir el menú lateral',
      position: 'right',
      trigger: 'hover',
      delay: 1000,
      context: { page: 'all' },
      priority: 1,
      isActive: true,
      dismissible: true
    },
    {
      id: 'new-client-btn',
      selector: '.btn-new-client',
      title: 'Nuevo Cliente',
      content: 'Crea un nuevo cliente completando el formulario. Todos los campos marcados con * son obligatorios.',
      position: 'bottom',
      trigger: 'hover',
      delay: 500,
      context: { page: 'clientes' },
      priority: 2,
      isActive: true,
      dismissible: true
    }
  ]);

  // Datos mock para artículos de ayuda
  private mockArticles = signal<HelpArticle[]>([
    {
      id: 'getting-started',
      title: 'Primeros Pasos en Simplifica',
      content: `
        <h2>Bienvenido a Simplifica</h2>
        <p>Simplifica es tu plataforma integral para la gestión de servicios técnicos...</p>
        <h3>Configuración Inicial</h3>
        <ol>
          <li>Configura tu perfil de empresa</li>
          <li>Añade tus primeros clientes</li>
          <li>Personaliza tus categorías de servicio</li>
        </ol>
      `,
      excerpt: 'Guía completa para comenzar a usar Simplifica desde cero',
      category: 'Primeros Pasos',
      tags: ['introducción', 'configuración', 'básico'],
      difficulty: 'beginner',
      estimatedReadTime: 5,
      lastUpdated: new Date(),
      author: 'Equipo Simplifica',
      viewCount: 245,
      rating: 4.8,
      isPublished: true,
      relatedArticles: ['client-management', 'ticket-creation']
    },
    {
      id: 'client-management',
      title: 'Gestión Avanzada de Clientes',
      content: `
        <h2>Gestión de Clientes</h2>
        <p>Aprende a gestionar eficientemente tu base de clientes...</p>
        <h3>Funcionalidades Principales</h3>
        <ul>
          <li>Crear y editar perfiles de cliente</li>
          <li>Historial de servicios</li>
          <li>Notas y observaciones</li>
        </ul>
      `,
      excerpt: 'Todo lo que necesitas saber sobre la gestión de clientes',
      category: 'Clientes',
      tags: ['clientes', 'gestión', 'avanzado'],
      difficulty: 'intermediate',
      estimatedReadTime: 8,
      lastUpdated: new Date(),
      author: 'Equipo Simplifica',
      viewCount: 189,
      rating: 4.6,
      isPublished: true,
      relatedArticles: ['getting-started', 'ticket-creation']
    }
  ]);

  // Datos mock para videos
  private mockVideos = signal<VideoTutorial[]>([
    {
      id: 'intro-video',
      title: 'Introducción a Simplifica - Tour Completo',
      description: 'Video introductorio que te muestra todas las funcionalidades principales',
      thumbnailUrl: '/assets/videos/intro-thumb.jpg',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      duration: 300,
      category: 'Introducción',
      difficulty: 'beginner',
      tags: ['introducción', 'tour', 'básico'],
      chapters: [
        { time: 0, title: 'Bienvenida', description: 'Introducción a la plataforma' },
        { time: 60, title: 'Navegación', description: 'Cómo moverte por la interfaz' },
        { time: 120, title: 'Clientes', description: 'Gestión de clientes' },
        { time: 180, title: 'Tickets', description: 'Sistema de tickets' },
        { time: 240, title: 'Analytics', description: 'Dashboard de métricas' }
      ],
      relatedArticles: ['getting-started', 'client-management'],
      isPublished: true,
      viewCount: 1520,
      rating: 4.9
    }
  ]);

  // Computed values
  readonly tours = this.mockTours.asReadonly();
  readonly tooltips = this.mockTooltips.asReadonly();
  readonly helpArticles = this.mockArticles.asReadonly();
  readonly videoTutorials = this.mockVideos.asReadonly();
  readonly progress = this.userProgress.asReadonly();
  readonly context = this.helpContext.asReadonly();

  readonly currentTourData = this.currentTour.asReadonly();
  readonly currentStep = computed(() => {
    const tour = this.currentTour();
    const index = this.currentStepIndex();
    return tour?.steps[index] || null;
  });

  readonly isLastStep = computed(() => {
    const tour = this.currentTour();
    const index = this.currentStepIndex();
    return tour ? index >= tour.steps.length - 1 : false;
  });

  readonly isFirstStep = computed(() => this.currentStepIndex() === 0);
  readonly stepIndex = this.currentStepIndex.asReadonly();

  constructor(private router: Router) {
    // Escuchar cambios de ruta para actualizar contexto
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.updateContext(event.url);
    });

    // Cargar progreso del usuario desde localStorage
    this.loadUserProgress();
  }

  // ===== GESTIÓN DE TOURS =====
  startTour(tourId: string): boolean {
    const tour = this.tours().find(t => t.id === tourId);
    if (!tour || !tour.isActive) {
      console.warn('Tour no encontrado o no activo:', tourId);
      return false;
    }

    this.currentTour.set(tour);
    this.currentStepIndex.set(0);
    this.showCurrentStep();
    return true;
  }

  nextStep(): void {
    const tour = this.currentTour();
    if (!tour) return;

    const nextIndex = this.currentStepIndex() + 1;
    if (nextIndex < tour.steps.length) {
      this.currentStepIndex.set(nextIndex);
      this.showCurrentStep();
    } else {
      this.completeTour();
    }
  }

  previousStep(): void {
    const currentIndex = this.currentStepIndex();
    if (currentIndex > 0) {
      this.currentStepIndex.set(currentIndex - 1);
      this.showCurrentStep();
    }
  }

  skipTour(): void {
    const tour = this.currentTour();
    if (tour) {
      const progress = this.userProgress();
      progress.skippedTours.push(tour.id);
      this.userProgress.set({ ...progress });
      this.saveUserProgress();
    }
    this.endTour();
  }

  completeTour(): void {
    const tour = this.currentTour();
    if (tour) {
      const progress = this.userProgress();
      progress.completedTours.push(tour.id);
      this.userProgress.set({ ...progress });
      this.saveUserProgress();
    }
    this.endTour();
  }

  endTour(): void {
    this.currentTour.set(null);
    this.currentStepIndex.set(0);
    this.hideTooltip();
  }

  private showCurrentStep(): void {
    const step = this.currentStep();
    if (!step) return;

    // Ejecutar acción si existe
    if (step.action) {
      this.executeStepAction(step);
    }

    // Mostrar tooltip del paso
    this.showStepTooltip(step);
  }

  private executeStepAction(step: TourStep): void {
    if (!step.action) return;

    setTimeout(() => {
      const element = document.querySelector(step.action!.element || step.targetElement);
      if (element && step.action) {
        switch (step.action.type) {
          case 'click':
            if (step.action.element && step.action.element.includes('routerLink')) {
              // Para elementos con routerLink, usar el router
              const routerLink = step.action.element.match(/routerLink="([^"]+)"/)?.[1];
              if (routerLink) {
                this.router.navigate([routerLink]);
              }
            } else {
              (element as HTMLElement).click();
            }
            break;
          case 'hover':
            element.dispatchEvent(new MouseEvent('mouseenter'));
            break;
          case 'focus':
            (element as HTMLElement).focus();
            break;
          case 'scroll':
            element.scrollIntoView({ behavior: 'smooth' });
            break;
        }
      }
    }, 500);
  }

  private showStepTooltip(step: TourStep): void {
    // Crear tooltip temporal para el paso del tour
    const position = step.position === 'center' ? 'top' : step.position;
    const tooltip: TooltipConfig = {
      id: `tour-step-${step.id}`,
      selector: step.targetElement,
      title: step.title,
      content: step.content,
      position: position,
      trigger: 'manual',
      delay: 0,
      context: {},
      priority: 999,
      isActive: true,
      dismissible: false
    };

    this.activeTooltip.set(tooltip);
    this.isTooltipVisible.set(true);
  }

  // ===== GESTIÓN DE TOOLTIPS =====
  showTooltip(config: TooltipConfig): void {
    this.activeTooltip.set(config);
    this.isTooltipVisible.set(true);
  }

  hideTooltip(): void {
    this.isTooltipVisible.set(false);
    this.activeTooltip.set(null);
  }

  getContextualTooltips(): TooltipConfig[] {
    const context = this.helpContext();
    return this.tooltips().filter(tooltip => {
      if (!tooltip.isActive) return false;
      
      // Filtrar por página
      if (tooltip.context.page && tooltip.context.page !== 'all') {
        if (!context.currentPage.includes(tooltip.context.page)) {
          return false;
        }
      }

      // Filtrar por rol de usuario
      if (tooltip.context.userRole) {
        if (!tooltip.context.userRole.includes(context.userRole)) {
          return false;
        }
      }

      return true;
    });
  }

  // ===== BÚSQUEDA DE AYUDA =====
  searchHelp(query: string): SearchResult[] {
    const results: SearchResult[] = [];

    // Buscar en artículos
    this.helpArticles().forEach(article => {
      const score = this.calculateRelevanceScore(query, article.title, article.content, article.tags);
      if (score > 0.3) {
        results.push({
          id: article.id,
          title: article.title,
          type: 'article',
          relevanceScore: score,
          excerpt: article.excerpt,
          category: article.category,
          url: `/help/article/${article.id}`
        });
      }
    });

    // Buscar en videos
    this.videoTutorials().forEach(video => {
      const score = this.calculateRelevanceScore(query, video.title, video.description, video.tags);
      if (score > 0.3) {
        results.push({
          id: video.id,
          title: video.title,
          type: 'video',
          relevanceScore: score,
          excerpt: video.description,
          category: video.category,
          url: `/help/video/${video.id}`
        });
      }
    });

    // Buscar en tours
    this.tours().forEach(tour => {
      const score = this.calculateRelevanceScore(query, tour.name, tour.description, tour.tags);
      if (score > 0.3) {
        results.push({
          id: tour.id,
          title: tour.name,
          type: 'tour',
          relevanceScore: score,
          excerpt: tour.description,
          category: tour.category,
          url: `/help/tour/${tour.id}`
        });
      }
    });

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private calculateRelevanceScore(query: string, title: string, content: string, tags: string[]): number {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    
    let score = 0;

    // Coincidencia exacta en título (peso alto)
    if (titleLower.includes(queryLower)) {
      score += 0.8;
    }

    // Coincidencia en contenido (peso medio)
    if (contentLower.includes(queryLower)) {
      score += 0.4;
    }

    // Coincidencia en tags (peso alto)
    const matchingTags = tags.filter(tag => 
      tag.toLowerCase().includes(queryLower) || queryLower.includes(tag.toLowerCase())
    );
    score += matchingTags.length * 0.6;

    return Math.min(score, 1);
  }

  // ===== GESTIÓN DE CONTEXTO =====
  private updateContext(url: string): void {
    const context = this.helpContext();
    context.currentPage = url;
    
    // Detectar funcionalidad basada en URL
    if (url.includes('/analytics')) {
      context.feature = 'analytics';
    } else if (url.includes('/clientes')) {
      context.feature = 'clients';
    } else if (url.includes('/tickets')) {
      context.feature = 'tickets';
    }

    this.helpContext.set({ ...context });
  }

  setUserLevel(level: 'beginner' | 'intermediate' | 'advanced'): void {
    const context = this.helpContext();
    context.userLevel = level;
    this.helpContext.set({ ...context });

    const progress = this.userProgress();
    progress.preferences.preferredDifficulty = level;
    this.userProgress.set({ ...progress });
    this.saveUserProgress();
  }

  // ===== PERSISTENCIA =====
  private loadUserProgress(): void {
    const saved = localStorage.getItem('simplifica_onboarding_progress');
    if (saved) {
      try {
        const progress = JSON.parse(saved);
        progress.lastActivity = new Date(progress.lastActivity);
        this.userProgress.set(progress);
      } catch (error) {
        console.warn('Error loading user progress:', error);
      }
    }
  }

  private saveUserProgress(): void {
    try {
      const progress = this.userProgress();
      progress.lastActivity = new Date();
      localStorage.setItem('simplifica_onboarding_progress', JSON.stringify(progress));
    } catch (error) {
      console.warn('Error saving user progress:', error);
    }
  }

  // ===== ESTADÍSTICAS =====
  getOnboardingStats(): OnboardingStats {
    return {
      totalUsers: 150,
      completedOnboarding: 120,
      completionRate: 80,
      averageCompletionTime: 8.5,
      mostSkippedSteps: ['analytics-intro', 'advanced-features'],
      mostHelpfulArticles: ['getting-started', 'client-management'],
      searchQueries: [
        { query: 'crear cliente', count: 45, successRate: 85 },
        { query: 'ticket', count: 38, successRate: 92 },
        { query: 'analytics', count: 22, successRate: 78 }
      ]
    };
  }

  // ===== UTILIDADES =====
  isTooltipShown(): boolean {
    return this.isTooltipVisible();
  }

  getActiveTooltip(): TooltipConfig | null {
    return this.activeTooltip();
  }

  shouldShowAutoTour(): boolean {
    const progress = this.userProgress();
    return progress.preferences.autoStartTours && 
           progress.completedTours.length === 0 &&
           progress.skippedTours.length === 0;
  }

  markArticleAsRead(articleId: string): void {
    const progress = this.userProgress();
    if (!progress.viewedArticles.includes(articleId)) {
      progress.viewedArticles.push(articleId);
      this.userProgress.set({ ...progress });
      this.saveUserProgress();
    }
  }

  markVideoAsWatched(videoId: string): void {
    const progress = this.userProgress();
    if (!progress.watchedVideos.includes(videoId)) {
      progress.watchedVideos.push(videoId);
      this.userProgress.set({ ...progress });
      this.saveUserProgress();
    }
  }
}
