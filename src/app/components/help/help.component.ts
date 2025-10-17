import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="help-container">
      <header class="help-header">
        <h1><i class="fas fa-question-circle"></i> Ayuda y Soporte</h1>
        <p class="subtitle">¿Necesitas ayuda? Aquí tienes varias formas de contactarnos</p>
      </header>

      <div class="contact-grid">
        <div class="contact-card">
          <div class="contact-icon email">
            <i class="fas fa-envelope"></i>
          </div>
          <div class="contact-content">
            <h3>Email</h3>
            <p>Envíanos un correo y te responderemos en menos de 24 horas</p>
            <a href="mailto:soporte@simplifica.com" class="contact-btn">soporte&#64;simplifica.com</a>
          </div>
        </div>

        <div class="contact-card">
          <div class="contact-icon phone">
            <i class="fas fa-phone"></i>
          </div>
          <div class="contact-content">
            <h3>Teléfono</h3>
            <p>Llámanos de lunes a viernes de 9:00 a 18:00</p>
            <a href="tel:+34900123456" class="contact-btn">+34 900 123 456</a>
          </div>
        </div>

        <div class="contact-card">
          <div class="contact-icon chat">
            <i class="fas fa-comments"></i>
          </div>
          <div class="contact-content">
            <h3>Chat en Vivo</h3>
            <p>Chatea con nuestro equipo en tiempo real</p>
            <button class="contact-btn" (click)="openChat()">Iniciar Chat</button>
          </div>
        </div>

        <div class="contact-card">
          <div class="contact-icon docs">
            <i class="fas fa-book"></i>
          </div>
          <div class="contact-content">
            <h3>Documentación</h3>
            <p>Guías detalladas y tutoriales paso a paso</p>
            <a href="https://docs.simplifica.com" target="_blank" class="contact-btn">Ver Documentación</a>
          </div>
        </div>
      </div>

      <section class="faq-section">
        <h2>Preguntas Frecuentes</h2>
        <div class="faq-list">
          <div class="faq-item" *ngFor="let faq of faqs" (click)="toggleFaq(faq)">
            <div class="faq-question">
              <span>{{ faq.question }}</span>
              <i class="fas" [class.fa-chevron-down]="!faq.open" [class.fa-chevron-up]="faq.open"></i>
            </div>
            <div class="faq-answer" [class.open]="faq.open">
              <p>{{ faq.answer }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .help-container {
      padding: 2rem;
    }

    .help-header {
      margin-bottom: 3rem;
      text-align: center;
    }

    .help-header h1 {
      margin: 0;
      font-size: 2.5rem;
      font-weight: 600;
      color: #1f2937;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
    }

    .subtitle {
      color: #6b7280;
      margin: 1rem 0 0 0;
      font-size: 1.125rem;
    }

    .contact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }

    .contact-card {
      background: white;
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
      border: 1px solid #e5e7eb;
    }

    .contact-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    }

    .contact-icon {
      width: 4rem;
      height: 4rem;
      border-radius: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5rem;
    }

    .contact-icon i {
      font-size: 1.5rem;
      color: white;
    }

    .contact-icon.email {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    }

    .contact-icon.phone {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }

    .contact-icon.chat {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }

    .contact-icon.docs {
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    }

    .contact-content h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
    }

    .contact-content p {
      color: #6b7280;
      margin-bottom: 1.5rem;
    }

    .contact-btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      border-radius: 0.5rem;
      font-weight: 500;
      transition: background-color 0.2s;
      border: none;
      cursor: pointer;
    }

    .contact-btn:hover {
      background: #1d4ed8;
    }

    .faq-section {
      background: #f9fafb;
      border-radius: 1rem;
      padding: 2rem;
    }

    .faq-section h2 {
      margin: 0 0 2rem 0;
      font-size: 1.875rem;
      font-weight: 600;
      color: #1f2937;
      text-align: center;
    }

    .faq-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .faq-item {
      background: white;
      border-radius: 0.75rem;
      border: 1px solid #e5e7eb;
      overflow: hidden;
      cursor: pointer;
    }

    .faq-question {
      padding: 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 500;
      color: #1f2937;
    }

    .faq-question:hover {
      background: #f9fafb;
    }

    .faq-answer {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      border-top: 1px solid #e5e7eb;
    }

    .faq-answer.open {
      max-height: 200px;
    }

    .faq-answer p {
      padding: 1.25rem;
      margin: 0;
      color: #6b7280;
    }

    @media (max-width: 768px) {
      .help-container {
        padding: 1rem;
      }

      .help-header h1 {
        font-size: 2rem;
        flex-direction: column;
        gap: 0.5rem;
      }

      .contact-grid {
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }

      .contact-card {
        padding: 1.5rem;
      }
    }
  `]
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
