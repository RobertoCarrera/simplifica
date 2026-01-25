import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  template: `
    <!-- Skeleton Loading -->
    <div *ngIf="loading" class="space-y-6">
       <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <app-skeleton type="card" height="200px"></app-skeleton>
          <app-skeleton type="card" height="200px"></app-skeleton>
          <app-skeleton type="card" height="200px"></app-skeleton>
          <app-skeleton type="card" height="200px"></app-skeleton>
       </div>
       <app-skeleton type="rect" height="300px"></app-skeleton>
    </div>

    <div *ngIf="!loading" class="space-y-6 animate-fadeIn">
      <!-- Contact Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Email Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-blue-500/50 transition-colors duration-200 group">
          <div class="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
            <i class="fas fa-envelope text-lg"></i>
          </div>
          <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-2">Email</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Respuesta en < 24h</p>
          <a href="mailto:soporte@sincronia.agency.com" 
            class="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
            Contactar
            <i class="fas fa-arrow-right text-xs"></i>
          </a>
        </div>

        <!-- Phone Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-emerald-500/50 transition-colors duration-200 group">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
            <i class="fas fa-phone text-lg"></i>
          </div>
          <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-2">Teléfono</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">L-V, 9:00 - 18:00</p>
          <a href="tel:+34624344917" 
            class="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
            +34 624 34 49 17
            <i class="fas fa-arrow-right text-xs"></i>
          </a>
        </div>

        <!-- Chat Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-amber-500/50 transition-colors duration-200 group">
          <div class="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
            <i class="fas fa-comments text-lg"></i>
          </div>
          <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-2">Chat en Vivo</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Soporte tiempo real</p>
          <button (click)="openChat()" 
            class="inline-flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 dark:hover:text-amber-400 transition-colors">
            Iniciar Chat
            <i class="fas fa-arrow-right text-xs"></i>
          </button>
        </div>

        <!-- Docs Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-purple-500/50 transition-colors duration-200 group">
          <div class="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
            <i class="fas fa-book text-lg"></i>
          </div>
          <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-2">Docs</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Guías y tutoriales</p>
          <a href="https://docs.simplifica.com" target="_blank" 
            class="inline-flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-700 dark:hover:text-purple-400 transition-colors">
            Ver Docs
            <i class="fas fa-arrow-right text-xs"></i>
          </a>
        </div>
      </div>

      <!-- FAQ Section -->
      <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <i class="fas fa-question-circle text-gray-400"></i>
            Preguntas Frecuentes
          </h2>
        </div>
        
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
          <div *ngFor="let faq of faqs; let i = index" 
            class="bg-white dark:bg-gray-800 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
            
            <button 
              (click)="toggleFaq(faq)"
              class="w-full flex items-center justify-between p-5 text-left focus:outline-none">
              <span class="font-medium text-gray-900 dark:text-white pr-8">{{ faq.question }}</span>
              <div class="flex-shrink-0 transition-transform duration-200 text-gray-400"
                [ngClass]="{'rotate-180': faq.open}">
                <i class="fas fa-chevron-down"></i>
              </div>
            </button>
            
            <div 
              class="overflow-hidden transition-all duration-300 ease-in-out"
              [style.max-height]="faq.open ? '200px' : '0'"
              [style.opacity]="faq.open ? '1' : '0'">
              <div class="px-5 pb-5 pt-0">
                <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{{ faq.answer }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Tips Section -->
      <div class="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white shadow-none border border-transparent">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
            <i class="fas fa-lightbulb text-2xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-semibold mb-2">¿Sabías que...?</h3>
            <p class="text-blue-100 text-sm leading-relaxed">
              Puedes acceder rápidamente a cualquier sección usando el menú lateral. 
              Además, la mayoría de las acciones tienen atajos de teclado para una navegación más rápida.
            </p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class HelpComponent implements OnInit {
  loading = true;

  faqs = [
    {
      question: '¿Cómo creo un nuevo cliente?',
      answer: 'Ve a la sección "Clientes" y haz clic en el botón "Nuevo Cliente". Rellena la información requerida y guarda.',
      open: false
    },
    {
      question: '¿Cómo gestiono los tickets?',
      answer: 'En la sección "Tickets" puedes crear, editar y seguir el estado de todos los tickets de soporte técnico.',
      open: false
    },
    {
      question: '¿Cómo configurar servicios?',
      answer: 'Los servicios se gestionan desde la sección "Servicios". Puedes crear diferentes tipos de servicios con precios y tiempos estimados.',
      open: false
    },
    {
      question: '¿Cómo cambio mi contraseña?',
      answer: 'Ve a tu perfil de usuario y selecciona "Cambiar contraseña". Necesitarás tu contraseña actual para confirmar el cambio.',
      open: false
    }
  ];

  ngOnInit() {
    // Fake loading for consistency
    setTimeout(() => {
      this.loading = false;
    }, 600);
  }

  toggleFaq(faq: any): void {
    faq.open = !faq.open;
  }

  openChat(): void {
    // Aquí implementarías la lógica del chat
    alert('Chat en vivo próximamente disponible');
  }
}
