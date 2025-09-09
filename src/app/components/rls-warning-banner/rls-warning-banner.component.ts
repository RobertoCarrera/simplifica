import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-rls-warning-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showBanner()) {
      <div class="rls-warning-banner">
        <div class="banner-content">
          <div class="icon">⚠️</div>
          <div class="message">
            <strong>Configuración de Base de Datos Requerida</strong>
            <p>Se detectaron problemas de RLS. <a href="/debug" class="link">Ver Debug Dashboard</a> o consulta <code>FIX_RLS_URGENTE.md</code></p>
          </div>
          <button class="close-btn" (click)="hideBanner()">×</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .rls-warning-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: linear-gradient(90deg, #f59e0b, #d97706);
      color: white;
      padding: 1rem;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    .banner-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }

    .message {
      flex: 1;
      
      strong {
        display: block;
        font-weight: 600;
        margin-bottom: 0.25rem;
      }
      
      p {
        margin: 0;
        font-size: 0.9rem;
        opacity: 0.9;
      }
    }

    .link {
      color: white;
      text-decoration: underline;
      font-weight: 500;
    }

    .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .close-btn:hover {
      opacity: 1;
    }

    code {
      background: rgba(255,255,255,0.2);
      padding: 0.125rem 0.25rem;
      border-radius: 3px;
      font-family: monospace;
      font-size: 0.85em;
    }
  `]
})
export class RlsWarningBannerComponent implements OnInit {
  authService = inject(AuthService);
  showBanner = signal(false);

  ngOnInit() {
    this.checkForRlsIssues();
  }

  private async checkForRlsIssues() {
    // Esperar un poco para que la app se estabilice
    setTimeout(async () => {
      try {
        // Intentar una consulta simple
        const { data, error } = await this.authService.client
          .from('users')
          .select('id')
          .limit(1);
        
        // Si hay error relacionado con RLS, mostrar banner
        if (error && (
          error.message.includes('infinite recursion') ||
          error.message.includes('Internal Server Error') ||
          error.code === '42P17'
        )) {
          this.showBanner.set(true);
          console.warn('🚨 RLS Issues detected - showing warning banner');
        }
      } catch (e) {
        console.error('Error checking RLS status:', e);
        // En caso de error inesperado, también mostrar banner
        this.showBanner.set(true);
      }
    }, 2000);
  }

  hideBanner() {
    this.showBanner.set(false);
    // Guardar en localStorage que el usuario ha visto el banner
    localStorage.setItem('rls-banner-dismissed', 'true');
  }
}
