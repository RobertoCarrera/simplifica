import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <!-- Contact Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Email Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4">
            <i class="fas fa-envelope text-white text-lg"></i>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Email</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Envíanos un correo y te responderemos en menos de 24 horas</p>
          <a href="mailto:soporte@sincronia.agency.com" 
            class="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
            <i class="fas fa-paper-plane text-xs"></i>
            Contactar
          </a>
        </div>

        <!-- Phone Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-4">
            <i class="fas fa-phone text-white text-lg"></i>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Teléfono</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Llámanos de lunes a viernes de 9:00 a 18:00</p>
          <a href="tel:+34624344917" 
            class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors">
            <i class="fas fa-phone-alt text-xs"></i>
            +34 624 34 49 17
          </a>
        </div>

        <!-- Chat Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4">
            <i class="fas fa-comments text-white text-lg"></i>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Chat en Vivo</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Chatea con nuestro equipo en tiempo real</p>
          <button (click)="openChat()" 
            class="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
            <i class="fas fa-comment-dots text-xs"></i>
            Iniciar Chat
          </button>
        </div>

        <!-- Docs Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-md border border-gray-100 dark:border-slate-700 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4">
            <i class="fas fa-book text-white text-lg"></i>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Documentación</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Guías detalladas y tutoriales paso a paso</p>
          <a href="https://docs.simplifica.com" target="_blank" 
            class="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors">
            <i class="fas fa-external-link-alt text-xs"></i>
            Ver Docs
          </a>
        </div>
      </div>

      <!-- FAQ Section -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-r from-purple-500 to-indigo-600">
          <h2 class="text-xl font-semibold text-white flex items-center gap-2">
            <i class="fas fa-question-circle"></i>
            Preguntas Frecuentes
          </h2>
        </div>
        
        <div class="p-4 space-y-3">
          <div *ngFor="let faq of faqs; let i = index" 
            class="rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden transition-all duration-200"
            [ngClass]="{'bg-gray-50 dark:bg-slate-700/50': faq.open}">
            
            <button 
              (click)="toggleFaq(faq)"
              class="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
              <span class="font-medium text-gray-900 dark:text-white pr-4">{{ faq.question }}</span>
              <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 transition-transform duration-200"
                [ngClass]="{'rotate-180': faq.open}">
                <i class="fas fa-chevron-down text-gray-500 dark:text-gray-400 text-sm"></i>
              </div>
            </button>
            
            <div 
              class="overflow-hidden transition-all duration-300 ease-in-out"
              [style.max-height]="faq.open ? '200px' : '0'"
              [style.opacity]="faq.open ? '1' : '0'">
              <div class="px-4 pb-4 pt-0">
                <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{{ faq.answer }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Tips Section -->
      <div class="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
            <i class="fas fa-lightbulb text-2xl"></i>
          </div>
          <div>
            <h3 class="text-lg font-semibold mb-2">¿Sabías que...?</h3>
            <p class="text-blue-100 text-sm">
              Puedes acceder rápidamente a cualquier sección usando el menú lateral. 
              Además, la mayoría de las acciones tienen atajos de teclado para una navegación más rápida.
            </p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class HelpComponent {
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

  toggleFaq(faq: any): void {
    faq.open = !faq.open;
  }

  openChat(): void {
    // Aquí implementarías la lógica del chat
    alert('Chat en vivo próximamente disponible');
  }
}
