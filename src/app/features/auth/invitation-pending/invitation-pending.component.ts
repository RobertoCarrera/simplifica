import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-invitation-pending',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="invitation-pending-container">
      <div class="invitation-card">
        <!-- Icono de estado -->
        <div class="status-icon">
          <div class="icon-pending">⏳</div>
        </div>

        <!-- Información -->
        <div class="invitation-info">
          <h1>Solicitud Enviada</h1>
          <p class="main-message">{{ message || 'Tu solicitud para unirte a la empresa ha sido enviada.' }}</p>
          
          <div class="company-details">
            <h3>Empresa: {{ companyName }}</h3>
            <p>Propietario: {{ ownerEmail }}</p>
          </div>

          <div class="next-steps">
            <h4>Próximos pasos:</h4>
            <ul>
              <li>El propietario de la empresa revisará tu solicitud</li>
              <li>Recibirás un email cuando sea aprobada o rechazada</li>
              <li>Una vez aprobada, podrás acceder al sistema</li>
            </ul>
          </div>
        </div>

        <!-- Acciones -->
        <div class="invitation-actions">
          <button 
            type="button" 
            class="btn btn-secondary"
            (click)="goToLogin()"
          >
            Ir a Login
          </button>
          
          <button 
            type="button" 
            class="btn btn-outline"
            (click)="registerNewCompany()"
          >
            Crear Nueva Empresa
          </button>
        </div>

        <!-- Información adicional -->
        <div class="additional-info">
          <p class="text-muted">
            <strong>¿No era la empresa correcta?</strong> 
            Puedes crear una nueva empresa con un nombre diferente.
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .invitation-pending-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 2rem;
    }

    .invitation-card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 3rem;
      max-width: 600px;
      width: 100%;
      text-align: center;
    }

    .status-icon {
      margin-bottom: 2rem;
    }

    .icon-pending {
      font-size: 4rem;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .invitation-info h1 {
      color: #1a202c;
      font-size: 2.5rem;
      margin-bottom: 1rem;
      font-weight: 700;
    }

    .main-message {
      color: #4a5568;
      font-size: 1.1rem;
      margin-bottom: 2rem;
      line-height: 1.6;
    }

    .company-details {
      background: #f7fafc;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      text-align: left;
    }

    .company-details h3 {
      color: #2d3748;
      margin-bottom: 0.5rem;
      font-size: 1.3rem;
    }

    .company-details p {
      color: #718096;
      margin: 0;
    }

    .next-steps {
      text-align: left;
      margin-bottom: 2rem;
    }

    .next-steps h4 {
      color: #2d3748;
      margin-bottom: 1rem;
      font-size: 1.1rem;
    }

    .next-steps ul {
      color: #4a5568;
      margin: 0;
      padding-left: 1.5rem;
    }

    .next-steps li {
      margin-bottom: 0.5rem;
      line-height: 1.5;
    }

    .invitation-actions {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn {
      padding: 0.75rem 2rem;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      font-size: 1rem;
    }

    .btn-secondary {
      background: #667eea;
      color: white;
    }

    .btn-secondary:hover {
      background: #5a67d8;
      transform: translateY(-1px);
    }

    .btn-outline {
      background: transparent;
      color: #667eea;
      border: 2px solid #667eea;
    }

    .btn-outline:hover {
      background: #667eea;
      color: white;
    }

    .additional-info {
      border-top: 1px solid #e2e8f0;
      padding-top: 1.5rem;
    }

    .text-muted {
      color: #718096;
      font-size: 0.9rem;
      margin: 0;
    }

    @media (max-width: 768px) {
      .invitation-pending-container {
        padding: 1rem;
      }

      .invitation-card {
        padding: 2rem;
      }

      .invitation-info h1 {
        font-size: 2rem;
      }

      .invitation-actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  `]
})
export class InvitationPendingComponent {
  @Input() companyName?: string;
  @Input() ownerEmail?: string;
  @Input() message?: string;

  constructor(private router: Router) { }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  registerNewCompany() {
    this.router.navigate(['/register']);
  }
}
