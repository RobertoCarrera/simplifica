import { Component, OnInit, inject, signal } from '@angular/core';

import { RouterModule, Router } from '@angular/router';
import { HoldedIntegrationService } from '../../../services/holded-integration.service';

type InvoiceTab = 'facturas' | 'recurrentes';

@Component({
  selector: 'app-invoices-container',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div class="p-4 md:p-6 space-y-6">

      <!-- Holded active banner -->
      @if (holdedService.isActive()) {
        <div
          class="flex items-start gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl text-sm text-blue-800 dark:text-blue-300"
        >
          <span class="text-lg font-extrabold leading-none flex-shrink-0 mt-0.5">H</span>
          <div>
            <span class="font-semibold">Holded activo</span> — La facturación está gestionada por Holded.
            Los recibos de venta se generan automáticamente con cada reserva confirmada.
            <a
              href="https://app.holded.com"
              target="_blank"
              rel="noopener noreferrer"
              class="ml-1 underline hover:text-blue-600 dark:hover:text-blue-200 whitespace-nowrap"
            >Abrir Holded →</a>
          </div>
        </div>
      }

      <!-- Modern Tab Navigation -->
      <div
        class="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-100 dark:border-slate-700 p-1.5"
      >
        <nav class="flex gap-1" role="tablist">
          <!-- Tab: Facturas -->
          <button
            (click)="navigateToTab('facturas')"
            role="tab"
            [attr.aria-selected]="activeTab() === 'facturas'"
            class="tab-button flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200"
            [class]="
              activeTab() === 'facturas'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/30'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-white'
            "
          >
            <i class="fas fa-file-invoice text-sm"></i>
            <span>Facturas</span>
          </button>

          <!-- Tab: Recurrentes -->
          <button
            (click)="navigateToTab('recurrentes')"
            role="tab"
            [attr.aria-selected]="activeTab() === 'recurrentes'"
            class="tab-button flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200"
            [class]="
              activeTab() === 'recurrentes'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/30'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-white'
            "
          >
            <i class="fas fa-sync-alt text-sm"></i>
            <span>Recurrentes</span>
          </button>
        </nav>
      </div>

      <!-- Content area - router outlet -->
      <div class="tab-content-enter">
        <router-outlet></router-outlet>
      </div>
    </div>
  `,
  styles: [
    `
      // Modern Tab Navigation
      .tab-button {
        position: relative;
        overflow: hidden;

        &::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        &:hover::before {
          opacity: 1;
        }

        &:active {
          transform: scale(0.98);
        }
      }

      // Tab content animation
      .tab-content-enter {
        animation: tabFadeIn 0.3s ease-out;
      }

      @keyframes tabFadeIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
})
export class InvoicesContainerComponent implements OnInit {
  holdedService = inject(HoldedIntegrationService);
  activeTab = signal<InvoiceTab>('facturas');

  constructor(private router: Router) {
    // Detectar la ruta activa para establecer el tab correcto
    const currentUrl = this.router.url;
    if (currentUrl.includes('/recurrente')) {
      this.activeTab.set('recurrentes');
    } else {
      this.activeTab.set('facturas');
    }
  }

  ngOnInit(): void {
    this.holdedService.loadIntegration();
  }

  navigateToTab(tab: InvoiceTab): void {
    this.activeTab.set(tab);
    if (tab === 'facturas') {
      this.router.navigate(['/facturacion']);
    } else if (tab === 'recurrentes') {
      this.router.navigate(['/facturacion/recurrente']);
    }
  }
}
