import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Device } from '../../../../services/devices.service';

@Component({
  selector: 'app-ticket-devices-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="tab-content-animate">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
          Dispositivos Vinculados
        </h3>
        <div class="flex items-center gap-4">
          @if (!isClient) {
            <label
              class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                [checked]="showDeletedDevices"
                (change)="toggleDeletedDevicesChange.emit()"
                class="form-checkbox rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700"
              />
              Ver eliminados
            </label>
          }
          @if (!isClient) {
            <button
              (click)="modifyDevicesClick.emit()"
              class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <i class="fas fa-mobile-alt mr-2"></i>
              Modificar Dispositivos
            </button>
          }
        </div>
      </div>
      @if (ticketDevices.length === 0) {
        <div class="text-center py-12 text-gray-500 dark:text-gray-400">
          <i class="fas fa-mobile-alt text-5xl mb-4 opacity-50"></i>
          <p class="text-lg">No hay dispositivos vinculados a este ticket</p>
        </div>
      }
      @if (ticketDevices.length > 0) {
        <div class="space-y-4">
          @for (device of ticketDevices; track device) {
            <div
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex justify-between items-start hover:shadow-md dark:hover:shadow-lg hover:border-green-300 dark:hover:border-green-700 transition-all duration-200"
            >
              <div class="flex-1">
                <div class="flex items-center space-x-2">
                  <h4 class="font-medium text-gray-900 dark:text-gray-100">
                    {{ device.brand }} {{ device.model }}
                  </h4>
                  @if (isDeviceLinked(device.id)) {
                    <span
                      class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded"
                      >Vinculado</span
                    >
                  }
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {{ device.device_type }}
                </p>
                @if (device.imei) {
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    IMEI: {{ device.imei }}
                  </p>
                }
                @if (device.color) {
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    Color: {{ device.color }}
                  </p>
                }
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  <span class="font-medium">Problema reportado:</span>
                  {{ device.reported_issue }}
                </p>
                <!-- Device Images -->
                @if (device.media?.length) {
                  <div class="mt-3">
                    <h5
                      class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2"
                    >
                      Imágenes adjuntas:
                    </h5>
                    <div class="flex flex-wrap gap-2">
                      @for (media of device.media; track media) {
                        <div
                          class="relative group cursor-pointer"
                        >
                          <div
                            class="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-colors"
                          >
                            <img
                              [src]="media.file_url"
                              [alt]="media.description || 'Imagen del dispositivo'"
                              class="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
              <div class="flex flex-col items-end gap-2">
                <div class="text-right">
                  <span
                    [class]="getDeviceStatusClass(device.status)"
                    class="inline-block px-2 py-1 text-xs font-medium rounded"
                  >
                    {{ getDeviceStatusLabel(device.status) }}
                  </span>
                  @if (device.deleted_at) {
                    <p class="text-xs text-red-500 font-medium mt-1">ELIMINADO</p>
                  }
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {{ device.received_at | date:'mediumDate' }}
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
export class TicketDevicesPanelComponent {
  @Input() ticketDevices: Device[] = [];
  @Input() isClient: boolean = false;
  @Input() showDeletedDevices: boolean = false;

  @Output() modifyDevicesClick = new EventEmitter<void>();
  @Output() toggleDeletedDevicesChange = new EventEmitter<void>();

  linkedDeviceIds: Set<string> = new Set();

  isDeviceLinked(deviceId: string): boolean {
    return this.linkedDeviceIds.has(deviceId);
  }

  getDeviceStatusClass(status?: string): string {
    const base = 'px-2 py-1 text-xs font-medium rounded';
    switch (status) {
      case 'received':
        return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`;
      case 'in_progress':
        return `${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300`;
      case 'waiting_parts':
        return `${base} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`;
      case 'ready':
        return `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
      case 'delivered':
        return `${base} bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300`;
      default:
        return `${base} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`;
    }
  }

  getDeviceStatusLabel(status?: string): string {
    switch (status) {
      case 'received':
        return 'Recibido';
      case 'in_progress':
        return 'En proceso';
      case 'waiting_parts':
        return 'Esperando piezas';
      case 'ready':
        return 'Listo';
      case 'delivered':
        return 'Entregado';
      default:
        return status || 'Desconocido';
    }
  }
}
