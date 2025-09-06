import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-test-simple',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6">
      <h1 class="text-2xl font-bold text-red-600">🚨 COMPONENTE DE PRUEBA FUNCIONANDO</h1>
      <p>Si ves este mensaje, Angular está funcionando correctamente.</p>
      <p>Timestamp: {{ timestamp }}</p>
    </div>
  `
})
export class TestSimpleComponent {
  timestamp = new Date().toISOString();
}
