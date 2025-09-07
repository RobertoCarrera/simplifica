import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { LoadingComponent } from '../loading/loading.component';
import { SmoothTransitionDirective } from '../../directives/smooth-transition.directive';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-animation-showcase',
  standalone: true,
  imports: [CommonModule, SkeletonComponent, LoadingComponent, SmoothTransitionDirective],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      
      <!-- Header -->
      <div 
        appSmoothTransition="fadeIn"
        [transitionDelay]="100"
        class="text-center mb-12"
      >
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          🎬 Animation Showcase
        </h1>
        <p class="text-xl text-gray-600 dark:text-gray-300">
          Demostración de animaciones y micro-interacciones
        </p>
      </div>

      <!-- Loading States Section -->
      <section class="mb-16">
        <h2 
          appSmoothTransition="slideIn"
          [transitionDelay]="300"
          class="text-2xl font-bold text-gray-900 dark:text-white mb-8"
        >
          ⏳ Loading States
        </h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <!-- Spinner -->
          <div 
            appSmoothTransition="zoomIn"
            [transitionDelay]="400"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Spinner</h3>
            <app-loading type="spinner" size="lg" text="Cargando datos..."></app-loading>
          </div>

          <!-- Dots -->
          <div 
            appSmoothTransition="zoomIn"
            [transitionDelay]="500"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Dots</h3>
            <app-loading type="dots" size="lg" text="Procesando..."></app-loading>
          </div>

          <!-- Pulse -->
          <div 
            appSmoothTransition="zoomIn"
            [transitionDelay]="600"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Pulse</h3>
            <app-loading type="pulse" size="lg" text="Sincronizando..."></app-loading>
          </div>

          <!-- Bars -->
          <div 
            appSmoothTransition="zoomIn"
            [transitionDelay]="700"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Bars</h3>
            <app-loading type="bars" size="lg" text="Analizando..."></app-loading>
          </div>

          <!-- Progress -->
          <div 
            appSmoothTransition="zoomIn"
            [transitionDelay]="800"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Progress</h3>
            <app-loading 
              type="progress" 
              [progress]="progressValue()" 
              [showPercentage]="true"
              text="Subiendo archivos..."
            ></app-loading>
          </div>
        </div>
      </section>

      <!-- Skeleton Screens Section -->
      <section class="mb-16">
        <h2 
          appSmoothTransition="slideIn"
          [transitionDelay]="900"
          class="text-2xl font-bold text-gray-900 dark:text-white mb-8"
        >
          🦴 Skeleton Screens
        </h2>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Skeleton Cards -->
          <div 
            appSmoothTransition="fadeIn"
            [transitionDelay]="1000"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Card Skeleton</h3>
            <app-skeleton type="card" width="100%" height="300px"></app-skeleton>
          </div>

          <!-- Skeleton List -->
          <div 
            appSmoothTransition="fadeIn"
            [transitionDelay]="1100"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">List Skeleton</h3>
            <app-skeleton type="list" [count]="4"></app-skeleton>
          </div>

          <!-- Individual Skeletons -->
          <div 
            appSmoothTransition="fadeIn"
            [transitionDelay]="1200"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Individual Elements</h3>
            <div class="space-y-4">
              <div class="flex items-center space-x-3">
                <app-skeleton type="avatar"></app-skeleton>
                <div class="flex-1 space-y-2">
                  <app-skeleton type="text" width="60%"></app-skeleton>
                  <app-skeleton type="text" width="40%"></app-skeleton>
                </div>
              </div>
              <app-skeleton type="button" width="120px"></app-skeleton>
              <app-skeleton type="rect" width="100%" height="100px"></app-skeleton>
            </div>
          </div>

          <!-- Table Skeleton -->
          <div 
            appSmoothTransition="fadeIn"
            [transitionDelay]="1300"
            [hoverEffect]="true"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Table Skeleton</h3>
            <app-skeleton type="table" [count]="3" [columns]="3"></app-skeleton>
          </div>
        </div>
      </section>

      <!-- Micro-Interactions Section -->
      <section class="mb-16">
        <h2 
          appSmoothTransition="slideIn"
          [transitionDelay]="1400"
          class="text-2xl font-bold text-gray-900 dark:text-white mb-8"
        >
          ✨ Micro-Interactions
        </h2>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <!-- Hover Effects -->
          <button
            appSmoothTransition="fadeIn"
            [transitionDelay]="1500"
            [hoverEffect]="true"
            [clickEffect]="true"
            class="bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-lg transition-colors font-medium"
          >
            🎯 Hover Me
          </button>

          <!-- Pulse Effect -->
          <button
            appSmoothTransition="pulse"
            [transitionDelay]="1600"
            [clickEffect]="true"
            class="bg-green-500 hover:bg-green-600 text-white p-4 rounded-lg transition-colors font-medium"
          >
            💗 Pulse
          </button>

          <!-- Shake Effect -->
          <button
            appSmoothTransition="shake"
            [transitionDelay]="1700"
            [clickEffect]="true"
            class="bg-red-500 hover:bg-red-600 text-white p-4 rounded-lg transition-colors font-medium"
          >
            🫨 Shake
          </button>

          <!-- Bounce Effect -->
          <button
            appSmoothTransition="bounce"
            [transitionDelay]="1800"
            [clickEffect]="true"
            class="bg-purple-500 hover:bg-purple-600 text-white p-4 rounded-lg transition-colors font-medium"
          >
            🏀 Bounce
          </button>

          <!-- Swing Effect -->
          <button
            appSmoothTransition="swing"
            [transitionDelay]="1900"
            [clickEffect]="true"
            class="bg-yellow-500 hover:bg-yellow-600 text-white p-4 rounded-lg transition-colors font-medium"
          >
            🎪 Swing
          </button>

          <!-- Heartbeat Effect -->
          <button
            appSmoothTransition="heartbeat"
            [transitionDelay]="2000"
            [clickEffect]="true"
            class="bg-pink-500 hover:bg-pink-600 text-white p-4 rounded-lg transition-colors font-medium"
          >
            💖 Heartbeat
          </button>
        </div>
      </section>

      <!-- Stagger Animation Demo -->
      <section class="mb-16">
        <h2 
          appSmoothTransition="slideIn"
          [transitionDelay]="2100"
          class="text-2xl font-bold text-gray-900 dark:text-white mb-8"
        >
          📊 Staggered Animations
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          @for (item of demoItems; track item.id) {
            <div 
              appSmoothTransition="slideIn"
              [transitionDelay]="2200 + ($index * 150)"
              [hoverEffect]="true"
              [clickEffect]="true"
              class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 cursor-pointer"
            >
              <div class="text-4xl mb-4">{{ item.icon }}</div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">{{ item.title }}</h3>
              <p class="text-gray-600 dark:text-gray-300">{{ item.description }}</p>
            </div>
          }
        </div>
      </section>

      <!-- Interactive Controls -->
      <section class="mb-16">
        <h2 
          appSmoothTransition="slideIn"
          [transitionDelay]="3000"
          class="text-2xl font-bold text-gray-900 dark:text-white mb-8"
        >
          🎮 Interactive Controls
        </h2>

        <div 
          appSmoothTransition="fadeIn"
          [transitionDelay]="3100"
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-700"
        >
          <div class="flex flex-wrap gap-4 justify-center">
            
            <button
              (click)="toggleLoadingStates()"
              appSmoothTransition="zoomIn"
              [clickEffect]="true"
              class="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
            >
              {{ showLoadingStates() ? '❌ Ocultar' : '⏳ Mostrar' }} Loading States
            </button>

            <button
              (click)="triggerAnimation()"
              appSmoothTransition="pulse"
              [clickEffect]="true"
              class="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors font-medium"
            >
              🎬 Trigger Animation
            </button>

            <button
              (click)="toggleDarkMode()"
              appSmoothTransition="rotateIn"
              [clickEffect]="true"
              class="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors font-medium"
            >
              {{ isDarkMode() ? '☀️ Light' : '🌙 Dark' }} Mode
            </button>

            <button
              (click)="resetAnimations()"
              appSmoothTransition="shake"
              [clickEffect]="true"
              class="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium"
            >
              🔄 Reset Animations
            </button>
          </div>

          <!-- Loading State Overlay -->
          @if (showLoadingStates()) {
            <div class="mt-8">
              <app-loading
                type="spinner"
                size="lg"
                text="Demostración de loading overlay..."
                subText="Esta es una demostración interactiva"
                [overlay]="false"
              ></app-loading>
            </div>
          }
        </div>
      </section>

      <!-- Performance Note -->
      <div 
        appSmoothTransition="fadeIn"
        [transitionDelay]="3500"
        class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center"
      >
        <div class="text-blue-500 text-4xl mb-4">⚡</div>
        <h3 class="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
          Optimizado para Rendimiento
        </h3>
        <p class="text-blue-600 dark:text-blue-300">
          Todas las animaciones respetan las preferencias de accesibilidad del usuario y se optimizan automáticamente para dispositivos con menos recursos.
        </p>
      </div>
    </div>
  `,
  styles: [`
    /* Estilos adicionales para la demo */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* Efectos especiales para la demo */
    .demo-card {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .demo-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }

    .gradient-bg {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .glass-effect {
      backdrop-filter: blur(10px);
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
  `],
  styleUrls: ['./animation-showcase.component.scss']
})
export class AnimationShowcaseComponent {
  private animationService = inject(AnimationService);

  // Signals para el estado de la demo
  progressValue = signal(0);
  showLoadingStates = signal(false);
  isDarkMode = signal(false);

  // Datos de demo
  demoItems = [
    { id: 1, icon: '🚀', title: 'Performance', description: 'Animaciones optimizadas para máximo rendimiento' },
    { id: 2, icon: '📱', title: 'Mobile First', description: 'Diseñado para experiencias móviles fluidas' },
    { id: 3, icon: '♿', title: 'Accessible', description: 'Respeta las preferencias de accesibilidad' },
    { id: 4, icon: '🎨', title: 'Customizable', description: 'Fácil personalización y extensión' },
    { id: 5, icon: '⚡', title: 'Lightweight', description: 'Mínimo impacto en el bundle size' },
    { id: 6, icon: '🔄', title: 'Reusable', description: 'Componentes reutilizables y modulares' }
  ];

  constructor() {
    // Simular progreso
    this.simulateProgress();
  }

  private simulateProgress() {
    const interval = setInterval(() => {
      const current = this.progressValue();
      if (current >= 100) {
        this.progressValue.set(0);
      } else {
        this.progressValue.set(current + 1);
      }
    }, 100);

    // Limpiar el intervalo después de un tiempo
    setTimeout(() => clearInterval(interval), 30000);
  }

  toggleLoadingStates() {
    this.showLoadingStates.set(!this.showLoadingStates());
  }

  triggerAnimation() {
    // Crear una animación personalizada en un elemento aleatorio
    const elements = document.querySelectorAll('[appSmoothTransition]');
    const randomElement = elements[Math.floor(Math.random() * elements.length)] as HTMLElement;
    
    if (randomElement) {
      this.animationService.createMicroAnimation(randomElement, 'pulse', { duration: 600 });
    }
  }

  toggleDarkMode() {
    this.isDarkMode.set(!this.isDarkMode());
    // En una implementación real, esto cambiaría el tema global
    document.documentElement.classList.toggle('dark');
  }

  resetAnimations() {
    // Resetear el estado de las animaciones
    this.showLoadingStates.set(false);
    this.progressValue.set(0);
    
    // Simular un "restart" de las animaciones
    setTimeout(() => this.simulateProgress(), 100);
  }
}
