import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <!-- Success animation -->
        <div class="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6 animate-bounce-slow">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">¡Pago completado!</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Tu pago ha sido procesado correctamente. Recibirás una confirmación por email en breve.
        </p>

        <!-- Payment details if available -->
        <div *ngIf="invoiceNumber()" class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
          <p class="text-sm text-gray-600 dark:text-gray-400">Factura pagada</p>
          <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ invoiceNumber() }}</p>
        </div>

        <p class="text-sm text-gray-500 dark:text-gray-400">
          Gracias por tu confianza. Puedes cerrar esta ventana.
        </p>
      </div>
    </div>
  `,
  styles: [`
    @keyframes bounce-slow {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .animate-bounce-slow {
      animation: bounce-slow 2s ease-in-out infinite;
    }
  `]
})
export class PaymentSuccessComponent implements OnInit {
  private route = inject(ActivatedRoute);
  invoiceNumber = signal<string | null>(null);

  ngOnInit(): void {
    // Try to get invoice info from query params if available
    const token = this.route.snapshot.paramMap.get('token');
    // We could fetch invoice details here if needed
  }
}
