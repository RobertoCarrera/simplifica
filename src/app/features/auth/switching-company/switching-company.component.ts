import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-switching-company',
  standalone: true,
  template: `
    <div class="flex items-center justify-center min-h-screen bg-gray-100">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 class="text-2xl font-semibold text-gray-700">Cambiando de empresa...</h2>
        <p class="text-gray-500">Por favor, espera un momento.</p>
      </div>
    </div>
  `,
})
export class SwitchingCompanyComponent implements OnInit {
  private router = inject(Router);

  ngOnInit(): void {
    // This brief timeout ensures the view has a moment to render before redirecting,
    // giving feedback to the user. Then, it navigates to the home/dashboard.
    // This navigation will re-trigger guards and resolvers with the new company context.
    setTimeout(() => {
      this.router.navigate(['/inicio']);
    }, 50);
  }
}
