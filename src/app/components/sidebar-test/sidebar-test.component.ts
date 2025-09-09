import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-sidebar-test',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="container-fluid">
      <div class="row">
        <div class="col-3 bg-primary text-white vh-100 p-3">
          <h5>🎯 Sidebar de Producción</h5>
          <ul class="list-unstyled">
            <li class="mb-2">
              <a href="#" class="text-white text-decoration-none">
                <i class="bi bi-house me-2"></i>Inicio
              </a>
            </li>
            <li class="mb-2">
              <a href="#" class="text-white text-decoration-none">
                <i class="bi bi-person-fill me-2"></i>Clientes
              </a>
            </li>
            <li class="mb-2">
              <a href="#" class="text-white text-decoration-none">
                <i class="bi bi-person-raised-hand me-2"></i>Tickets
              </a>
            </li>
            <li class="mb-2">
              <a href="#" class="text-white text-decoration-none">
                <i class="bi bi-ticket me-2"></i>Servicios
              </a>
            </li>
            <li class="mb-2">
              <a href="#" class="text-white text-decoration-none">
                <i class="bi bi-gear me-2"></i>Configuración
              </a>
            </li>
          </ul>
          
          <hr class="my-3">
          
          <div class="mt-auto">
            <small class="text-light">Usuario: Demo</small><br>
            <small class="text-light">Empresa: Test Company</small>
            <button class="btn btn-outline-light btn-sm mt-2 w-100">
              <i class="bi bi-door-open me-2"></i>Cerrar Sesión
            </button>
          </div>
        </div>
        
        <div class="col-9 p-4">
          <h2>✅ Sidebar Funcionando Correctamente</h2>
          <p>Esta es la nueva sidebar para producción con:</p>
          <ul>
            <li>✅ Solo enlaces principales visibles</li>
            <li>✅ Botón de logout en la parte inferior</li>
            <li>✅ Información del usuario</li>
            <li>✅ Enlaces de desarrollo ocultos (se muestran solo en local)</li>
          </ul>
          
          <div class="alert alert-success">
            <strong>🎉 ¡Perfecto!</strong> La sidebar está lista para producción.
            Los cambios se aplicarán automáticamente cuando estés autenticado.
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .vh-100 {
      min-height: 100vh;
    }
    
    a:hover {
      background-color: rgba(255,255,255,0.1);
      border-radius: 4px;
      padding: 4px 8px;
      transition: all 0.3s ease;
    }
  `]
})
export class SidebarTestComponent {
}
