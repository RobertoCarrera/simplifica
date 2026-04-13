import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ticket-services-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe],
  template: `
    <div class="tab-content-animate">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
          Servicios Asignados
        </h3>
        @if (!isClient) {
          <button
            (click)="modifyServicesClick.emit()"
            class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <i class="fas fa-wrench mr-2"></i>
            Modificar Servicios
          </button>
        }
      </div>
      @if (ticketServices.length === 0) {
        <div class="text-center py-12 text-gray-500 dark:text-gray-400">
          <i class="fas fa-wrench text-5xl mb-4 opacity-50"></i>
          <p class="text-lg">No hay servicios asignados a este ticket</p>
          @if (!isClient) {
            <button
              (click)="modifyServicesClick.emit()"
              class="mt-4 inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <i class="fas fa-plus mr-2"></i>
              Añadir Servicios
            </button>
          }
        </div>
      }
      @if (ticketServices.length > 0) {
        <div class="space-y-4">
          @for (serviceItem of ticketServices; track serviceItem) {
            <div
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200"
            >
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <h4 class="font-medium text-gray-900 dark:text-gray-100">
                    {{ serviceItem.service?.name || 'Servicio no especificado' }}
                  </h4>
                  @if (serviceItem.service?.description) {
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {{ serviceItem.service.description }}
                    </p>
                  }
                  <div
                    class="mt-2 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400"
                  >
                    <span
                      ><i class="fas fa-boxes w-4"></i> Cantidad:
                      {{ serviceItem.quantity }}</span
                    >
                    @if (serviceItem.service?.category_name || serviceItem.service?.category) {
                      <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      >
                        <i class="fas fa-tag w-3"></i>
                        {{
                          serviceItem.service?.category_name ||
                            serviceItem.service?.category ||
                            'Sin categoría'
                        }}
                      </span>
                    }
                  </div>
                </div>
                <div class="text-right">
                  <p class="font-medium text-gray-900 dark:text-gray-100">
                    {{ serviceItem.service?.base_price | currency:'EUR':'symbol':'1.2-2' }}
                  </p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Total: {{ (serviceItem.service?.base_price || 0) * serviceItem.quantity | currency:'EUR':'symbol':'1.2-2' }}
                  </p>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class TicketServicesPanelComponent {
  @Input() ticketServices: any[] = [];
  @Input() isClient: boolean = false;

  @Output() modifyServicesClick = new EventEmitter<void>();
}
