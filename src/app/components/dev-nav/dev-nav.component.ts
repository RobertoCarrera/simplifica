import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-dev-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dev-nav" [class.hidden]="!showNav">
      <button 
        class="nav-toggle"
        (click)="toggleNav()"
        [attr.aria-label]="showNav ? 'Ocultar navegación de desarrollo' : 'Mostrar navegación de desarrollo'"
      >
        {{ showNav ? '✖️' : '🛠️' }}
      </button>
      
      <nav class="nav-menu" *ngIf="showNav">
        <h3>🚀 Demo Navigation</h3>
        <div class="nav-links">
          <a routerLink="/clientes" routerLinkActive="active" class="nav-link">
            👥 Clientes (Supabase)
          </a>
          <a routerLink="/animaciones" routerLinkActive="active" class="nav-link">
            🎬 Animation Showcase
          </a>
          <a routerLink="/mobile" routerLinkActive="active" class="nav-link">
            📱 Mobile Dashboard
          </a>
          <a routerLink="/notifications" routerLinkActive="active" class="nav-link">
            🔔 Notifications
          </a>
          <a routerLink="/demo" routerLinkActive="active" class="nav-link">
            🧪 Components Demo
          </a>
        </div>
      </nav>
    </div>
  `,
  styles: [`
    .dev-nav {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      font-family: system-ui, sans-serif;
    }

    .nav-toggle {
      position: absolute;
      top: 0;
      right: 0;
      width: 50px;
      height: 50px;
      border: none;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-size: 18px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .nav-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    }

    .nav-menu {
      position: absolute;
      top: 60px;
      right: 0;
      min-width: 280px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
      padding: 20px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease-out;
    }

    .nav-menu h3 {
      margin: 0 0 15px 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      text-align: center;
      padding-bottom: 10px;
      border-bottom: 2px solid #f0f0f0;
    }

    .nav-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .nav-link {
      display: block;
      padding: 12px 16px;
      text-decoration: none;
      color: #555;
      border-radius: 8px;
      transition: all 0.2s ease;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid transparent;
    }

    .nav-link:hover {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      transform: translateX(4px);
      text-decoration: none;
    }

    .nav-link.active {
      background: #f8f9fa;
      color: #667eea;
      border-color: #667eea;
      font-weight: 600;
    }

    .hidden .nav-toggle {
      opacity: 0.7;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 768px) {
      .dev-nav {
        top: 10px;
        right: 10px;
      }

      .nav-toggle {
        width: 45px;
        height: 45px;
        font-size: 16px;
      }

      .nav-menu {
        min-width: 250px;
        right: -10px;
      }
    }

    /* Ocultar en producción */
    @media (prefers-reduced-motion: reduce) {
      .nav-menu {
        animation: none;
      }
      
      .nav-link:hover {
        transform: none;
      }
    }

    /* Modo oscuro */
    @media (prefers-color-scheme: dark) {
      .nav-menu {
        background: #1f2937;
        border-color: #374151;
      }

      .nav-menu h3 {
        color: #f9fafb;
        border-bottom-color: #374151;
      }

      .nav-link {
        color: #d1d5db;
      }

      .nav-link.active {
        background: #374151;
        color: #60a5fa;
        border-color: #60a5fa;
      }
    }
  `]
})
export class DevNavComponent {
  showNav = false;

  toggleNav() {
    this.showNav = !this.showNav;
  }
}
