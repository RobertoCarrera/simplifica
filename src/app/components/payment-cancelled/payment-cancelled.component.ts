import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-payment-cancelled',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <!-- Cancel icon -->
        <div class="w-20 h-20 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Pago cancelado</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Has cancelado el proceso de pago. No se ha realizado ningún cargo.
        </p>

        <div class="flex flex-col gap-3">
          <button 
            (click)="retry()"
            class="w-full py-3 px-4 rounded-lg font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors">
            Intentar de nuevo
          </button>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Si tienes problemas, contacta con el emisor de la factura.
          </p>
        </div>
      </div>
    </div>
  `
})
export class PaymentCancelledComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  retry() {
    const token = this.route.snapshot.paramMap.get('token');
    if (token) {
      this.router.navigate(['/pago', token]);
    }
  }
}
